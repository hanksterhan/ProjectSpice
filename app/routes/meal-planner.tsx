import { data, Form, Link, redirect, useFetcher, useSearchParams } from "react-router";
import { useState } from "react";
import { and, asc, eq, gte, inArray, isNull, lte } from "drizzle-orm";
import type { Route } from "./+types/meal-planner";
import { requireUser } from "~/lib/auth.server";
import { createDb, schema } from "~/db";
import { categorizeAisle } from "~/lib/aisle-categorizer";

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
      className="min-h-52 rounded-lg border bg-white p-3"
    >
      <div className="flex items-center gap-2">
        <h2 className="font-semibold text-sm text-gray-900">{formatDay(day)}</h2>
        <button
          type="button"
          onClick={() => setFormOpen((open) => !open)}
          className="ml-auto rounded-md border px-2 py-1 text-xs text-gray-600 hover:bg-gray-50"
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
          <p className="rounded-md border border-dashed px-3 py-6 text-center text-xs text-gray-400">
            Drop a recipe here
          </p>
        )}
      </div>

      {formOpen && (
        <Form method="post" className="mt-3 space-y-2 rounded-md bg-gray-50 p-2">
          <input type="hidden" name="_intent" value="add" />
          <input type="hidden" name="date" value={day} />
          <select name="recipeId" required className="w-full rounded-md border bg-white px-2 py-1.5 text-sm">
            <option value="">Recipe</option>
            {recipes.map((recipe) => (
              <option key={recipe.id} value={recipe.id}>
                {recipe.title}
              </option>
            ))}
          </select>
          <div className="grid grid-cols-2 gap-2">
            <select name="mealSlot" defaultValue="Dinner" className="rounded-md border bg-white px-2 py-1.5 text-sm">
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
              className="rounded-md border bg-white px-2 py-1.5 text-sm"
            />
          </div>
          <input name="notes" placeholder="Notes" className="w-full rounded-md border bg-white px-2 py-1.5 text-sm" />
          <button type="submit" className="w-full rounded-md bg-gray-900 px-3 py-1.5 text-sm font-medium text-white">
            Add
          </button>
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
      className="rounded-md border bg-gray-50 p-2"
    >
      <div className="flex items-start gap-2">
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium text-gray-900">{label}</p>
          <p className="text-xs text-gray-500">
            {[entry.mealSlot, entry.servingsOverride ? `${entry.servingsOverride} servings` : null]
              .filter(Boolean)
              .join(" · ")}
          </p>
          {entry.notes && <p className="mt-1 text-xs text-gray-600">{entry.notes}</p>}
        </div>
        <button type="button" onClick={() => setEditing((open) => !open)} className="text-xs text-gray-500 hover:text-gray-900">
          Edit
        </button>
      </div>
      {editing && (
        <Form method="post" className="mt-2 space-y-2 border-t pt-2">
          <input type="hidden" name="_intent" value="update" />
          <input type="hidden" name="entryId" value={entry.id} />
          <div className="grid grid-cols-2 gap-2">
            <select name="mealSlot" defaultValue={entry.mealSlot ?? ""} className="rounded-md border bg-white px-2 py-1.5 text-sm">
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
              className="rounded-md border bg-white px-2 py-1.5 text-sm"
              placeholder="Servings"
            />
          </div>
          <input name="notes" defaultValue={entry.notes ?? ""} placeholder="Notes" className="w-full rounded-md border bg-white px-2 py-1.5 text-sm" />
          <div className="flex gap-2">
            <button type="submit" className="flex-1 rounded-md bg-gray-900 px-2 py-1.5 text-sm font-medium text-white">
              Save
            </button>
            <button
              type="submit"
              name="_intent"
              value="delete"
              className="rounded-md border px-2 py-1.5 text-sm text-gray-600 hover:text-red-600"
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
  const { weekStart, weekEnd, prevWeek, nextWeek, days, entries, recipes } = loaderData;
  const [searchParams] = useSearchParams();
  const recipeQuery = searchParams.get("q")?.toLowerCase() ?? "";
  const visibleRecipes = recipeQuery
    ? recipes.filter((recipe) => recipe.title.toLowerCase().includes(recipeQuery))
    : recipes.slice(0, 20);

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="sticky top-0 z-10 border-b bg-white/95 backdrop-blur">
        <div className="mx-auto flex h-14 max-w-7xl items-center gap-3 px-4">
          <Link to="/recipes" className="shrink-0 text-sm text-gray-500 hover:text-gray-700">
            ← Recipes
          </Link>
          <h1 className="font-semibold text-gray-900">Meal Planner</h1>
          <div className="ml-auto flex items-center gap-2">
            <Link to={`/meal-planner?week=${prevWeek}`} className="rounded-md border px-2 py-1 text-sm text-gray-600 hover:bg-gray-50">
              Prev
            </Link>
            <Link to={`/meal-planner?week=${nextWeek}`} className="rounded-md border px-2 py-1 text-sm text-gray-600 hover:bg-gray-50">
              Next
            </Link>
          </div>
        </div>
      </header>

      <main className="mx-auto grid max-w-7xl gap-4 px-4 py-5 lg:grid-cols-[16rem_1fr]">
        <aside className="space-y-3 lg:sticky lg:top-20 lg:self-start">
          <div className="rounded-lg border bg-white p-3">
            <p className="text-xs font-semibold uppercase tracking-wider text-gray-500">
              Week of {formatDay(weekStart)}
            </p>
            <p className="mt-1 text-sm text-gray-600">
              {entries.length} planned meal{entries.length === 1 ? "" : "s"} through {formatDay(weekEnd)}
            </p>
          </div>

          <Form method="get" className="rounded-lg border bg-white p-3">
            <label htmlFor="recipe-search" className="text-xs font-semibold uppercase tracking-wider text-gray-500">
              Recipes
            </label>
            <input
              id="recipe-search"
              name="q"
              defaultValue={recipeQuery}
              placeholder="Search recipes"
              className="mt-2 w-full rounded-md border px-2 py-1.5 text-sm"
            />
            <input type="hidden" name="week" value={weekStart} />
          </Form>

          <div className="max-h-80 space-y-2 overflow-y-auto rounded-lg border bg-white p-2">
            {visibleRecipes.map((recipe) => (
              <div
                key={recipe.id}
                draggable
                onDragStart={(event) => event.dataTransfer.setData("application/x-projectspice-recipe", recipe.id)}
                className="cursor-grab rounded-md border bg-gray-50 px-3 py-2 active:cursor-grabbing"
              >
                <p className="truncate text-sm font-medium text-gray-900">{recipe.title}</p>
                <p className="text-xs text-gray-500">
                  {[recipe.servings ? `${recipe.servings} servings` : null, recipe.totalTimeMin ? `${recipe.totalTimeMin} min` : null]
                    .filter(Boolean)
                    .join(" · ")}
                </p>
              </div>
            ))}
            {visibleRecipes.length === 0 && <p className="px-2 py-6 text-center text-sm text-gray-500">No recipes found.</p>}
          </div>

          <Form method="post">
            <input type="hidden" name="_intent" value="generate-list" />
            <input type="hidden" name="weekStart" value={weekStart} />
            <button type="submit" className="w-full rounded-md bg-gray-900 px-3 py-2 text-sm font-medium text-white hover:bg-gray-700">
              Generate Shopping List
            </button>
          </Form>
          {actionData && "error" in actionData && <p className="text-sm text-red-600">{actionData.error}</p>}
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
      </main>
    </div>
  );
}
