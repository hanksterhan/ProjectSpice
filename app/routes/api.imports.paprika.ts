/**
 * POST /api/imports/paprika
 *
 * Batch-inserts parsed Paprika recipe text data (no photos) into D1.
 * The client parses the .paprikarecipes archive in the browser and sends
 * text-only batches here, keeping the request under CF Worker size limits.
 *
 * Request body: { recipes: PaprikaRecipeText[], jobId?: string, expectedTotal?: number }
 * Response:     { jobId, imported, skipped, errors }
 */

import { and, eq, inArray, isNull, sql } from "drizzle-orm";
import type { Route } from "./+types/api.imports.paprika";
import { requireUser } from "~/lib/auth.server";
import { createDb, schema } from "~/db";
import { parseIngredientLine } from "~/lib/ingredient-parser";
import { parseDuration } from "~/lib/time-parser";
import {
  normaliseDifficulty,
  parseServings,
  type PaprikaRecipeText,
} from "~/lib/paprika-binary-parser";

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

// ─── Action ──────────────────────────────────────────────────────────────────

type BatchPayload = {
  recipes: PaprikaRecipeText[];
  jobId?: string;
  expectedTotal?: number;
};

type BatchResult = {
  jobId: string;
  imported: number;
  skipped: number;
  errors: string[];
};

