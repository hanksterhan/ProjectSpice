/**
 * POST /api/imports/paprika
 *
 * Batch-inserts parsed Paprika recipe text data (no photos) into D1.
 * The client parses the .paprikarecipes archive in the browser and sends
 * text-only batches here, keeping the request under CF Worker size limits.
 *
 * Request body: {
 *   recipes: PaprikaRecipeText[],
 *   jobId?: string,
 *   expectedTotal?: number,
 *   sourceCookbookName?: string,
 *   commonTagNames?: string[],
 * }
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
  derivePaprikaCookbookName,
  type PaprikaRecipeText,
} from "~/lib/paprika-binary-parser";
import { scorePaprikaImportConfidence } from "~/lib/import-review.server";
import { getOrCreateCookbookByName } from "~/lib/cookbooks.server";

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
  sourceCookbookName?: string;
  commonTagNames?: string[];
  /** @deprecated Use sourceCookbookName. */
  commonLabel?: string;
  /** @deprecated Use sourceCookbookName/commonTagNames. */
  commonLabelMode?: "cookbook" | "tag" | "none";
  /** @deprecated Use commonTagNames. */
  importTagNames?: string[];
  /** @deprecated Use sourceCookbookName. */
  sourceName?: string;
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

  const sourceCookbookName =
    typeof payload.sourceCookbookName === "string"
      ? payload.sourceCookbookName.trim()
      : payload.commonLabelMode === "cookbook" && typeof payload.commonLabel === "string"
        ? payload.commonLabel.trim()
        : payload.sourceName?.trim() || derivePaprikaCookbookName("Paprika Import", recipes);
  const commonLabelMode = payload.commonLabelMode ?? "cookbook";
  const commonTagNames = Array.isArray(payload.commonTagNames)
    ? payload.commonTagNames.map((name) => name.trim()).filter(Boolean)
    : Array.isArray(payload.importTagNames)
      ? payload.importTagNames.map((name) => name.trim()).filter(Boolean)
      : [];
  const legacyCommonTagNames =
    commonLabelMode === "tag" && typeof payload.commonLabel === "string"
      ? [payload.commonLabel.trim()].filter(Boolean)
      : [];
  const importTagNames = [...commonTagNames, ...legacyCommonTagNames];

  // ── Collect all unique tag names in this batch ─────────────────────────
  const allCategoryNames = new Set<string>();
  for (const r of recipes) {
    for (const cat of r.categories ?? []) {
      const t = cat.trim();
      if (t) allCategoryNames.add(t);
    }
  }
  for (const tagName of importTagNames) allCategoryNames.add(tagName);

  // ── Upsert tags (one per category name) ────────────────────────────────
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
  }

  // Query back real IDs for tags
  const categoryList = Array.from(allCategoryNames);
  const tagIdMap = new Map<string, string>(); // name → tag id
  if (categoryList.length > 0) {
    for (let i = 0; i < categoryList.length; i += 50) {
      const chunk = categoryList.slice(i, i + 50);
      const tagRows = await db
        .select({ id: schema.tags.id, name: schema.tags.name })
        .from(schema.tags)
        .where(and(eq(schema.tags.userId, user.id), inArray(schema.tags.name, chunk)));
      for (const row of tagRows) tagIdMap.set(row.name, row.id);
    }
  }

  let cookbookId: string | null = null;
  if (sourceCookbookName) {
    cookbookId = (
      await getOrCreateCookbookByName(db, user.id, sourceCookbookName, "Imported from Paprika")
    )?.id ?? null;
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
  type ReviewItemRow = typeof schema.importReviewItems.$inferInsert;

  const recipeRows: RecipeRow[] = [];
  const ingredientRows: IngredientRow[] = [];
  const recipeTagRows: RecipeTagRow[] = [];
  const cookbookRecipeRows: CookbookRecipeRow[] = [];
  const reviewItemRows: ReviewItemRow[] = [];

  for (const raw of recipes) {
    if (!raw.uid || !raw.name) {
      errors.push(`Recipe missing uid or name — skipped`);
      continue;
    }
    const confidence = scorePaprikaImportConfidence(raw);
    if (existingPaprikaIds.has(raw.uid)) {
      reviewItemRows.push({
        id: crypto.randomUUID(),
        jobId,
        userId: user.id,
        sourceType: "paprika_binary",
        sourceUid: raw.uid,
        title: raw.name,
        status: "skipped",
        confidenceScore: confidence.score,
        confidenceLevel: confidence.level,
        parsedFieldSummary: confidence.summary,
        originalPayloadJson: raw,
        decisionReason: "Duplicate Paprika UID already imported",
        reviewedAt: new Date(),
      });
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

    reviewItemRows.push({
      id: crypto.randomUUID(),
      jobId,
      userId: user.id,
      recipeId,
      sourceType: "paprika_binary",
      sourceUid: raw.uid,
      title: raw.name,
      status: "pending",
      confidenceScore: confidence.score,
      confidenceLevel: confidence.level,
      parsedFieldSummary: confidence.summary,
      originalPayloadJson: raw,
    });

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

    // Recipe → tag links
    for (const cat of raw.categories ?? []) {
      const name = cat.trim();
      const tagId = tagIdMap.get(name);
      if (tagId) recipeTagRows.push({ recipeId, tagId });
    }
    for (const tagName of importTagNames) {
      const tagId = tagIdMap.get(tagName);
      if (tagId) recipeTagRows.push({ recipeId, tagId });
    }
    if (cookbookId) {
      cookbookRecipeRows.push({ cookbookId, recipeId, sortOrder: recipeRows.length - 1 });
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
  // Local D1 can enforce a lower bind-parameter cap than SQLite's common 999.
  // Keep chunks conservative so full-corpus imports work in local dev too.
  const RECIPE_CHUNK = 2;
  const INGREDIENT_CHUNK = 6;
  const TAG_CHUNK = 30;
  const CB_RECIPE_CHUNK = 20;
  const REVIEW_CHUNK = 5;
  const insertedRecipeIds = new Set<string>();

  for (let i = 0; i < recipeRows.length; i += RECIPE_CHUNK) {
    const chunk = recipeRows.slice(i, i + RECIPE_CHUNK);
    try {
      await db.insert(schema.recipes).values(chunk);
      imported += chunk.length;
      for (const row of chunk) insertedRecipeIds.add(row.id as string);
    } catch (err) {
      errors.push(`Recipe insert ${i}–${i + chunk.length} failed: ${String(err)}`);
    }
  }

  const insertedIngredientRows = ingredientRows.filter((row) => insertedRecipeIds.has(row.recipeId));
  const insertedRecipeTagRows = recipeTagRows.filter((row) => insertedRecipeIds.has(row.recipeId));
  const insertedCookbookRecipeRows = cookbookRecipeRows.filter((row) => insertedRecipeIds.has(row.recipeId));

  for (const row of reviewItemRows) {
    if (row.status === "pending" && row.recipeId && insertedRecipeIds.has(row.recipeId)) {
      row.status = "approved";
      row.reviewedAt = new Date();
    } else if (row.status === "pending") {
      row.decisionReason = "Recipe insert did not complete; needs manual review";
    }
  }

  for (let i = 0; i < insertedIngredientRows.length; i += INGREDIENT_CHUNK) {
    const chunk = insertedIngredientRows.slice(i, i + INGREDIENT_CHUNK);
    try {
      await db.insert(schema.ingredients).values(chunk);
    } catch (err) {
      errors.push(`Ingredient insert ${i}–${i + chunk.length} failed: ${String(err)}`);
    }
  }

  for (let i = 0; i < insertedRecipeTagRows.length; i += TAG_CHUNK) {
    const chunk = insertedRecipeTagRows.slice(i, i + TAG_CHUNK);
    try {
      await db.insert(schema.recipeTags).values(chunk).onConflictDoNothing();
    } catch (err) {
      errors.push(`Tag-link insert ${i}–${i + chunk.length} failed: ${String(err)}`);
    }
  }

  for (let i = 0; i < insertedCookbookRecipeRows.length; i += CB_RECIPE_CHUNK) {
    const chunk = insertedCookbookRecipeRows.slice(i, i + CB_RECIPE_CHUNK);
    try {
      await db.insert(schema.cookbookRecipes).values(chunk).onConflictDoNothing();
    } catch (err) {
      errors.push(`Cookbook-recipe insert ${i}–${i + chunk.length} failed: ${String(err)}`);
    }
  }

  for (let i = 0; i < reviewItemRows.length; i += REVIEW_CHUNK) {
    const chunk = reviewItemRows.slice(i, i + REVIEW_CHUNK);
    try {
      await db
        .insert(schema.importReviewItems)
        .values(chunk)
        .onConflictDoUpdate({
          target: [
            schema.importReviewItems.jobId,
            schema.importReviewItems.sourceUid,
          ],
          set: {
            recipeId: sql`excluded.recipe_id`,
            title: sql`excluded.title`,
            status: sql`excluded.status`,
            confidenceScore: sql`excluded.confidence_score`,
            confidenceLevel: sql`excluded.confidence_level`,
            parsedFieldSummary: sql`excluded.parsed_field_summary`,
            originalPayloadJson: sql`excluded.original_payload_json`,
            decisionReason: sql`excluded.decision_reason`,
            reviewedAt: sql`excluded.reviewed_at`,
            updatedAt: new Date(),
          },
        });
    } catch (err) {
      errors.push(`Review item insert ${i}–${i + chunk.length} failed: ${String(err)}`);
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
