import { redirect } from "react-router";
import { and, eq, isNull } from "drizzle-orm";
import type { Route } from "./+types/recipes.new";
import { requireUser } from "~/lib/auth.server";
import { createDb, schema, type Db } from "~/db";
import { parseIngredientLine } from "~/lib/ingredient-parser";
import { AppShell } from "~/components/app-shell";
import { RecipeEditorForm } from "~/components/recipe-editor-form";

export function meta() {
  return [{ title: "New Recipe — ProjectSpice" }];
}

function generateSlug(title: string): string {
  return title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 100);
}

function isGroupHeaderLine(line: string): boolean {
  const t = line.trim();
  if (!t) return false;
  if (t.endsWith(":") && !/^[\d⅛¼⅓⅜½⅝⅔¾⅞]/.test(t)) return true;
  if (/^[A-Z][A-Z\s]{2,}$/.test(t)) return true;
  return false;
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
      .where(and(eq(schema.tags.userId, userId), eq(schema.tags.name, tagName)));
    if (tag) {
      await db
        .insert(schema.recipeTags)
        .values({ recipeId, tagId: tag.id })
        .onConflictDoNothing();
    }
  }
}

export async function loader({ request, context }: Route.LoaderArgs) {
  const user = await requireUser(request, context);
  const { db } = createDb(context.cloudflare.env.DB);
  const [fullUser, tagRows] = await Promise.all([
    db.query.users.findFirst({
      where: eq(schema.users.id, user.id),
      columns: { email: true, name: true },
    }),
    db
      .select({ name: schema.tags.name })
      .from(schema.tags)
      .where(eq(schema.tags.userId, user.id)),
  ]);
  return {
    user: {
      name: fullUser?.name ?? user.email,
      email: fullUser?.email ?? user.email,
    },
    tagSuggestions: tagRows.map((t) => t.name),
  };
}

export async function action({ request, context }: Route.ActionArgs) {
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

  // Generate a slug unique to this user
  const base = generateSlug(title);
  const existingRecipes = await db
    .select({ slug: schema.recipes.slug })
    .from(schema.recipes)
    .where(
      and(eq(schema.recipes.userId, user.id), isNull(schema.recipes.deletedAt))
    );
  const slugSet = new Set(existingRecipes.map((r) => r.slug));
  let slug = base;
  let n = 2;
  while (slugSet.has(slug)) slug = `${base}-${n++}`;

  const recipeId = crypto.randomUUID();
  await db.insert(schema.recipes).values({
    id: recipeId,
    userId: user.id,
    title,
    slug,
    description,
    sourceUrl,
    sourceType: "manual",
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
  });

  if (ingredientLines.length > 0) {
    await db.insert(schema.ingredients).values(
      ingredientLines.map((line, i) => {
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
      })
    );
  }

  await applyTagsToRecipe(db, user.id, recipeId, tagsRaw);

  throw redirect(`/recipes/${recipeId}`);
}

export default function NewRecipe({
  loaderData,
  actionData,
}: Route.ComponentProps) {
  return (
    <AppShell user={loaderData.user}>
      <RecipeEditorForm
        mode="new"
        tagSuggestions={loaderData.tagSuggestions}
        actionError={actionData?.error}
        cancelTo="/recipes"
      />
    </AppShell>
  );
}
