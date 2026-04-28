import { redirect, data } from "react-router";
import { and, asc, eq, isNull } from "drizzle-orm";
import type { Route } from "./+types/recipes.$id.edit";
import { requireUser } from "~/lib/auth.server";
import { createDb, schema, type Db } from "~/db";
import { parseIngredientLine } from "~/lib/ingredient-parser";
import { AppShell } from "~/components/app-shell";
import { RecipeEditorForm } from "~/components/recipe-editor-form";

export function meta({ data: d }: Route.MetaArgs) {
  const title = d?.recipe?.title ?? "Edit Recipe";
  return [{ title: `Edit: ${title} — ProjectSpice` }];
}

function isGroupHeaderLine(line: string): boolean {
  const t = line.trim();
  if (!t) return false;
  if (t.endsWith(":") && !/^[\d⅛¼⅓⅜½⅝⅔¾⅞]/.test(t)) return true;
  if (/^[A-Z][A-Z\s]{2,}$/.test(t)) return true;
  return false;
}

function ingredientToLine(ing: {
  isGroupHeader: boolean;
  name: string;
  quantityRaw: string | null;
  unitRaw: string | null;
  notes: string | null;
}): string {
  if (ing.isGroupHeader) return `${ing.name}:`;
  const parts = [ing.quantityRaw, ing.unitRaw, ing.name]
    .filter(Boolean)
    .join(" ");
  return ing.notes ? `${parts}, ${ing.notes}` : parts;
}

async function applyTagsToRecipe(
  db: Db,
  userId: string,
  recipeId: string,
  tagsRaw: string
) {
  const tagNames = tagsRaw
    .split(",")
    .map((t) => t.trim())
    .filter(Boolean);
  for (const tagName of tagNames) {
    await db
      .insert(schema.tags)
      .values({ id: crypto.randomUUID(), userId, name: tagName })
      .onConflictDoNothing();
    const [tag] = await db
      .select({ id: schema.tags.id })
      .from(schema.tags)
      .where(
        and(eq(schema.tags.userId, userId), eq(schema.tags.name, tagName))
      );
    if (tag) {
      await db
        .insert(schema.recipeTags)
        .values({ recipeId, tagId: tag.id })
        .onConflictDoNothing();
    }
  }
}

export async function loader({ params, request, context }: Route.LoaderArgs) {
  const user = await requireUser(request, context);
  const { db } = createDb(context.cloudflare.env.DB);

  const [fullUser, recipeRows, ingredients, tagRows, allTagRows] = await Promise.all([
    db.query.users.findFirst({
      where: eq(schema.users.id, user.id),
      columns: { email: true, name: true },
    }),
    db
      .select()
      .from(schema.recipes)
      .where(
        and(
          eq(schema.recipes.id, params.id),
          eq(schema.recipes.userId, user.id),
          isNull(schema.recipes.deletedAt)
        )
      )
      .limit(1),
    db
      .select()
      .from(schema.ingredients)
      .where(eq(schema.ingredients.recipeId, params.id))
      .orderBy(asc(schema.ingredients.sortOrder)),
    db
      .select({ name: schema.tags.name })
      .from(schema.recipeTags)
      .innerJoin(schema.tags, eq(schema.recipeTags.tagId, schema.tags.id))
      .where(eq(schema.recipeTags.recipeId, params.id)),
    db
      .select({ name: schema.tags.name })
      .from(schema.tags)
      .where(eq(schema.tags.userId, user.id)),
  ]);

  const recipe = recipeRows[0];
  if (!recipe) throw data(null, { status: 404 });

  return {
    user: {
      name: fullUser?.name ?? user.email,
      email: fullUser?.email ?? user.email,
    },
    recipe,
    ingredientsText: ingredients.map(ingredientToLine).join("\n"),
    currentTags: tagRows.map((r) => r.name),
    tagSuggestions: allTagRows.map((r) => r.name),
  };
}

export async function action({ params, request, context }: Route.ActionArgs) {
  const user = await requireUser(request, context);
  const fd = await request.formData();

  const title = String(fd.get("title") ?? "").trim();
  if (!title) return { error: "Title is required." };

  const description = String(fd.get("description") ?? "").trim() || null;
  const sourceUrl = String(fd.get("sourceUrl") ?? "").trim() || null;
  const imageSourceUrl = String(fd.get("imageSourceUrl") ?? "").trim() || null;
  const imageAlt = String(fd.get("imageAlt") ?? "").trim() || null;
  const prepTimeMin = parseInt(String(fd.get("prepTimeMin") ?? "")) || null;
  const activeTimeMin =
    parseInt(String(fd.get("activeTimeMin") ?? "")) || null;
  const totalTimeMin = parseInt(String(fd.get("totalTimeMin") ?? "")) || null;
  const timeNotes = String(fd.get("timeNotes") ?? "").trim() || null;
  const servings = parseFloat(String(fd.get("servings") ?? "")) || null;
  const servingsUnit = String(fd.get("servingsUnit") ?? "").trim() || null;
  const difficulty = String(fd.get("difficulty") ?? "").trim() || null;
  const directionsText = String(fd.get("directionsText") ?? "").trim();
  const notes = String(fd.get("notes") ?? "").trim() || null;
  const visibility =
    (fd.get("visibility") as "private" | "family") ?? "private";
  const ingredientsRaw = String(fd.get("ingredients") ?? "");
  const tagsRaw = String(fd.get("tags") ?? "");

  const ingredientLines = ingredientsRaw
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean);

  const { db } = createDb(context.cloudflare.env.DB);

  // Verify ownership
  const [existing] = await db
    .select({ id: schema.recipes.id })
    .from(schema.recipes)
    .where(
      and(
        eq(schema.recipes.id, params.id),
        eq(schema.recipes.userId, user.id),
        isNull(schema.recipes.deletedAt)
      )
    );
  if (!existing) throw data(null, { status: 404 });

  await db
    .update(schema.recipes)
    .set({
      title,
      description,
      sourceUrl,
      prepTimeMin,
      activeTimeMin,
      totalTimeMin,
      timeNotes,
      servings,
      servingsUnit,
      difficulty,
      directionsText,
      notes,
      imageSourceUrl,
      imageAlt,
      visibility,
      updatedAt: new Date(),
    })
    .where(eq(schema.recipes.id, params.id));

  // Replace ingredients
  await db
    .delete(schema.ingredients)
    .where(eq(schema.ingredients.recipeId, params.id));

  if (ingredientLines.length > 0) {
    await db.insert(schema.ingredients).values(
      ingredientLines.map((line, i) => {
        const isHeader = isGroupHeaderLine(line);
        const p = parseIngredientLine(line, isHeader ? line : null);
        return {
          id: crypto.randomUUID(),
          recipeId: params.id,
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
      })
    );
  }

  // Replace tags: delete all links then re-create
  await db
    .delete(schema.recipeTags)
    .where(eq(schema.recipeTags.recipeId, params.id));

  await applyTagsToRecipe(db, user.id, params.id, tagsRaw);

  throw redirect(`/recipes/${params.id}`);
}

export default function EditRecipe({
  loaderData,
  actionData,
}: Route.ComponentProps) {
  const { recipe, ingredientsText, currentTags, tagSuggestions } = loaderData;

  return (
    <AppShell user={loaderData.user}>
      <RecipeEditorForm
        mode="edit"
        values={{
          ...recipe,
          ingredientsText,
          tagsText: currentTags.join(", "),
        }}
        tagSuggestions={tagSuggestions}
        actionError={actionData?.error}
        cancelTo={`/recipes/${recipe.id}`}
      />
    </AppShell>
  );
}
