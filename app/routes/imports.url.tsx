/**
 * /imports/url
 *
 * URL recipe scraper import page.
 * Structured-data pipeline: JSON-LD → microdata heuristics.
 * Paywall or extraction failure → shows paste-HTML fallback textarea.
 * Rate limit: 20 URL scrapes per user per day (tracked via import_jobs).
 */

import { useState } from "react";
import { Form, Link, useActionData, useNavigation } from "react-router";
import { redirect } from "react-router";
import { and, eq, inArray, isNull, sql } from "drizzle-orm";
import type { Route } from "./+types/imports.url";
import { requireUser } from "~/lib/auth.server";
import { createDb, schema } from "~/db";
import { parseIngredientLine } from "~/lib/ingredient-parser";
import { parseDuration, parseTimeString } from "~/lib/time-parser";
import { parseServings } from "~/lib/paprika-binary-parser";
import { scrapeHtml, detectPaywall } from "~/lib/url-scraper";

// ─── Constants ────────────────────────────────────────────────────────────────

const RATE_LIMIT_PER_DAY = 20;
const SCRAPER_UA = "Mozilla/5.0 (compatible; ProjectSpice/1.0; +https://spice.h6nk.dev)";

// ─── Helpers ─────────────────────────────────────────────────────────────────

function generateSlug(title: string): string {
  return title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 100);
}

