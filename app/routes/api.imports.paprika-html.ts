/**
 * POST /api/imports/paprika-html
 *
 * Batch-inserts parsed Paprika HTML recipe data into D1.
 * The client unzips the HTML export archive with fflate, parses each HTML
 * file with parsePaprikaHtml(), then sends text-only batches here.
 *
 * Request body: { recipes: PaprikaHtmlRecipe[], jobId?: string, expectedTotal?: number }
 * Response:     { jobId, imported, skipped, errors }
 */

import { and, eq, inArray, isNull, sql } from "drizzle-orm";
import type { Route } from "./+types/api.imports.paprika-html";
import { requireUser } from "~/lib/auth.server";
import { createDb, schema } from "~/db";
import { parseIngredientLine } from "~/lib/ingredient-parser";
import { parseDuration, parseTimeString } from "~/lib/time-parser";
import { normaliseDifficulty, parseServings } from "~/lib/paprika-binary-parser";
import type { PaprikaHtmlRecipe } from "~/lib/paprika-html-parser";

// ─── Helpers ──────────────────────────────────────────────────────────────────

function generateSlug(title: string): string {
  return title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 100);
}

async function sha256(text: string): Promise<string> {
  const buf = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(text)
  );
  return Array.from(new Uint8Array(buf))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

function normalise(s: string | null | undefined): string | null {
  const t = s?.trim();
  return t || null;
}

/**
 * Resolve prep/active/total minutes from the raw HTML time strings.
 *
 * Paprika HTML exports can have:
 *   - Normal fields:  prepTime="10 mins", cookTime="25 mins"
 *   - Bug variant:    cookTime="undefinedACTIVE TIME: 40 minutes, TOTAL TIME: 1 hour 30 minutes"
 *
 * The time-parser's stripUndefinedPrefix + parseTimeString handles both.
 */
function resolveTimings(
  prepTimeRaw: string | null,
  cookTimeRaw: string | null
): {
  prepTimeMin: number | null;
  activeTimeMin: number | null;
  totalTimeMin: number | null;
  timeNotes: string | null;
} {
  const notes: string[] = [];

  // cookTime may contain the "undefined" bug with labeled time data
  if (cookTimeRaw && /ACTIVE TIME|TOTAL TIME|PREP TIME/i.test(cookTimeRaw)) {
    const parsed = parseTimeString(cookTimeRaw);
    const prepFromPrep = prepTimeRaw ? parseDuration(prepTimeRaw) : null;
    return {
      prepTimeMin: parsed.prep_min ?? prepFromPrep,
      activeTimeMin: parsed.active_min,
      totalTimeMin: parsed.total_min,
      timeNotes: parsed.time_notes,
    };
  }

  const prepTimeMin = prepTimeRaw ? parseDuration(prepTimeRaw) : null;
  const activeTimeMin = cookTimeRaw ? parseDuration(cookTimeRaw) : null;

  if (prepTimeRaw && prepTimeMin === null) notes.push(`Prep: ${prepTimeRaw}`);
  if (cookTimeRaw && activeTimeMin === null) notes.push(`Cook: ${cookTimeRaw}`);

  return {
    prepTimeMin,
    activeTimeMin,
    totalTimeMin: null,
    timeNotes: notes.length ? notes.join(", ") : null,
  };
}

// ─── Types ────────────────────────────────────────────────────────────────────

type BatchPayload = {
  recipes: PaprikaHtmlRecipe[];
  jobId?: string;
  expectedTotal?: number;
};

type BatchResult = {
  jobId: string;
  imported: number;
  skipped: number;
  errors: string[];
};

// ─── Action ───────────────────────────────────────────────────────────────────

