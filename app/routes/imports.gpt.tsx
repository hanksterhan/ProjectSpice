/**
 * /imports/gpt
 *
 * GPT / AI recipe import page.
 * Paste a recipe from ChatGPT or another AI assistant, parse it via the
 * PROJECTSPICE_RECIPE_V1 strict parser, and save it to D1.
 */

import { useState } from "react";
import { Link, Form, useActionData, useNavigation } from "react-router";
import { redirect } from "react-router";
import { and, eq, inArray, isNull } from "drizzle-orm";
import type { Route } from "./+types/imports.gpt";
import { requireUser } from "~/lib/auth.server";
import { createDb, schema } from "~/db";
import { parseIngredientLine } from "~/lib/ingredient-parser";
import { parseGptRecipe } from "~/lib/gpt-recipe-parser";
import { buildImportTagNames } from "~/lib/import-tag-suggestions";

// ─── Template ─────────────────────────────────────────────────────────────────

const PROMPT_TEMPLATE = `---
PROJECTSPICE_RECIPE_V1
---

# {Recipe Title}

**Servings:** {number}
**Prep Time:** {number} min
**Cook Time:** {number} min
**Tags:** {comma-separated list or "none"}
**Source:** {URL or "original"}

## Ingredients

- {quantity} {unit} {ingredient name}[, {notes}]

## Directions

1. {Step text.}
2. {Step text.}

## Notes (optional)

{Free-form text.}`.trim();

const GPT_COPY_PROMPT = `Please write me a recipe using the following template exactly. Fill in all fields. Use "none" for Tags if there are no relevant tags. Use "original" for Source if this is an original recipe.

${PROMPT_TEMPLATE}`;

// ─── Helpers ─────────────────────────────────────────────────────────────────

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

function isGroupHeaderLine(line: string): boolean {
  const t = line.trim();
  if (!t) return false;
  if (t.endsWith(":") && !/^[\d⅛¼⅓⅜½⅝⅔¾⅞]/.test(t)) return true;
  if (/^[A-Z][A-Z\s]{2,}$/.test(t)) return true;
  return false;
}

// ─── Meta ─────────────────────────────────────────────────────────────────────

export function meta() {
  return [{ title: "Import AI-formatted recipe — ProjectSpice" }];
}

// ─── Loader ───────────────────────────────────────────────────────────────────

export async function loader({ request, context }: Route.LoaderArgs) {
  await requireUser(request, context);
  return null;
}

// ─── Action ───────────────────────────────────────────────────────────────────

type ActionError = { error: string };

