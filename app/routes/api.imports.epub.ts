/**
 * POST /api/imports/epub
 *
 * Saves user-confirmed recipes from the guided EPUB review flow.
 */

import { and, eq, inArray, isNull } from "drizzle-orm";
import type { Route } from "./+types/api.imports.epub";
import { requireUser } from "~/lib/auth.server";
import { createDb, schema } from "~/db";
import { parseIngredientLine } from "~/lib/ingredient-parser";
import type { EpubRecipeCandidate } from "~/lib/epub-parser";

type Payload = {
  cookbookName?: string;
  recipes: EpubRecipeCandidate[];
};

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
  return Boolean(t && ((t.endsWith(":") && !/^[\d⅛¼⅓⅜½⅝⅔¾⅞]/.test(t)) || /^[A-Z][A-Z\s]{2,}$/.test(t)));
}

export async function action({ request, context }: Route.ActionArgs): Promise<Response> {
  if (request.method !== "POST") return new Response("Method Not Allowed", { status: 405 });

  const user = await requireUser(request, context);
  const { db } = createDb(context.cloudflare.env.DB);

  let payload: Payload;
  try {
    payload = (await request.json()) as Payload;
  } catch {
    return Response.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const recipes = Array.isArray(payload.recipes)
    ? payload.recipes.filter((r) => r.title?.trim() && (r.ingredients?.length || r.directions?.trim()))
    : [];
  if (recipes.length === 0) {
    return Response.json({ error: "Select at least one recipe to import." }, { status: 400 });
  }

  const jobId = crypto.randomUUID();
  await db.insert(schema.importJobs).values({
    id: jobId,
    userId: user.id,
    status: "processing",
    sourceType: "epub",
    recipeCountExpected: recipes.length,
    startedAt: new Date(),
  });

  const existingSlugRows = await db
    .select({ slug: schema.recipes.slug })
    .from(schema.recipes)
    .where(and(eq(schema.recipes.userId, user.id), isNull(schema.recipes.deletedAt)));
  const usedSlugs = new Set(existingSlugRows.map((r) => r.slug));

  const cookbookName = payload.cookbookName?.trim() || null;
  const tagNames = new Set<string>();
  if (cookbookName) tagNames.add(cookbookName);
  for (const recipe of recipes) {
    for (const tag of recipe.tags ?? []) {
      const trimmed = tag.trim();
      if (trimmed) tagNames.add(trimmed);
    }
  }

  const tagIdMap = new Map<string, string>();
  if (tagNames.size > 0) {
    const tagList = Array.from(tagNames);
    await db
      .insert(schema.tags)
      .values(tagList.map((name) => ({ id: crypto.randomUUID(), userId: user.id, name })))
      .onConflictDoNothing();
    const rows = await db
      .select({ id: schema.tags.id, name: schema.tags.name })
      .from(schema.tags)
      .where(and(eq(schema.tags.userId, user.id), inArray(schema.tags.name, tagList)));
    for (const row of rows) tagIdMap.set(row.name, row.id);
  }

  let cookbookId: string | null = null;
  if (cookbookName) {
    await db
      .insert(schema.cookbooks)
      .values({ id: crypto.randomUUID(), userId: user.id, name: cookbookName })
      .onConflictDoNothing();
    const row = await db.query.cookbooks.findFirst({
      where: and(eq(schema.cookbooks.userId, user.id), eq(schema.cookbooks.name, cookbookName)),
      columns: { id: true },
    });
    cookbookId = row?.id ?? null;
  }

  let imported = 0;
  const errors: string[] = [];
  const recipeIds: string[] = [];

  for (const recipe of recipes) {
    try {
      const recipeId = crypto.randomUUID();
      const base = generateSlug(recipe.title);
      let slug = base || `epub-recipe-${imported + 1}`;
      let n = 2;
      while (usedSlugs.has(slug)) slug = `${base}-${n++}`;
      usedSlugs.add(slug);

      const ingredients = recipe.ingredients.map((line) => line.trim()).filter(Boolean);
      const contentHash = await sha256(`${recipe.title.toLowerCase()}|${ingredients.join("|").toLowerCase()}`);

      await db.insert(schema.recipes).values({
        id: recipeId,
        userId: user.id,
        title: recipe.title.trim(),
        slug,
        sourceType: "epub",
        sourceHash: await sha256(recipe.sourcePath || recipe.title),
        contentHash,
        directionsText: recipe.directions?.trim() ?? "",
        notes: recipe.notes?.trim() || null,
        importJobId: jobId,
        importedAt: new Date(),
        variantType: "original",
      });

      if (ingredients.length > 0) {
        await db.insert(schema.ingredients).values(
          ingredients.map((line, i) => {
            const isHeader = isGroupHeaderLine(line);
            const parsed = parseIngredientLine(line, isHeader ? line : null);
            return {
              id: crypto.randomUUID(),
              recipeId,
              sortOrder: i,
              groupName: parsed.is_group_header ? parsed.name : null,
              quantityRaw: parsed.quantity_raw || null,
              quantityDecimal: parsed.quantity_decimal,
              unitRaw: parsed.unit_raw || null,
              unitCanonical: parsed.unit_canonical,
              name: parsed.name,
              notes: parsed.notes,
              weightG: parsed.weight_g,
              footnoteRef: parsed.footnote_ref,
              isGroupHeader: parsed.is_group_header,
            };
          })
        );
      }

      const recipeTagRows = [cookbookName, ...(recipe.tags ?? [])]
        .map((name) => (name ? tagIdMap.get(name.trim()) : null))
        .filter((id): id is string => Boolean(id))
        .map((tagId) => ({ recipeId, tagId }));
      if (recipeTagRows.length > 0) {
        await db.insert(schema.recipeTags).values(recipeTagRows).onConflictDoNothing();
      }

      if (cookbookId) {
        await db.insert(schema.cookbookRecipes).values({ cookbookId, recipeId, sortOrder: imported }).onConflictDoNothing();
      }

      recipeIds.push(recipeId);
      imported++;
    } catch (err) {
      errors.push(`${recipe.title}: ${String(err)}`);
    }
  }

  await db
    .update(schema.importJobs)
    .set({
      status: errors.length === recipes.length ? "failed" : "completed",
      recipeCountImported: imported,
      errorLogJson: errors.length ? errors : null,
      completedAt: new Date(),
    })
    .where(eq(schema.importJobs.id, jobId));

  return Response.json({ jobId, imported, errors, firstRecipeId: recipeIds[0] ?? null });
}
