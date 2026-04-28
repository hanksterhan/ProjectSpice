import { data, Form, Link, redirect, useFetcher, useSearchParams } from "react-router";
import { useState } from "react";
import { and, asc, eq, gte, inArray, isNull, lte } from "drizzle-orm";
import type { Route } from "./+types/meal-planner";
import { requireUser } from "~/lib/auth.server";
import { createDb, schema } from "~/db";
import { categorizeAisle } from "~/lib/aisle-categorizer";
import { AppShell } from "~/components/app-shell";
import { Button, Chip, SectionHeader } from "~/components/ui";

const SLOT_LABELS = ["Breakfast", "Lunch", "Dinner", "Snack"];

type PlannedEntry = {
  id: string;
  date: string;
  mealSlot: string | null;
  recipeId: string | null;
  recipeTitle: string | null;
  recipeServings: number | null;
  servingsOverride: number | null;
  notes: string | null;
};

type RecipeOption = {
  id: string;
  title: string;
  servings: number | null;
  totalTimeMin: number | null;
};

export function meta() {
  return [{ title: "Meal Planner — ProjectSpice" }];
}

function isoDate(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function parseIsoDate(value: string | null): Date {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return new Date();
  const [year, month, day] = value.split("-").map(Number);
  return new Date(Date.UTC(year, month - 1, day, 12));
}

function startOfWeek(value: string | null): string {
  const date = parseIsoDate(value);
  const weekday = date.getUTCDay();
  const diff = (weekday + 6) % 7;
  date.setUTCDate(date.getUTCDate() - diff);
  return isoDate(date);
}

function addDays(weekStart: string, days: number): string {
  const date = parseIsoDate(weekStart);
  date.setUTCDate(date.getUTCDate() + days);
  return isoDate(date);
}

function formatDay(value: string): string {
  return new Intl.DateTimeFormat("en", {
    weekday: "short",
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  }).format(parseIsoDate(value));
}

function scaleQuantity(
  quantityRaw: string | null,
  quantityDecimal: number | null,
  scale: number
): string | null {
  if (!quantityDecimal || !Number.isFinite(scale) || scale === 1) return quantityRaw;
  const scaled = quantityDecimal * scale;
  const rounded = Math.round(scaled * 100) / 100;
  return Number.isInteger(rounded) ? String(rounded) : String(rounded).replace(/0+$/, "");
}

export async function loader({ request, context }: Route.LoaderArgs) {
  const user = await requireUser(request, context);
  const url = new URL(request.url);
  const weekStart = startOfWeek(url.searchParams.get("week"));
  const weekEnd = addDays(weekStart, 6);
  const { db } = createDb(context.cloudflare.env.DB);

  const [entries, recipes] = await Promise.all([
    db
      .select({
        id: schema.mealPlanEntries.id,
        date: schema.mealPlanEntries.date,
        mealSlot: schema.mealPlanEntries.mealSlot,
        recipeId: schema.mealPlanEntries.recipeId,
        recipeTitle: schema.recipes.title,
        recipeServings: schema.recipes.servings,
        servingsOverride: schema.mealPlanEntries.servingsOverride,
        notes: schema.mealPlanEntries.notes,
      })
      .from(schema.mealPlanEntries)
      .leftJoin(schema.recipes, eq(schema.mealPlanEntries.recipeId, schema.recipes.id))
      .where(
        and(
          eq(schema.mealPlanEntries.userId, user.id),
          gte(schema.mealPlanEntries.date, weekStart),
          lte(schema.mealPlanEntries.date, weekEnd)
        )
      )
      .orderBy(asc(schema.mealPlanEntries.date), asc(schema.mealPlanEntries.mealSlot)),
    db
      .select({
        id: schema.recipes.id,
        title: schema.recipes.title,
        servings: schema.recipes.servings,
        totalTimeMin: schema.recipes.totalTimeMin,
      })
      .from(schema.recipes)
      .where(and(eq(schema.recipes.userId, user.id), isNull(schema.recipes.deletedAt)))
      .orderBy(asc(schema.recipes.title)),
  ]);

  return {
    user,
    weekStart,
    weekEnd,
    prevWeek: addDays(weekStart, -7),
    nextWeek: addDays(weekStart, 7),
    days: Array.from({ length: 7 }, (_, i) => addDays(weekStart, i)),
    entries: entries as PlannedEntry[],
    recipes: recipes as RecipeOption[],
  };
}

export async function action({ request, context }: Route.ActionArgs) {
  const user = await requireUser(request, context);
  const fd = await request.formData();
  const intent = String(fd.get("_intent") ?? "");
  const { db } = createDb(context.cloudflare.env.DB);

  if (intent === "add" || intent === "drop-recipe") {
    const recipeId = String(fd.get("recipeId") ?? "");
    const date = String(fd.get("date") ?? "");
    if (!recipeId || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      return { error: "Pick a recipe and date." };
    }
    const [recipe] = await db
      .select({ id: schema.recipes.id })
      .from(schema.recipes)
      .where(
        and(
          eq(schema.recipes.id, recipeId),
          eq(schema.recipes.userId, user.id),
          isNull(schema.recipes.deletedAt)
        )
      )
      .limit(1);
    if (!recipe) throw data(null, { status: 403 });

    await db.insert(schema.mealPlanEntries).values({
      userId: user.id,
      date,
      mealSlot: String(fd.get("mealSlot") ?? "") || null,
      recipeId,
      servingsOverride: Number(fd.get("servingsOverride")) || null,
      notes: String(fd.get("notes") ?? "").trim() || null,
    });
    return { ok: true };
  }

  if (intent === "move") {
    const entryId = String(fd.get("entryId") ?? "");
    const date = String(fd.get("date") ?? "");
    if (!entryId || !/^\d{4}-\d{2}-\d{2}$/.test(date)) return { error: "Invalid drop." };
    await db
      .update(schema.mealPlanEntries)
      .set({ date, mealSlot: String(fd.get("mealSlot") ?? "") || null })
      .where(and(eq(schema.mealPlanEntries.id, entryId), eq(schema.mealPlanEntries.userId, user.id)));
    return { ok: true };
  }

  if (intent === "update") {
    const entryId = String(fd.get("entryId") ?? "");
    await db
      .update(schema.mealPlanEntries)
      .set({
        mealSlot: String(fd.get("mealSlot") ?? "") || null,
        servingsOverride: Number(fd.get("servingsOverride")) || null,
        notes: String(fd.get("notes") ?? "").trim() || null,
      })
      .where(and(eq(schema.mealPlanEntries.id, entryId), eq(schema.mealPlanEntries.userId, user.id)));
    return { ok: true };
  }

  if (intent === "delete") {
    const entryId = String(fd.get("entryId") ?? "");
    await db
      .delete(schema.mealPlanEntries)
      .where(and(eq(schema.mealPlanEntries.id, entryId), eq(schema.mealPlanEntries.userId, user.id)));
    return { ok: true };
  }

  if (intent === "generate-list") {
    const weekStart = startOfWeek(String(fd.get("weekStart") ?? ""));
    const weekEnd = addDays(weekStart, 6);
    const entries = await db
      .select({
        recipeId: schema.mealPlanEntries.recipeId,
        recipeTitle: schema.recipes.title,
        recipeServings: schema.recipes.servings,
        servingsOverride: schema.mealPlanEntries.servingsOverride,
      })
      .from(schema.mealPlanEntries)
      .innerJoin(schema.recipes, eq(schema.mealPlanEntries.recipeId, schema.recipes.id))
      .where(
        and(
          eq(schema.mealPlanEntries.userId, user.id),
          gte(schema.mealPlanEntries.date, weekStart),
          lte(schema.mealPlanEntries.date, weekEnd),
          isNull(schema.recipes.deletedAt)
        )
      );

    const recipeIds = Array.from(
      new Set(entries.map((entry) => entry.recipeId).filter((id): id is string => !!id))
    );
    if (!recipeIds.length) return { error: "Plan at least one recipe first." };

    const ingredients = await db
      .select()
      .from(schema.ingredients)
      .where(inArray(schema.ingredients.recipeId, recipeIds))
      .orderBy(asc(schema.ingredients.recipeId), asc(schema.ingredients.sortOrder));

    const [list] = await db
      .insert(schema.shoppingLists)
      .values({ userId: user.id, name: `Meal plan ${weekStart}` })
      .returning({ id: schema.shoppingLists.id });

    const ingredientsByRecipe = new Map<string, typeof ingredients>();
    for (const ing of ingredients.filter((row) => !row.isGroupHeader)) {
      const bucket = ingredientsByRecipe.get(ing.recipeId) ?? [];
      bucket.push(ing);
      ingredientsByRecipe.set(ing.recipeId, bucket);
    }

    const items = entries.flatMap((entry) => {
      if (!entry.recipeId) return [];
      const scale =
        entry.servingsOverride && entry.recipeServings
          ? entry.servingsOverride / entry.recipeServings
          : 1;
      return (ingredientsByRecipe.get(entry.recipeId) ?? []).map((ing) => ({
        shoppingListId: list.id,
        recipeId: ing.recipeId,
        ingredientId: ing.id,
        manualText: ing.name,
        quantity: scaleQuantity(ing.quantityRaw, ing.quantityDecimal, scale),
        unit: ing.unitRaw,
        aisle: categorizeAisle(ing.name),
      }));
    });
    if (items.length > 0) await db.insert(schema.shoppingListItems).values(items);
    return redirect(`/shopping-lists/${list.id}`);
  }

  throw data(null, { status: 400 });
}

function DayColumn({
  day,
  entries,
  recipes,
}: {
  day: string;
  entries: PlannedEntry[];
  recipes: RecipeOption[];
}) {
  const dropFetcher = useFetcher<{ ok?: boolean; error?: string }>();
  const [formOpen, setFormOpen] = useState(false);

  function handleDrop(event: React.DragEvent<HTMLDivElement>) {
    event.preventDefault();
    const recipeId = event.dataTransfer.getData("application/x-projectspice-recipe");
    const entryId = event.dataTransfer.getData("application/x-projectspice-entry");
    if (recipeId) {
      dropFetcher.submit({ _intent: "drop-recipe", recipeId, date: day, mealSlot: "Dinner" }, { method: "post" });
    } else if (entryId) {
      dropFetcher.submit({ _intent: "move", entryId, date: day }, { method: "post" });
    }
  }

  return (
    <section
      onDragOver={(event) => event.preventDefault()}
      onDrop={handleDrop}
      className="ps-surface min-h-56 p-3"
    >
      <div className="flex items-center gap-2">
        <h2 className="text-sm font-semibold text-ink">{formatDay(day)}</h2>
        <button
          type="button"
          onClick={() => setFormOpen((open) => !open)}
          className="ps-control ml-auto inline-flex min-h-8 min-w-8 items-center justify-center border border-rule bg-paper-2 text-sm font-semibold text-ink hover:bg-paper-3 focus-visible:ps-focus-ring"
          aria-label={`Add meal on ${formatDay(day)}`}
        >
          +
        </button>
      </div>

      <div className="mt-3 space-y-2">
        {entries.map((entry) => (
          <PlannedMeal key={entry.id} entry={entry} />
        ))}
        {entries.length === 0 && (
          <p className="rounded-md border border-dashed border-rule bg-paper-3/40 px-3 py-6 text-center text-xs text-ink-4">
            Drop a recipe here
          </p>
        )}
      </div>

      {formOpen && (
        <Form method="post" className="mt-3 space-y-2 rounded-md border border-rule bg-paper-3 p-2">
          <input type="hidden" name="_intent" value="add" />
          <input type="hidden" name="date" value={day} />
          <select name="recipeId" required className="ps-control w-full border border-rule bg-paper-2 px-2 text-sm text-ink focus-visible:ps-focus-ring">
            <option value="">Recipe</option>
            {recipes.map((recipe) => (
              <option key={recipe.id} value={recipe.id}>
                {recipe.title}
              </option>
            ))}
          </select>
          <div className="grid grid-cols-2 gap-2">
            <select name="mealSlot" defaultValue="Dinner" className="ps-control border border-rule bg-paper-2 px-2 text-sm text-ink focus-visible:ps-focus-ring">
              {SLOT_LABELS.map((slot) => (
                <option key={slot} value={slot}>
                  {slot}
                </option>
              ))}
            </select>
            <input
              name="servingsOverride"
              type="number"
              min="0"
              step="0.5"
              placeholder="Servings"
              className="ps-control border border-rule bg-paper-2 px-2 text-sm text-ink placeholder:text-ink-4 focus-visible:ps-focus-ring"
            />
          </div>
          <input name="notes" placeholder="Notes" className="ps-control w-full border border-rule bg-paper-2 px-2 text-sm text-ink placeholder:text-ink-4 focus-visible:ps-focus-ring" />
          <Button type="submit" variant="primary" className="w-full">
            Add
          </Button>
        </Form>
      )}
    </section>
  );
}

function PlannedMeal({ entry }: { entry: PlannedEntry }) {
  const [editing, setEditing] = useState(false);
  const label = entry.recipeTitle ?? "Deleted recipe";
  return (
    <article
      draggable
      onDragStart={(event) => event.dataTransfer.setData("application/x-projectspice-entry", entry.id)}
      className="rounded-md border border-rule bg-paper-3 p-2"
    >
      <div className="flex items-start gap-2">
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium text-ink">{label}</p>
          <p className="text-xs text-ink-3">
            {[entry.mealSlot, entry.servingsOverride ? `${entry.servingsOverride} servings` : null]
              .filter(Boolean)
              .join(" · ")}
          </p>
          {entry.notes && <p className="mt-1 text-xs text-ink-3">{entry.notes}</p>}
        </div>
        <button type="button" onClick={() => setEditing((open) => !open)} className="text-xs font-medium text-ink-3 hover:text-ink">
          Edit
        </button>
      </div>
      {editing && (
        <Form method="post" className="mt-2 space-y-2 border-t border-rule pt-2">
          <input type="hidden" name="_intent" value="update" />
          <input type="hidden" name="entryId" value={entry.id} />
          <div className="grid grid-cols-2 gap-2">
            <select name="mealSlot" defaultValue={entry.mealSlot ?? ""} className="ps-control border border-rule bg-paper-2 px-2 text-sm text-ink focus-visible:ps-focus-ring">
              <option value="">Meal</option>
              {SLOT_LABELS.map((slot) => (
                <option key={slot} value={slot}>
                  {slot}
                </option>
              ))}
            </select>
            <input
              name="servingsOverride"
              type="number"
              min="0"
              step="0.5"
              defaultValue={entry.servingsOverride ?? ""}
              className="ps-control border border-rule bg-paper-2 px-2 text-sm text-ink focus-visible:ps-focus-ring"
              placeholder="Servings"
            />
          </div>
          <input name="notes" defaultValue={entry.notes ?? ""} placeholder="Notes" className="ps-control w-full border border-rule bg-paper-2 px-2 text-sm text-ink placeholder:text-ink-4 focus-visible:ps-focus-ring" />
          <div className="flex gap-2">
            <Button type="submit" variant="primary" size="sm" className="flex-1">
              Save
            </Button>
            <button
              type="submit"
              name="_intent"
              value="delete"
              className="ps-control inline-flex min-h-8 items-center justify-center border border-rule bg-paper-2 px-2 text-sm font-medium text-ink-3 hover:bg-paper-3 hover:text-err focus-visible:ps-focus-ring"
            >
              Remove
            </button>
          </div>
        </Form>
      )}
    </article>
  );
}

export default function MealPlanner({ loaderData, actionData }: Route.ComponentProps) {
  const { user, weekStart, weekEnd, prevWeek, nextWeek, days, entries, recipes } = loaderData;
  const [searchParams] = useSearchParams();
  const recipeQuery = searchParams.get("q")?.toLowerCase() ?? "";
  const visibleRecipes = recipeQuery
    ? recipes.filter((recipe) => recipe.title.toLowerCase().includes(recipeQuery))
    : recipes.slice(0, 20);

  return (
    <AppShell user={user}>
      <div className="space-y-5">
        <SectionHeader
          eyebrow={`Week of ${formatDay(weekStart)}`}
          title="Meal Planner"
          description={`${entries.length} planned meal${entries.length === 1 ? "" : "s"} through ${formatDay(weekEnd)}.`}
          actions={
            <>
              <Link to={`/meal-planner?week=${prevWeek}`} className="ps-control inline-flex items-center justify-center border border-rule bg-paper-2 px-4 text-sm font-medium text-ink hover:bg-paper-3 focus-visible:ps-focus-ring">
                Prev
              </Link>
              <Link to={`/meal-planner?week=${nextWeek}`} className="ps-control inline-flex items-center justify-center border border-rule bg-paper-2 px-4 text-sm font-medium text-ink hover:bg-paper-3 focus-visible:ps-focus-ring">
                Next
              </Link>
            </>
          }
        />

        <div className="grid gap-4 lg:grid-cols-[17rem_minmax(0,1fr)]">
        <aside className="space-y-3 lg:sticky lg:top-20 lg:self-start">
          <div className="ps-surface p-3">
            <p className="text-xs font-semibold uppercase text-ink-3">Week status</p>
            <div className="mt-3 flex flex-wrap gap-2">
              <Chip>{entries.length} planned</Chip>
              <Chip>{recipes.length} recipes</Chip>
            </div>
          </div>

          <Form method="get" className="ps-surface p-3">
            <label htmlFor="recipe-search" className="text-xs font-semibold uppercase text-ink-3">
              Recipes
            </label>
            <input
              id="recipe-search"
              name="q"
              defaultValue={recipeQuery}
              placeholder="Search recipes"
              className="ps-control mt-2 w-full border border-rule bg-paper px-3 text-sm text-ink placeholder:text-ink-4 focus-visible:ps-focus-ring"
            />
            <input type="hidden" name="week" value={weekStart} />
          </Form>

          <div className="ps-surface max-h-80 space-y-2 overflow-y-auto p-2">
            {visibleRecipes.map((recipe) => (
              <div
                key={recipe.id}
                draggable
                onDragStart={(event) => event.dataTransfer.setData("application/x-projectspice-recipe", recipe.id)}
                className="ps-row cursor-grab rounded-md border border-rule bg-paper-3 px-3 py-2 active:cursor-grabbing"
              >
                <p className="truncate text-sm font-medium text-ink">{recipe.title}</p>
                <p className="text-xs text-ink-3">
                  {[recipe.servings ? `${recipe.servings} servings` : null, recipe.totalTimeMin ? `${recipe.totalTimeMin} min` : null]
                    .filter(Boolean)
                    .join(" · ")}
                </p>
              </div>
            ))}
            {visibleRecipes.length === 0 && <p className="px-2 py-6 text-center text-sm text-ink-3">No recipes found.</p>}
          </div>

          <Form method="post">
            <input type="hidden" name="_intent" value="generate-list" />
            <input type="hidden" name="weekStart" value={weekStart} />
            <Button type="submit" variant="primary" className="w-full">
              Generate Shopping List
            </Button>
          </Form>
          {actionData && "error" in actionData && <p className="text-sm text-err">{actionData.error}</p>}
        </aside>

        <section className="grid gap-3 md:grid-cols-2 xl:grid-cols-7">
          {days.map((day) => (
            <DayColumn
              key={day}
              day={day}
              entries={entries.filter((entry) => entry.date === day)}
              recipes={recipes}
            />
          ))}
        </section>
        </div>
      </div>
    </AppShell>
  );
}