export async function action({ request, context }: Route.ActionArgs): Promise<Response> {
  if (request.method !== "POST") {
    return new Response("Method Not Allowed", { status: 405 });
  }

  const user = await requireUser(request, context);
  const { db } = createDb(context.cloudflare.env.DB);

  let payload: BatchPayload;
  try {
    payload = (await request.json()) as BatchPayload;
  } catch {
    return Response.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const { recipes, jobId: incomingJobId, expectedTotal } = payload;
  if (!Array.isArray(recipes) || recipes.length === 0) {
    return Response.json({ error: "No recipes in payload" }, { status: 400 });
  }

  const errors: string[] = [];
  let imported = 0;
  let skipped = 0;

  // ── Create or fetch import_job ────────────────────────────────────────────
  let jobId = incomingJobId ?? "";
  if (!jobId) {
    jobId = crypto.randomUUID();
    await db.insert(schema.importJobs).values({
      id: jobId,
      userId: user.id,
      status: "processing",
      sourceType: "paprika_html",
      recipeCountExpected: expectedTotal ?? recipes.length,
      recipeCountImported: 0,
      startedAt: new Date(),
    });
  }

  // ── Dedup: collect existing paprika_original_ids (filenames) for this user ─
  const existingRows = await db
    .select({ paprikaId: schema.recipes.paprikaOriginalId })
    .from(schema.recipes)
    .where(and(eq(schema.recipes.userId, user.id), isNull(schema.recipes.deletedAt)));
  const existingIds = new Set(
    existingRows.map((r) => r.paprikaId).filter(Boolean)
  );

  // ── Upsert all unique tag names in one pass ───────────────────────────────
  const allTagNames = new Set<string>();
  for (const r of recipes) {
    for (const cat of r.categories) {
      const t = cat.trim();
      if (t) allTagNames.add(t);
    }
  }
  if (allTagNames.size > 0) {
    const tagInserts = Array.from(allTagNames).map((name) => ({
      id: crypto.randomUUID(),
      userId: user.id,
      name,
    }));
    for (let i = 0; i < tagInserts.length; i += 100) {
      await db.insert(schema.tags).values(tagInserts.slice(i, i + 100)).onConflictDoNothing();
    }
  }

  const tagNameList = Array.from(allTagNames);
  const tagIdMap = new Map<string, string>();
  for (let i = 0; i < tagNameList.length; i += 100) {
    const chunk = tagNameList.slice(i, i + 100);
    const rows = await db
      .select({ id: schema.tags.id, name: schema.tags.name })
      .from(schema.tags)
      .where(and(eq(schema.tags.userId, user.id), inArray(schema.tags.name, chunk)));
    for (const row of rows) tagIdMap.set(row.name, row.id);
  }

  // ── Pre-load existing slugs ────────────────────────────────────────────────
  const existingSlugRows = await db
    .select({ slug: schema.recipes.slug })
    .from(schema.recipes)
    .where(and(eq(schema.recipes.userId, user.id), isNull(schema.recipes.deletedAt)));
  const usedSlugs = new Set(existingSlugRows.map((r) => r.slug));

  // ── Build insert arrays ────────────────────────────────────────────────────
  type RecipeRow = typeof schema.recipes.$inferInsert;
  type IngredientRow = typeof schema.ingredients.$inferInsert;
  type RecipeTagRow = typeof schema.recipeTags.$inferInsert;

  const recipeRows: RecipeRow[] = [];
  const ingredientRows: IngredientRow[] = [];
  const recipeTagRows: RecipeTagRow[] = [];

  for (const raw of recipes) {
    const dedupeKey = raw.filename;
    if (!raw.title || !dedupeKey) {
      errors.push(`Recipe missing title or filename — skipped`);
      continue;
    }
    if (existingIds.has(dedupeKey)) {
      skipped++;
      continue;
    }

    const recipeId = crypto.randomUUID();

    // Slug dedup
    const base = generateSlug(raw.title);
    let slug = base;
    let n = 2;
    while (usedSlugs.has(slug)) slug = `${base}-${n++}`;
    usedSlugs.add(slug);

    // Time resolution
    const { prepTimeMin, activeTimeMin, totalTimeMin, timeNotes } = resolveTimings(
      raw.prepTime,
      raw.cookTime
    );

    // Servings
    const { servings, servingsUnit } = parseServings(raw.servings ?? "");

    recipeRows.push({
      id: recipeId,
      userId: user.id,
      title: raw.title,
      slug,
      description: normalise(raw.description),
      sourceUrl: normalise(raw.sourceUrl),
      sourceType: "paprika_html",
      prepTimeMin,
      activeTimeMin,
      totalTimeMin,
      timeNotes,
      servings,
      servingsUnit,
      difficulty: normaliseDifficulty(raw.difficulty ?? "") ?? normalise(raw.difficulty),
      directionsText: raw.directions?.trim() ?? "",
      notes: normalise(raw.notes),
      imageSourceUrl: normalise(raw.imageSourceUrl),
      imageAlt: raw.sourceAttribution ? `Photo from ${raw.sourceAttribution}` : null,
      rating: raw.rating > 0 ? raw.rating : null,
      paprikaOriginalId: dedupeKey,
      importJobId: jobId,
      importedAt: new Date(),
      variantType: "original",
    });

    // Ingredients
    for (let i = 0; i < raw.ingredients.length; i++) {
      const { text, strongToken } = raw.ingredients[i];
      const p = parseIngredientLine(text, strongToken);
      ingredientRows.push({
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
      });
    }

    // Tags
    for (const cat of raw.categories) {
      const tagId = tagIdMap.get(cat.trim());
      if (tagId) recipeTagRows.push({ recipeId, tagId });
    }
  }

  // ── Content hashes ─────────────────────────────────────────────────────────
  await Promise.all(
    recipeRows.map(async (row) => {
      const names = ingredientRows
        .filter((r) => r.recipeId === row.id)
        .map((r) => r.name)
        .join("|");
      row.contentHash = await sha256(
        `${(row.title as string).toLowerCase()}|${names.toLowerCase()}`
      );
    })
  );

  // ── Chunked inserts ────────────────────────────────────────────────────────
  // recipes: ~25 cols → 30 rows/statement
  // ingredients: ~12 cols → 80 rows/statement
  // recipe_tags: 2 cols → 200 rows/statement
  const RECIPE_CHUNK = 30;
  const INGREDIENT_CHUNK = 80;
  const TAG_CHUNK = 200;

  for (let i = 0; i < recipeRows.length; i += RECIPE_CHUNK) {
    const chunk = recipeRows.slice(i, i + RECIPE_CHUNK);
    try {
      await db.insert(schema.recipes).values(chunk);
      imported += chunk.length;
    } catch (err) {
      errors.push(`Recipe insert ${i}–${i + chunk.length} failed: ${String(err)}`);
    }
  }

  for (let i = 0; i < ingredientRows.length; i += INGREDIENT_CHUNK) {
    const chunk = ingredientRows.slice(i, i + INGREDIENT_CHUNK);
    try {
      await db.insert(schema.ingredients).values(chunk);
    } catch (err) {
      errors.push(`Ingredient insert ${i}–${i + chunk.length} failed: ${String(err)}`);
    }
  }

  for (let i = 0; i < recipeTagRows.length; i += TAG_CHUNK) {
    const chunk = recipeTagRows.slice(i, i + TAG_CHUNK);
    try {
      await db.insert(schema.recipeTags).values(chunk).onConflictDoNothing();
    } catch (err) {
      errors.push(`Tag-link insert ${i}–${i + chunk.length} failed: ${String(err)}`);
    }
  }

  // ── Update job status ──────────────────────────────────────────────────────
  await db
    .update(schema.importJobs)
    .set({
      status: "completed",
      recipeCountImported: sql`${schema.importJobs.recipeCountImported} + ${imported}`,
      completedAt: new Date(),
    })
    .where(eq(schema.importJobs.id, jobId));

  const result: BatchResult = { jobId, imported, skipped, errors };
  return Response.json(result);
}