async function sha256(text: string): Promise<string> {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return Array.from(new Uint8Array(buf))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

function isGroupHeaderLine(line: string): boolean {
  const t = line.trim();
  if (!t) return false;
  if (t.endsWith(":") && !/^[\d⅛¼⅓⅜½⅝⅔¾⅞]/.test(t)) return true;
  if (/^[A-Z][A-Z\s]{2,}$/.test(t)) return true;
  return false;
}

async function downloadImageToR2(
  imageUrl: string,
  recipeId: string,
  r2: R2Bucket
): Promise<string | null> {
  try {
    const resp = await fetch(imageUrl, { headers: { "User-Agent": SCRAPER_UA } });
    if (!resp.ok) return null;
    const contentType = resp.headers.get("content-type") || "image/jpeg";
    const ext = contentType.includes("png") ? "png" : contentType.includes("webp") ? "webp" : "jpg";
    const key = `recipes/${recipeId}/hero.${ext}`;
    const body = await resp.arrayBuffer();
    await r2.put(key, body, { httpMetadata: { contentType } });
    return key;
  } catch {
    return null;
  }
}

function resolveTimings(prepRaw: string | null, cookRaw: string | null, totalRaw: string | null) {
  const prepTimeMin = prepRaw ? parseDuration(prepRaw) : null;
  const cookTimeMin = cookRaw ? parseDuration(cookRaw) : null;
  const totalTimeMin = totalRaw ? parseDuration(totalRaw) : null;

  // If any raw field uses a labeled format (from scraper fallback), parse it
  const combined = [prepRaw, cookRaw, totalRaw].filter(Boolean).join(", ");
  if (/ACTIVE TIME|TOTAL TIME|PREP TIME/i.test(combined)) {
    const parsed = parseTimeString(combined);
    return {
      prepTimeMin: parsed.prep_min ?? prepTimeMin,
      activeTimeMin: parsed.active_min ?? cookTimeMin,
      totalTimeMin: parsed.total_min ?? totalTimeMin,
      timeNotes: parsed.time_notes,
    };
  }

  return {
    prepTimeMin,
    activeTimeMin: cookTimeMin,
    totalTimeMin,
    timeNotes: null,
  };
}

// ─── Core save helper (shared by both intents) ─────────────────────────────

async function saveScrapedRecipe(opts: {
  userId: string;
  sourceUrl: string;
  html: string;
  db: ReturnType<typeof createDb>["db"];
  r2: R2Bucket;
}): Promise<{ recipeId: string } | { error: string } | { paywalled: true; url: string }> {
  const { userId, sourceUrl, html, db, r2 } = opts;

  const scrapeResult = scrapeHtml(html, sourceUrl);

  if (!scrapeResult.ok) {
    if (scrapeResult.paywalled) return { paywalled: true, url: sourceUrl };
    return { error: scrapeResult.error };
  }

  const { recipe: r } = scrapeResult;
  const timings = resolveTimings(r.prepTimeRaw, r.cookTimeRaw, r.totalTimeRaw);
  const servingsParsed = r.servingsRaw ? parseServings(r.servingsRaw) : { servings: null, servingsUnit: null };

  // Dedup slugs
  const existingSlugs = await db
    .select({ slug: schema.recipes.slug })
    .from(schema.recipes)
    .where(and(eq(schema.recipes.userId, userId), isNull(schema.recipes.deletedAt)));
  const usedSlugs = new Set(existingSlugs.map((s) => s.slug));

  const base = generateSlug(r.title);
  let slug = base;
  let n = 2;
  while (usedSlugs.has(slug)) slug = `${base}-${n++}`;

  const sourceHash = await sha256(sourceUrl);
  const contentHash = await sha256(
    `${r.title.toLowerCase()}|${r.ingredients.join("|").toLowerCase()}`
  );

  const recipeId = crypto.randomUUID();

  // Download image to R2 (best-effort — never blocks save)
  const imageKey = r.imageUrl ? await downloadImageToR2(r.imageUrl, recipeId, r2) : null;

  await db.insert(schema.recipes).values({
    id: recipeId,
    userId,
    title: r.title,
    slug,
    description: r.description,
    sourceUrl,
    sourceType: "url",
    prepTimeMin: timings.prepTimeMin,
    activeTimeMin: timings.activeTimeMin,
    totalTimeMin: timings.totalTimeMin,
    timeNotes: timings.timeNotes,
    servings: servingsParsed.servings,
    servingsUnit: servingsParsed.servingsUnit,
    directionsText: r.directionsText,
    notes: r.notes,
    imageKey,
    imageSourceUrl: r.imageUrl,
    contentHash,
    sourceHash,
    importedAt: new Date(),
    variantType: "original",
  });

  if (r.ingredients.length > 0) {
    const rows = r.ingredients.map((line, i) => {
      const isHeader = isGroupHeaderLine(line);
      const p = parseIngredientLine(line, isHeader ? line : null);
      return {
        id: crypto.randomUUID(),
        recipeId,
        sortOrder: i,
        groupName: p.is_group_header ? p.name : null,
        quantityRaw: p.quantity_raw || null,
        quantityDecimal: p.quantity_decimal,
        unitRaw: p.unit_raw || null,
        unitCanonical: p.unit_canonical,
        name: p.name,
        notes: p.notes,
        weightG: p.weight_g,
        footnoteRef: p.footnote_ref,
        isGroupHeader: p.is_group_header,
      };
    });
    await db.insert(schema.ingredients).values(rows);
  }

  if (r.tags.length > 0) {
    const tagInserts = r.tags.slice(0, 20).map((name) => ({
      id: crypto.randomUUID(),
      userId,
      name,
    }));
    await db.insert(schema.tags).values(tagInserts).onConflictDoNothing();

    const tagRows = await db
      .select({ id: schema.tags.id, name: schema.tags.name })
      .from(schema.tags)
      .where(and(eq(schema.tags.userId, userId), inArray(schema.tags.name, r.tags.slice(0, 20))));
    const tagIdMap = new Map(tagRows.map((row) => [row.name, row.id]));

    const recipeTagRows: { recipeId: string; tagId: string }[] = [];
    for (const name of r.tags.slice(0, 20)) {
      const tagId = tagIdMap.get(name);
      if (tagId) recipeTagRows.push({ recipeId, tagId });
    }
    if (recipeTagRows.length > 0) {
      await db.insert(schema.recipeTags).values(recipeTagRows).onConflictDoNothing();
    }
  }

  return { recipeId };
}

// ─── Meta ─────────────────────────────────────────────────────────────────────

export function meta() {
  return [{ title: "Import from URL — ProjectSpice" }];
}

// ─── Loader ───────────────────────────────────────────────────────────────────

export async function loader({ request, context }: Route.LoaderArgs) {
  await requireUser(request, context);
  return null;
}

// ─── Action ───────────────────────────────────────────────────────────────────

type ActionResult =
  | { paywalled: true; url: string }
  | { error: string };

export async function action({ request, context }: Route.ActionArgs): Promise<Response | ActionResult> {
  const user = await requireUser(request, context);
  const { db } = createDb(context.cloudflare.env.DB);
  const r2 = context.cloudflare.env.IMAGES;

  const formData = await request.formData();
  const intent = formData.get("intent") as string;

  // ── Rate limit check ──────────────────────────────────────────────────────
  const cutoff = Date.now() - 24 * 60 * 60 * 1000;
  const countResult = await db
    .select({ count: sql<number>`count(*)` })
    .from(schema.importJobs)
    .where(
      and(
        eq(schema.importJobs.userId, user.id),
        eq(schema.importJobs.sourceType, "url"),
        sql`${schema.importJobs.startedAt} > ${cutoff}`
      )
    );
  if ((countResult[0]?.count ?? 0) >= RATE_LIMIT_PER_DAY) {
    return { error: `You've reached the limit of ${RATE_LIMIT_PER_DAY} URL imports per day. Try again tomorrow.` };
  }

  // ── Record import job ─────────────────────────────────────────────────────
  const jobId = crypto.randomUUID();
  await db.insert(schema.importJobs).values({
    id: jobId,
    userId: user.id,
    status: "processing",
    sourceType: "url",
    startedAt: new Date(),
  });

  // ── Intent: paste HTML fallback ───────────────────────────────────────────
  if (intent === "paste") {
    const pastedHtml = (formData.get("html") as string | null)?.trim() ?? "";
    const sourceUrl = (formData.get("url") as string | null)?.trim() ?? "";
    if (!pastedHtml) {
      await db.update(schema.importJobs)
        .set({ status: "failed", completedAt: new Date() })
        .where(eq(schema.importJobs.id, jobId));
      return { error: "Please paste the page HTML before submitting." };
    }

    const result = await saveScrapedRecipe({ userId: user.id, sourceUrl, html: pastedHtml, db, r2 });

    if ("error" in result) {
      await db.update(schema.importJobs).set({ status: "failed", completedAt: new Date() }).where(eq(schema.importJobs.id, jobId));
      return { error: result.error };
    }
    if ("paywalled" in result) {
      await db.update(schema.importJobs).set({ status: "failed", completedAt: new Date() }).where(eq(schema.importJobs.id, jobId));
      return { error: "Could not extract a recipe from the pasted HTML." };
    }

    await db.update(schema.importJobs)
      .set({ status: "completed", recipeCountImported: 1, completedAt: new Date() })
      .where(eq(schema.importJobs.id, jobId));
    return redirect(`/recipes/${result.recipeId}`);
  }

  // ── Intent: scrape URL ────────────────────────────────────────────────────
  const rawUrl = (formData.get("url") as string | null)?.trim() ?? "";
  if (!rawUrl) {
    await db.update(schema.importJobs).set({ status: "failed", completedAt: new Date() }).where(eq(schema.importJobs.id, jobId));
    return { error: "Please enter a URL." };
  }

  let targetUrl: string;
  try {
    targetUrl = new URL(rawUrl).toString();
  } catch {
    await db.update(schema.importJobs).set({ status: "failed", completedAt: new Date() }).where(eq(schema.importJobs.id, jobId));
    return { error: "That doesn't look like a valid URL. Include https://." };
  }

  // Fetch with a browser-like User-Agent
  let fetchResp: Response;
  try {
    fetchResp = await fetch(targetUrl, {
      headers: {
        "User-Agent": SCRAPER_UA,
        Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        "Accept-Language": "en-US,en;q=0.5",
      },
      redirect: "follow",
    });
  } catch {
    await db.update(schema.importJobs).set({ status: "failed", completedAt: new Date() }).where(eq(schema.importJobs.id, jobId));
    return { error: "Could not reach that URL. Check your connection or try again." };
  }

  const finalUrl = fetchResp.url ?? targetUrl;
  const html = await fetchResp.text();

  if (detectPaywall(fetchResp.status, finalUrl, html)) {
    await db.update(schema.importJobs).set({ status: "failed", completedAt: new Date() }).where(eq(schema.importJobs.id, jobId));
    return { paywalled: true, url: targetUrl };
  }

  const result = await saveScrapedRecipe({ userId: user.id, sourceUrl: targetUrl, html, db, r2 });

  if ("error" in result) {
    await db.update(schema.importJobs).set({ status: "failed", completedAt: new Date() }).where(eq(schema.importJobs.id, jobId));
    return { error: result.error };
  }
  if ("paywalled" in result) {
    await db.update(schema.importJobs).set({ status: "failed", completedAt: new Date() }).where(eq(schema.importJobs.id, jobId));
    return { paywalled: true, url: targetUrl };
  }

  await db.update(schema.importJobs)
    .set({ status: "completed", recipeCountImported: 1, completedAt: new Date() })
    .where(eq(schema.importJobs.id, jobId));
  return redirect(`/recipes/${result.recipeId}`);
}

// ─── Component ───────────────────────────────────────────────────────────────

export default function ImportUrl() {
  const actionData = useActionData<typeof action>();
  const navigation = useNavigation();
  const isSubmitting = navigation.state === "submitting";

  const paywalled = actionData && "paywalled" in actionData && actionData.paywalled;
  const paywallUrl = paywalled && "url" in actionData ? (actionData as { url: string }).url : "";
  const error = actionData && "error" in actionData ? (actionData as { error: string }).error : null;

  const [showPaste, setShowPaste] = useState(false);

  // When the server tells us it's paywalled, show the paste UI automatically
  const showPasteSection = paywalled || showPaste;

  return (
    <div className="min-h-screen bg-background">
      <header className="sticky top-0 z-10 bg-background/95 backdrop-blur border-b">
        <div className="max-w-2xl mx-auto px-4 h-14 flex items-center gap-3">
          <Link to="/recipes" className="text-muted-foreground hover:text-foreground text-sm">
            ← Recipes
          </Link>
          <span className="text-muted-foreground">/</span>
          <span className="font-medium text-sm">Import from URL</span>
        </div>
      </header>

      <main className="max-w-2xl mx-auto px-4 py-8 space-y-6">
        <div>
          <h1 className="text-2xl font-bold">Import from URL</h1>
          <p className="text-muted-foreground mt-1 text-sm">
            Paste a recipe URL and ProjectSpice will extract structured recipe data when
            the page provides it. For blocked or unusual pages, paste the page HTML below.
          </p>
        </div>

        {/* URL input form */}
        <Form method="post" className="space-y-4">
          <input type="hidden" name="intent" value="scrape" />
          <div className="space-y-2">
            <label htmlFor="url" className="block text-sm font-medium">
              Recipe URL
            </label>
            <input
              id="url"
              name="url"
              type="url"
              inputMode="url"
              placeholder="https://www.example.com/recipe/chocolate-chip-cookies"
              className="w-full rounded-md border bg-background px-3 py-2 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
              required
              autoFocus
            />
          </div>

          {/* Error message */}
          {error && !paywalled && (
            <div className="rounded-md bg-red-50 px-4 py-3 text-sm text-red-700">
              <p>{error}</p>
            </div>
          )}

          <div className="flex flex-wrap items-center gap-3">
            <button
              type="submit"
              disabled={isSubmitting}
              className="rounded-md bg-primary text-primary-foreground px-6 py-2.5 text-sm font-medium hover:bg-primary/90 transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
            >
              {isSubmitting && navigation.formData?.get("intent") === "scrape"
                ? "Importing…"
                : "Import Recipe"}
            </button>
            <button
              type="button"
              onClick={() => setShowPaste((v) => !v)}
              className="text-sm text-muted-foreground underline underline-offset-2 hover:text-foreground"
            >
              {showPaste ? "Hide paste option" : "Need manual paste? Use page HTML"}
            </button>
          </div>
        </Form>

        {/* Paywall banner */}
        {paywalled && (
          <div className="rounded-lg border border-amber-200 bg-amber-50 px-5 py-4 space-y-2">
            <p className="text-sm font-medium text-amber-900">This page requires a login or subscription</p>
            <p className="text-sm text-amber-800">
              Open the recipe in your browser while logged in, then use{" "}
              <strong>View Source</strong> (⌘U / Ctrl+U) to copy the full page HTML and paste it below.
            </p>
          </div>
        )}

        {/* Paste HTML fallback */}
        {showPasteSection && (
          <Form method="post" className="space-y-4">
            <input type="hidden" name="intent" value="paste" />
            {paywallUrl && <input type="hidden" name="url" value={paywallUrl} />}

            {!paywallUrl && (
              <div className="space-y-2">
                <label htmlFor="paste-url" className="block text-sm font-medium">
                  Original URL <span className="font-normal text-muted-foreground">(optional)</span>
                </label>
                <input
                  id="paste-url"
                  name="url"
                  type="url"
                  placeholder="https://www.example.com/recipe/…"
                  className="w-full rounded-md border bg-background px-3 py-2 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
                />
              </div>
            )}

            <div className="space-y-2">
              <label htmlFor="html" className="block text-sm font-medium">
                Paste raw page HTML
              </label>
              <p className="text-xs text-muted-foreground">
                In your browser: open the recipe page → View Source (⌘U / Ctrl+U) → Select All → Copy → Paste here.
              </p>
              <textarea
                id="html"
                name="html"
                rows={12}
                placeholder="Paste the full page HTML source here…"
                className="w-full rounded-md border bg-background px-3 py-2 text-sm font-mono placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring resize-y"
                required
              />
            </div>

            {error && paywalled && (
              <div className="rounded-md bg-red-50 px-4 py-3 text-sm text-red-700">
                <p>{error}</p>
              </div>
            )}

            <button
              type="submit"
              disabled={isSubmitting}
              className="rounded-md bg-primary text-primary-foreground px-6 py-2.5 text-sm font-medium hover:bg-primary/90 transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
            >
              {isSubmitting && navigation.formData?.get("intent") === "paste"
                ? "Importing…"
                : "Import from Pasted HTML"}
            </button>
          </Form>
        )}
      </main>
    </div>
  );
}