const CATEGORY_UPSERT_CHUNK = 15;

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

  // ── Create or fetch import_job ──────────────────────────────────────────
  let jobId = incomingJobId ?? "";
  if (!jobId) {
    jobId = crypto.randomUUID();
    await db.insert(schema.importJobs).values({
      id: jobId,
      userId: user.id,
      status: "processing",
      sourceType: "paprika_binary",
      recipeCountExpected: expectedTotal ?? recipes.length,
      recipeCountImported: 0,
      startedAt: new Date(),
    });
  }

  // ── Dedup: collect existing paprika_original_ids for this user ──────────
  const existingRows = await db
    .select({ paprikaId: schema.recipes.paprikaOriginalId })
    .from(schema.recipes)
    .where(and(eq(schema.recipes.userId, user.id), isNull(schema.recipes.deletedAt)));
  const existingPaprikaIds = new Set(
    existingRows.map((r) => r.paprikaId).filter(Boolean)
  );

  // ── Collect all unique category names in this batch ────────────────────
  const allCategoryNames = new Set<string>();
  for (const r of recipes) {
    for (const cat of r.categories ?? []) {
      const t = cat.trim();
      if (t) allCategoryNames.add(t);
    }
  }

  // ── Upsert tags (one per category name) + cookbooks (one per category) ──
  if (allCategoryNames.size > 0) {
    const categoryList = Array.from(allCategoryNames);

    const tagInserts = categoryList.map((name) => ({
      id: crypto.randomUUID(),
      userId: user.id,
      name,
    }));
    for (let i = 0; i < tagInserts.length; i += CATEGORY_UPSERT_CHUNK) {
      await db
        .insert(schema.tags)
        .values(tagInserts.slice(i, i + CATEGORY_UPSERT_CHUNK))
        .onConflictDoNothing();
    }

    // Upsert cookbooks with the same names
    const cookbookInserts = categoryList.map((name) => ({
      id: crypto.randomUUID(),
      userId: user.id,
      name,
    }));
    for (let i = 0; i < cookbookInserts.length; i += CATEGORY_UPSERT_CHUNK) {
      await db
        .insert(schema.cookbooks)
        .values(cookbookInserts.slice(i, i + CATEGORY_UPSERT_CHUNK))
        .onConflictDoNothing();
    }
  }

  // Query back real IDs for tags and cookbooks
  const categoryList = Array.from(allCategoryNames);
  const tagIdMap = new Map<string, string>(); // name → tag id
  const cookbookIdMap = new Map<string, string>(); // name → cookbook id
  if (categoryList.length > 0) {
    for (let i = 0; i < categoryList.length; i += 50) {
      const chunk = categoryList.slice(i, i + 50);
      const tagRows = await db
        .select({ id: schema.tags.id, name: schema.tags.name })
        .from(schema.tags)
        .where(and(eq(schema.tags.userId, user.id), inArray(schema.tags.name, chunk)));
      for (const row of tagRows) tagIdMap.set(row.name, row.id);

      const cbRows = await db
        .select({ id: schema.cookbooks.id, name: schema.cookbooks.name })
        .from(schema.cookbooks)
        .where(
          and(eq(schema.cookbooks.userId, user.id), inArray(schema.cookbooks.name, chunk))
        );
      for (const row of cbRows) cookbookIdMap.set(row.name, row.id);
    }
  }

  // ── Pre-load existing slugs to avoid uniqueness collisions ──────────────
  const existingSlugRows = await db
    .select({ slug: schema.recipes.slug })
    .from(schema.recipes)
    .where(and(eq(schema.recipes.userId, user.id), isNull(schema.recipes.deletedAt)));
  const usedSlugs = new Set(existingSlugRows.map((r) => r.slug));

  // ── Process each recipe ─────────────────────────────────────────────────
  type RecipeRow = typeof schema.recipes.$inferInsert;
  type IngredientRow = typeof schema.ingredients.$inferInsert;
  type RecipeTagRow = typeof schema.recipeTags.$inferInsert;
  type CookbookRecipeRow = typeof schema.cookbookRecipes.$inferInsert;

  const recipeRows: RecipeRow[] = [];
  const ingredientRows: IngredientRow[] = [];
  const recipeTagRows: RecipeTagRow[] = [];
  const cookbookRecipeRows: CookbookRecipeRow[] = [];

  for (const raw of recipes) {
    if (!raw.uid || !raw.name) {
      errors.push(`Recipe missing uid or name — skipped`);
      continue;
    }
    if (existingPaprikaIds.has(raw.uid)) {
      skipped++;
      continue;
    }

    const recipeId = crypto.randomUUID();

    // Slug — deduplicate within batch + against DB
    const base = generateSlug(raw.name);
    let slug = base;
    let n = 2;
    while (usedSlugs.has(slug)) slug = `${base}-${n++}`;
    usedSlugs.add(slug);

    // Time parsing — Paprika provides separate fields already split
    const prepTimeMin = parseDuration(raw.prep_time ?? "") ?? null;
    const activeTimeMin = parseDuration(raw.cook_time ?? "") ?? null;
    const totalTimeMin = parseDuration(raw.total_time ?? "") ?? null;
    // Collect unparseable values as time_notes
    const timeNotesParts: string[] = [];
    if (raw.prep_time && prepTimeMin === null) timeNotesParts.push(`Prep: ${raw.prep_time}`);
    if (raw.cook_time && activeTimeMin === null) timeNotesParts.push(`Cook: ${raw.cook_time}`);
    if (raw.total_time && totalTimeMin === null) timeNotesParts.push(`Total: ${raw.total_time}`);
    const timeNotes = timeNotesParts.length ? timeNotesParts.join(", ") : null;

    // Servings
    const { servings, servingsUnit } = parseServings(raw.servings ?? "");

    // source_url: use source_url field, fall back to image_url origin
    const sourceUrl = raw.source_url?.trim() || null;

    // image_source_url: store original image URL for lazy photo fetch
    const imageSourceUrl = raw.image_url?.trim() || null;

    // Difficulty
    const difficulty = normaliseDifficulty(raw.difficulty ?? "");

    // Rating: Paprika 0–5 → same scale
    const rating = typeof raw.rating === "number" ? raw.rating : null;

    // Content hash for dedup
    // (async; we'll compute in parallel below — store placeholder, replace after)
    recipeRows.push({
      id: recipeId,
      userId: user.id,
      title: raw.name,
      slug,
      description: raw.description?.trim() || null,
      sourceUrl,
      sourceType: "paprika_binary",
      prepTimeMin,
      activeTimeMin,
      totalTimeMin,
      timeNotes,
      servings,
      servingsUnit,
      difficulty,
      directionsText: raw.directions?.trim() ?? "",
      notes: raw.notes?.trim() || null,
      imageSourceUrl,
      rating,
      paprikaOriginalId: raw.uid,
      importJobId: jobId,
      importedAt: new Date(),
      variantType: "original",
    });

    // Ingredients
    const lines = (raw.ingredients ?? "")
      .split("\n")
      .map((l) => l.trim())
      .filter(Boolean);
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const isHeader = isGroupHeaderLine(line);
      const p = parseIngredientLine(line, isHeader ? line : null);
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

    // Recipe → tag + cookbook links
    for (const cat of raw.categories ?? []) {
      const name = cat.trim();
      const tagId = tagIdMap.get(name);
      if (tagId) recipeTagRows.push({ recipeId, tagId });
      const cookbookId = cookbookIdMap.get(name);
      if (cookbookId) cookbookRecipeRows.push({ cookbookId, recipeId, sortOrder: 0 });
    }
  }

  // ── Compute content hashes in parallel ─────────────────────────────────
  await Promise.all(
    recipeRows.map(async (row) => {
      const ingredientsForHash = ingredientRows
        .filter((r) => r.recipeId === row.id)
        .map((r) => r.name)
        .join("|");
      row.contentHash = await sha256(
        `${(row.title as string).toLowerCase()}|${ingredientsForHash.toLowerCase()}`
      );
    })
  );

  // ── Chunked inserts — each chunk is one SQL statement ───────────────────
  // D1 (SQLite) supports up to 999 bound params per statement.
  // recipes: ~25 cols → max 39 rows/statement; use 30 to stay safe.
  // ingredients: ~12 cols → max 83 rows/statement; use 80.
  // recipe_tags / cookbook_recipes: 2–3 cols → use 200/100 respectively.
  const RECIPE_CHUNK = 30;
  const INGREDIENT_CHUNK = 80;
  const TAG_CHUNK = 200;
  const CB_RECIPE_CHUNK = 100;

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

  for (let i = 0; i < cookbookRecipeRows.length; i += CB_RECIPE_CHUNK) {
    const chunk = cookbookRecipeRows.slice(i, i + CB_RECIPE_CHUNK);
    try {
      await db.insert(schema.cookbookRecipes).values(chunk).onConflictDoNothing();
    } catch (err) {
      errors.push(`Cookbook-recipe insert ${i}–${i + chunk.length} failed: ${String(err)}`);
    }
  }

  // ── Update import_job status ─────────────────────────────────────────────
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
