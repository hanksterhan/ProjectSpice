import { redirect } from "react-router";
import { useEffect, useRef, useState } from "react";
import { Form, Link, useNavigation } from "react-router";
import { and, eq, isNull } from "drizzle-orm";
import type { Route } from "./+types/recipes.new";
import { requireUser } from "~/lib/auth.server";
import { createDb, schema, type Db } from "~/db";
import { parseIngredientLine } from "~/lib/ingredient-parser";

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
  const tagRows = await db
    .select({ name: schema.tags.name })
    .from(schema.tags)
    .where(eq(schema.tags.userId, user.id));
  return { tagSuggestions: tagRows.map((t) => t.name) };
}

export async function action({ request, context }: Route.ActionArgs) {
  const user = await requireUser(request, context);
  const fd = await request.formData();

  const title = String(fd.get("title") ?? "").trim();
  if (!title) return { error: "Title is required." };

  const description = String(fd.get("description") ?? "").trim() || null;
  const sourceUrl = String(fd.get("sourceUrl") ?? "").trim() || null;
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

const INPUT =
  "w-full rounded-md border border-input bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring";
const LABEL = "text-sm font-medium";
const FIELD = "flex flex-col gap-1";

export default function NewRecipe({
  loaderData,
  actionData,
}: Route.ComponentProps) {
  const { tagSuggestions } = loaderData;
  const navigation = useNavigation();
  const isPending = navigation.state === "submitting";
  const isDirty = useRef(false);
  const [tagInput, setTagInput] = useState("");

  useEffect(() => {
    const handler = (e: BeforeUnloadEvent) => {
      if (isDirty.current) e.preventDefault();
    };
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, []);

  function addSuggestedTag(tag: string) {
    const current = tagInput
      .split(",")
      .map((t) => t.trim())
      .filter(Boolean);
    if (!current.includes(tag)) {
      setTagInput([...current, tag].join(", "));
      isDirty.current = true;
    }
  }

  return (
    <div className="min-h-screen bg-background">
      <header className="sticky top-0 z-10 bg-background/95 backdrop-blur border-b">
        <div className="max-w-2xl mx-auto px-4 h-14 flex items-center gap-3">
          <Link
            to="/"
            className="text-muted-foreground hover:text-foreground text-sm"
          >
            ← Cancel
          </Link>
          <span className="text-muted-foreground">/</span>
          <span className="font-medium text-sm">New Recipe</span>
        </div>
      </header>

      <main className="max-w-2xl mx-auto px-4 py-6">
        <Form
          method="post"
          className="space-y-6"
          onChange={() => {
            isDirty.current = true;
          }}
        >
          {actionData?.error && (
            <p
              role="alert"
              className="text-sm text-red-600 bg-red-50 rounded-md px-3 py-2"
            >
              {actionData.error}
            </p>
          )}

          <div className={FIELD}>
            <label htmlFor="title" className={LABEL}>
              Title *
            </label>
            <input
              id="title"
              name="title"
              type="text"
              required
              autoFocus
              className={INPUT}
              placeholder="e.g. Chocolate Chip Cookies"
            />
          </div>

          <div className={FIELD}>
            <label htmlFor="description" className={LABEL}>
              Description
            </label>
            <textarea
              id="description"
              name="description"
              rows={2}
              className={INPUT}
              placeholder="Brief description (optional)"
            />
          </div>

          <fieldset className="space-y-3">
            <legend className="text-sm font-semibold">Timing</legend>
            <div className="grid grid-cols-3 gap-3">
              <div className={FIELD}>
                <label htmlFor="prepTimeMin" className={LABEL}>
                  Prep (min)
                </label>
                <input
                  id="prepTimeMin"
                  name="prepTimeMin"
                  type="number"
                  min="0"
                  className={INPUT}
                />
              </div>
              <div className={FIELD}>
                <label htmlFor="activeTimeMin" className={LABEL}>
                  Active (min)
                </label>
                <input
                  id="activeTimeMin"
                  name="activeTimeMin"
                  type="number"
                  min="0"
                  className={INPUT}
                />
              </div>
              <div className={FIELD}>
                <label htmlFor="totalTimeMin" className={LABEL}>
                  Total (min)
                </label>
                <input
                  id="totalTimeMin"
                  name="totalTimeMin"
                  type="number"
                  min="0"
                  className={INPUT}
                />
              </div>
            </div>
            <div className={FIELD}>
              <label htmlFor="timeNotes" className={LABEL}>
                Time notes
              </label>
              <input
                id="timeNotes"
                name="timeNotes"
                type="text"
                className={INPUT}
                placeholder="e.g. plus overnight to marinate"
              />
            </div>
          </fieldset>

          <div className="grid grid-cols-2 gap-3">
            <div className={FIELD}>
              <label htmlFor="servings" className={LABEL}>
                Servings
              </label>
              <input
                id="servings"
                name="servings"
                type="number"
                min="0"
                step="0.5"
                className={INPUT}
              />
            </div>
            <div className={FIELD}>
              <label htmlFor="servingsUnit" className={LABEL}>
                Unit
              </label>
              <input
                id="servingsUnit"
                name="servingsUnit"
                type="text"
                className={INPUT}
                placeholder="cookies, portions…"
              />
            </div>
          </div>

          <div className={FIELD}>
            <label htmlFor="ingredients" className={LABEL}>
              Ingredients
            </label>
            <p className="text-xs text-muted-foreground">
              One per line. End with ":" for a section header (e.g.{" "}
              <span className="font-mono">For the sauce:</span>).
            </p>
            <textarea
              id="ingredients"
              name="ingredients"
              rows={10}
              className={`${INPUT} font-mono`}
              placeholder={"2 cups all-purpose flour\n1 tsp baking powder\n\nFor the topping:\n2 tbsp sugar"}
            />
          </div>

          <div className={FIELD}>
            <label htmlFor="directionsText" className={LABEL}>
              Directions
            </label>
            <p className="text-xs text-muted-foreground">
              One step per line. Blank lines create paragraph breaks.
            </p>
            <textarea
              id="directionsText"
              name="directionsText"
              rows={12}
              className={INPUT}
              placeholder={"Preheat oven to 375°F.\nMix dry ingredients in a bowl.\n\nAdd wet ingredients and fold until just combined."}
            />
          </div>

          <div className={FIELD}>
            <label htmlFor="notes" className={LABEL}>
              Notes
            </label>
            <textarea
              id="notes"
              name="notes"
              rows={3}
              className={INPUT}
              placeholder="Tips, substitutions, storage notes…"
            />
          </div>

          <div className={FIELD}>
            <label htmlFor="tags" className={LABEL}>
              Tags
            </label>
            <input
              id="tags"
              name="tags"
              type="text"
              className={INPUT}
              placeholder="Comma-separated, e.g. pasta, italian, weeknight"
              value={tagInput}
              onChange={(e) => setTagInput(e.target.value)}
            />
            {tagSuggestions.length > 0 && (
              <div className="flex flex-wrap gap-1.5 mt-1">
                {tagSuggestions.slice(0, 24).map((tag) => (
                  <button
                    key={tag}
                    type="button"
                    onClick={() => addSuggestedTag(tag)}
                    className="inline-flex items-center rounded-full bg-muted px-2.5 py-0.5 text-xs hover:bg-muted/70 transition-colors"
                  >
                    + {tag}
                  </button>
                ))}
              </div>
            )}
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className={FIELD}>
              <label htmlFor="difficulty" className={LABEL}>
                Difficulty
              </label>
              <select id="difficulty" name="difficulty" className={INPUT}>
                <option value="">—</option>
                <option value="easy">Easy</option>
                <option value="medium">Medium</option>
                <option value="hard">Hard</option>
              </select>
            </div>
            <div className={FIELD}>
              <label htmlFor="visibility" className={LABEL}>
                Visibility
              </label>
              <select id="visibility" name="visibility" className={INPUT}>
                <option value="private">Private</option>
                <option value="family">Family</option>
              </select>
            </div>
          </div>

          <div className={FIELD}>
            <label htmlFor="sourceUrl" className={LABEL}>
              Source URL
            </label>
            <input
              id="sourceUrl"
              name="sourceUrl"
              type="url"
              className={INPUT}
              placeholder="https://…"
            />
          </div>

          <div className="flex items-center gap-3 pt-2 pb-8">
            <button
              type="submit"
              disabled={isPending}
              className="rounded-md bg-primary text-primary-foreground px-6 py-2.5 text-sm font-medium hover:bg-primary/90 transition-colors disabled:opacity-50"
            >
              {isPending ? "Saving…" : "Save Recipe"}
            </button>
            <Link
              to="/"
              className="px-4 py-2.5 text-sm text-muted-foreground hover:text-foreground"
            >
              Cancel
            </Link>
          </div>
        </Form>
      </main>
    </div>
  );
}
