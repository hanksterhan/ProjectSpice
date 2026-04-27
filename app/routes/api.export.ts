/**
 * GET /api/export
 *
 * Streams a ZIP containing:
 *   - data.json           — all recipes + logs in ProjectSpice JSON format
 *   - paprika/{slug}.html — Paprika-compatible HTML per recipe
 *   - jsonld/{slug}.json  — Schema.org JSON-LD per recipe
 */

import { and, eq, inArray, isNull } from "drizzle-orm";
import { zipSync, strToU8 } from "fflate";
import type { Route } from "./+types/api.export";
import { requireUser } from "~/lib/auth.server";
import { createDb, schema } from "~/db";
import {
  toJsonLd,
  toPaprikaHtml,
  buildExportPayload,
  type ExportRecipe,
  type ExportLog,
} from "~/lib/export-builder";

// D1 bind limit is 100 variables per statement; chunk large IN queries.
const D1_BATCH_SIZE = 99;

async function fetchInBatches<T>(
  ids: string[],
  fetcher: (chunk: string[]) => Promise<T[]>
): Promise<T[]> {
  const results: T[] = [];
  for (let i = 0; i < ids.length; i += D1_BATCH_SIZE) {
    const chunk = ids.slice(i, i + D1_BATCH_SIZE);
    results.push(...(await fetcher(chunk)));
  }
  return results;
}

export async function loader({ request, context }: Route.LoaderArgs): Promise<Response> {
  const user = await requireUser(request, context);
  const { db } = createDb(context.cloudflare.env.DB);

  // ── Fetch all non-deleted recipes with ingredients and tags ─────────────────
  const recipeRows = await db
    .select()
    .from(schema.recipes)
    .where(and(eq(schema.recipes.userId, user.id), isNull(schema.recipes.deletedAt)));

  const recipeIds = recipeRows.map((r) => r.id);

  // Ingredients — batched to respect D1's 100-variable bind limit
  const ingredientRows =
    recipeIds.length > 0
      ? await fetchInBatches(recipeIds, (chunk) =>
          db
            .select()
            .from(schema.ingredients)
            .where(
              chunk.length === 1
                ? eq(schema.ingredients.recipeId, chunk[0])
                : inArray(schema.ingredients.recipeId, chunk)
            )
            .orderBy(schema.ingredients.sortOrder)
        )
      : [];

  // Tags via join — batched for the same reason
  const tagRows =
    recipeIds.length > 0
      ? await fetchInBatches(recipeIds, (chunk) =>
          db
            .select({
              recipeId: schema.recipeTags.recipeId,
              tagId: schema.tags.id,
              tagName: schema.tags.name,
            })
            .from(schema.recipeTags)
            .innerJoin(schema.tags, eq(schema.tags.id, schema.recipeTags.tagId))
            .where(
              chunk.length === 1
                ? eq(schema.recipeTags.recipeId, chunk[0])
                : inArray(schema.recipeTags.recipeId, chunk)
            )
        )
      : [];

  // Cooking logs (all, including free-form without recipe link)
  const logRows = await db
    .select()
    .from(schema.cookingLog)
    .where(eq(schema.cookingLog.userId, user.id));

  // ── Group by recipe ─────────────────────────────────────────────────────────
  const ingredientsByRecipe = new Map<string, typeof ingredientRows>();
  for (const ing of ingredientRows) {
    const arr = ingredientsByRecipe.get(ing.recipeId) ?? [];
    arr.push(ing);
    ingredientsByRecipe.set(ing.recipeId, arr);
  }

  const tagsByRecipe = new Map<string, Array<{ id: string; name: string }>>();
  for (const t of tagRows) {
    const arr = tagsByRecipe.get(t.recipeId) ?? [];
    arr.push({ id: t.tagId, name: t.tagName });
    tagsByRecipe.set(t.recipeId, arr);
  }

  const recipes: ExportRecipe[] = recipeRows.map((r) => ({
    id: r.id,
    title: r.title,
    slug: r.slug,
    description: r.description,
    sourceUrl: r.sourceUrl,
    sourceType: r.sourceType,
    prepTimeMin: r.prepTimeMin,
    activeTimeMin: r.activeTimeMin,
    totalTimeMin: r.totalTimeMin,
    timeNotes: r.timeNotes,
    servings: r.servings,
    servingsUnit: r.servingsUnit,
    difficulty: r.difficulty,
    directionsText: r.directionsText,
    notes: r.notes,
    imageKey: r.imageKey,
    rating: r.rating,
    visibility: r.visibility,
    paprikaOriginalId: r.paprikaOriginalId,
    createdAt: r.createdAt,
    updatedAt: r.updatedAt,
    ingredients: (ingredientsByRecipe.get(r.id) ?? []).map((i) => ({
      sortOrder: i.sortOrder,
      groupName: i.groupName,
      quantityRaw: i.quantityRaw,
      unitRaw: i.unitRaw,
      name: i.name,
      notes: i.notes,
      weightG: i.weightG,
      footnoteRef: i.footnoteRef,
      isGroupHeader: i.isGroupHeader,
    })),
    tags: tagsByRecipe.get(r.id) ?? [],
  }));

  const logs: ExportLog[] = logRows.map((l) => ({
    id: l.id,
    recipeId: l.recipeId,
    cookedAt: l.cookedAt,
    rating: l.rating,
    notes: l.notes,
    modifications: l.modifications,
  }));

  // ── Build ZIP in memory ─────────────────────────────────────────────────────
  const files: Record<string, Uint8Array> = {};

  // data.json
  const payload = buildExportPayload(recipes, logs);
  files["data.json"] = strToU8(JSON.stringify(payload, null, 2));

  // Per-recipe files — use slug with recipe id suffix to guarantee uniqueness
  for (const recipe of recipes) {
    const safeName = `${recipe.slug}-${recipe.id.slice(0, 8)}`;

    files[`paprika/${safeName}.html`] = strToU8(toPaprikaHtml(recipe));
    files[`jsonld/${safeName}.json`] = strToU8(
      JSON.stringify(toJsonLd(recipe), null, 2)
    );
  }

  const zipped = zipSync(files, { level: 6 });

  const fileName = `projectspice-export-${new Date().toISOString().slice(0, 10)}.zip`;

  const body = zipped.buffer.slice(zipped.byteOffset, zipped.byteOffset + zipped.byteLength);
  return new Response(body as ArrayBuffer, {
    headers: {
      "Content-Type": "application/zip",
      "Content-Disposition": `attachment; filename="${fileName}"`,
      "Content-Length": String(zipped.byteLength),
      "Cache-Control": "no-store",
    },
  });
}