export async function action({ request, context }: Route.ActionArgs): Promise<Response | ActionError> {
  const user = await requireUser(request, context);
  const { db } = createDb(context.cloudflare.env.DB);

  const formData = await request.formData();
  const content = (formData.get("content") as string | null)?.trim() ?? "";

  if (!content) {
    return { error: "Please paste a recipe before submitting." };
  }

  // ── Strict parse ────────────────────────────────────────────────────────
  const parsed = parseGptRecipe(content);

  if (!parsed || !parsed.title || parsed.ingredients.length === 0 || !parsed.directions.trim()) {
    return {
      error:
        "Could not detect the required ProjectSpice recipe format. Copy the prompt template, regenerate the recipe, and paste the full formatted result.",
    };
  }

  // ── Slug — deduplicate against DB ───────────────────────────────────────
  const existingSlugRows = await db
    .select({ slug: schema.recipes.slug })
    .from(schema.recipes)
    .where(and(eq(schema.recipes.userId, user.id), isNull(schema.recipes.deletedAt)));
  const usedSlugs = new Set(existingSlugRows.map((r) => r.slug));

  const existingTagRows = await db
    .select({ name: schema.tags.name })
    .from(schema.tags)
    .where(eq(schema.tags.userId, user.id));
  const importTagNames = buildImportTagNames({
    title: parsed.title,
    ingredients: parsed.ingredients,
    directions: parsed.directions,
    notes: parsed.notes,
    sourceTags: parsed.tags,
    existingTags: existingTagRows.map((row) => row.name),
  });

  const base = generateSlug(parsed.title);
  let slug = base;
  let n = 2;
  while (usedSlugs.has(slug)) slug = `${base}-${n++}`;

  // ── Content hash ────────────────────────────────────────────────────────
  const contentHash = await sha256(
    `${parsed.title.toLowerCase()}|${parsed.ingredients.join("|").toLowerCase()}`
  );

  // ── Recipe insert ────────────────────────────────────────────────────────
  const recipeId = crypto.randomUUID();

  await db.insert(schema.recipes).values({
    id: recipeId,
    userId: user.id,
    title: parsed.title,
    slug,
    sourceUrl: parsed.sourceUrl,
    sourceType: "gpt",
    prepTimeMin: parsed.prepTimeMin,
    activeTimeMin: parsed.cookTimeMin,
    servings: parsed.servings,
    servingsUnit: parsed.servingsUnit,
    directionsText: parsed.directions,
    notes: parsed.notes,
    contentHash,
    importedAt: new Date(),
    variantType: "original",
  });

  // ── Ingredients insert ───────────────────────────────────────────────────
  if (parsed.ingredients.length > 0) {
    const ingredientRows = parsed.ingredients.map((line, i) => {
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
    await db.insert(schema.ingredients).values(ingredientRows);
  }

  // ── Tags upsert + link ───────────────────────────────────────────────────
  if (importTagNames.length > 0) {
    const tagInserts = importTagNames.map((name) => ({
      id: crypto.randomUUID(),
      userId: user.id,
      name,
    }));
    await db.insert(schema.tags).values(tagInserts).onConflictDoNothing();

    // Query back to get real IDs
    const tagRows = await db
      .select({ id: schema.tags.id, name: schema.tags.name })
      .from(schema.tags)
      .where(
        and(
          eq(schema.tags.userId, user.id),
          inArray(schema.tags.name, importTagNames)
        )
      );
    const tagIdMap = new Map(tagRows.map((r) => [r.name, r.id]));

    const recipeTagRows: { recipeId: string; tagId: string }[] = [];
    for (const name of importTagNames) {
      const tagId = tagIdMap.get(name);
      if (tagId) recipeTagRows.push({ recipeId, tagId });
    }

    if (recipeTagRows.length > 0) {
      await db.insert(schema.recipeTags).values(recipeTagRows).onConflictDoNothing();
    }
  }

  return redirect(`/recipes/${recipeId}`);
}

// ─── Component ───────────────────────────────────────────────────────────────

export default function ImportGpt() {
  const actionData = useActionData<typeof action>();
  const navigation = useNavigation();
  const isSubmitting = navigation.state === "submitting";
  const error = actionData && "error" in actionData ? actionData.error : null;

  const [showTemplate, setShowTemplate] = useState(false);
  const [copied, setCopied] = useState(false);

  async function handleCopyPrompt() {
    try {
      await navigator.clipboard.writeText(GPT_COPY_PROMPT);
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    } catch {
      // Fallback: show template section so user can copy manually
      setShowTemplate(true);
    }
  }

  return (
    <div className="min-h-screen bg-background">
      <header className="sticky top-0 z-10 bg-background/95 backdrop-blur border-b">
        <div className="max-w-2xl mx-auto px-4 h-14 flex items-center gap-3">
          <Link to="/recipes" className="text-muted-foreground hover:text-foreground text-sm">
            ← Recipes
          </Link>
          <span className="text-muted-foreground">/</span>
          <span className="font-medium text-sm">Import AI-formatted recipe</span>
        </div>
      </header>

      <main className="max-w-2xl mx-auto px-4 py-8 space-y-6">
        {/* Page header */}
        <div>
          <h1 className="text-2xl font-bold">Import AI-formatted recipe</h1>
          <p className="text-muted-foreground mt-1 text-sm">
            Paste a recipe that already follows ProjectSpice's template. This importer
            validates the template and does not rewrite free-form text.
          </p>
        </div>

        {/* Copy Prompt Template button */}
        <div className="rounded-lg border bg-muted/30 px-5 py-4 space-y-3">
          <p className="text-sm font-medium">Step 1: Ask your AI assistant</p>
          <p className="text-sm text-muted-foreground">
            Copy the prompt template and send it to ChatGPT or another assistant. Then
            paste the formatted result below.
          </p>
          <button
            type="button"
            onClick={handleCopyPrompt}
            className="rounded-md bg-primary text-primary-foreground px-4 py-2 text-sm font-medium hover:bg-primary/90 transition-colors"
          >
            {copied ? "Copied!" : "Copy Prompt Template"}
          </button>

          {/* Show/hide raw template */}
          <button
            type="button"
            onClick={() => setShowTemplate((v) => !v)}
            className="ml-2 text-sm text-muted-foreground underline underline-offset-2 hover:text-foreground transition-colors"
          >
            {showTemplate ? "Hide template" : "Show template"}
          </button>

          {showTemplate && (
            <pre className="mt-2 rounded-md bg-background border px-4 py-3 text-xs font-mono overflow-x-auto whitespace-pre-wrap text-foreground">
              {PROMPT_TEMPLATE}
            </pre>
          )}
        </div>

        {/* Paste form */}
        <Form method="post" className="space-y-4">
          <div className="space-y-2">
            <label htmlFor="content" className="block text-sm font-medium">
              Paste your recipe
            </label>
            <textarea
              id="content"
              name="content"
              rows={20}
              placeholder="Paste the AI-generated recipe here…"
              className="w-full rounded-md border bg-background px-3 py-2 text-sm font-mono placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring resize-y"
              required
            />
          </div>

          {/* Error message */}
          {error && (
            <div className="rounded-md bg-red-50 px-4 py-3 text-sm text-red-700 space-y-2">
              <p>{error}</p>
              <details>
                <summary className="cursor-pointer font-medium underline underline-offset-2">
                  Show expected format
                </summary>
                <pre className="mt-2 rounded-md bg-white border px-3 py-2 text-xs font-mono overflow-x-auto whitespace-pre-wrap text-gray-800">
                  {PROMPT_TEMPLATE}
                </pre>
              </details>
            </div>
          )}

          <button
            type="submit"
            disabled={isSubmitting}
            className="w-full sm:w-auto rounded-md bg-primary text-primary-foreground px-6 py-2.5 text-sm font-medium hover:bg-primary/90 transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
          >
            {isSubmitting ? "Importing…" : "Import Recipe"}
          </button>
        </Form>
      </main>
    </div>
  );
}
