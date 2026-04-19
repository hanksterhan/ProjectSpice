import { data, Form, Link, useNavigate } from "react-router";
import { useEffect, useState } from "react";
import { eq, and, isNull, asc, count } from "drizzle-orm";
import type { Route } from "./+types/recipes.$id";
import { requireUser } from "~/lib/auth.server";
import { createDb, schema } from "~/db";

export function meta({ data: d }: Route.MetaArgs) {
  const title = d?.recipe?.title ?? "Recipe";
  return [{ title: `${title} — ProjectSpice` }];
}

export async function action({ params, request, context }: Route.ActionArgs) {
  const user = await requireUser(request, context);
  const fd = await request.formData();
  const intent = String(fd.get("_intent") ?? "");

  const { db } = createDb(context.cloudflare.env.DB);

  if (intent === "delete") {
    const recipeTitle = String(fd.get("recipeTitle") ?? "");
    await db
      .update(schema.recipes)
      .set({ deletedAt: new Date() })
      .where(
        and(
          eq(schema.recipes.id, params.id),
          eq(schema.recipes.userId, user.id),
          isNull(schema.recipes.deletedAt)
        )
      );
    return { deleted: true as const, title: recipeTitle };
  }

  if (intent === "restore") {
    await db
      .update(schema.recipes)
      .set({ deletedAt: null })
      .where(
        and(
          eq(schema.recipes.id, params.id),
          eq(schema.recipes.userId, user.id)
        )
      );
    return { restored: true as const };
  }

  throw data(null, { status: 400 });
}

export async function loader({ params, request, context }: Route.LoaderArgs) {
  const user = await requireUser(request, context);
  const { db } = createDb(context.cloudflare.env.DB);

  const [recipeRows, ingredients, tagRows, logRows] = await Promise.all([
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
      .select({ total: count() })
      .from(schema.cookingLog)
      .where(
        and(
          eq(schema.cookingLog.recipeId, params.id),
          eq(schema.cookingLog.userId, user.id)
        )
      ),
  ]);

  const recipe = recipeRows[0];
  if (!recipe) throw data(null, { status: 404 });

  return {
    recipe,
    ingredients,
    tags: tagRows.map((r) => r.name),
    cookCount: logRows[0]?.total ?? 0,
  };
}

function formatTime(minutes: number | null | undefined): string {
  if (!minutes) return "";
  if (minutes < 60) return `${minutes} min`;
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return m > 0 ? `${h} hr ${m} min` : `${h} hr`;
}

const FRACTIONS: [number, string][] = [
  [1 / 8, "⅛"],
  [1 / 4, "¼"],
  [1 / 3, "⅓"],
  [3 / 8, "⅜"],
  [1 / 2, "½"],
  [5 / 8, "⅝"],
  [2 / 3, "⅔"],
  [3 / 4, "¾"],
  [7 / 8, "⅞"],
];

function formatQuantity(qty: number): string {
  if (qty <= 0) return "";
  const whole = Math.floor(qty);
  const frac = qty - whole;
  const EPS = 0.04;
  for (const [val, sym] of FRACTIONS) {
    if (Math.abs(frac - val) < EPS) {
      return whole > 0 ? `${whole}\u202f${sym}` : sym;
    }
  }
  if (frac < EPS) return String(whole);
  // Decimal fallback — strip trailing zeros
  return qty.toFixed(2).replace(/\.?0+$/, "");
}

export default function RecipeDetail({
  loaderData,
  actionData,
}: Route.ComponentProps) {
  const { recipe, ingredients, tags, cookCount } = loaderData;
  const navigate = useNavigate();
  const [scaleFactor, setScaleFactor] = useState(1);
  const [customScale, setCustomScale] = useState("");

  const isDeleted = actionData != null && "deleted" in actionData && actionData.deleted;
  const deletedTitle = isDeleted && "title" in actionData ? actionData.title : "";
  const [countdown, setCountdown] = useState(10);

  useEffect(() => {
    if (!isDeleted) return;
    const interval = setInterval(() => setCountdown((c) => c - 1), 1000);
    const timeout = setTimeout(() => navigate("/"), 10000);
    return () => {
      clearInterval(interval);
      clearTimeout(timeout);
    };
  }, [isDeleted, navigate]);

  const hasScalable = ingredients.some(
    (i) => !i.isGroupHeader && i.quantityDecimal != null
  );

  const directions = recipe.directionsText
    .split(/\n\n+/)
    .flatMap((block) => block.split(/\n/))
    .map((s) => s.replace(/^\d+\.\s*/, "").trim())
    .filter(Boolean);

  function scaleActive(v: number) {
    return scaleFactor === v && customScale === "";
  }

  function applyScale(v: number) {
    setScaleFactor(v);
    setCustomScale("");
  }

  return (
    <div className="min-h-screen bg-background">
      {/* Undo toast */}
      {isDeleted && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 flex items-center gap-3 rounded-lg bg-foreground text-background px-4 py-3 shadow-lg text-sm">
          <span>
            "{deletedTitle}" deleted ({countdown}s)
          </span>
          <Form method="post">
            <input type="hidden" name="_intent" value="restore" />
            <button
              type="submit"
              className="font-semibold underline underline-offset-2 hover:opacity-80"
            >
              Undo
            </button>
          </Form>
        </div>
      )}

      <header className="sticky top-0 z-10 bg-background/95 backdrop-blur border-b">
        <div className="max-w-2xl mx-auto px-4 h-14 flex items-center gap-3">
          <Link
            to="/recipes"
            className="text-muted-foreground hover:text-foreground text-sm"
          >
            ← Back
          </Link>
          <span className="text-muted-foreground">/</span>
          <span className="font-medium text-sm truncate flex-1">
            {recipe.title}
          </span>
          <Link
            to={`/recipes/${recipe.id}/edit`}
            className="text-sm text-muted-foreground hover:text-foreground"
          >
            Edit
          </Link>
          <Form method="post">
            <input type="hidden" name="_intent" value="delete" />
            <input type="hidden" name="recipeTitle" value={recipe.title} />
            <button
              type="submit"
              className="text-sm text-red-500 hover:text-red-600"
            >
              Delete
            </button>
          </Form>
        </div>
      </header>

      <main className="max-w-2xl mx-auto px-4 py-6 space-y-8">
        {/* Title + meta */}
        <div className="space-y-3">
          <h1 className="text-2xl font-bold leading-tight">{recipe.title}</h1>

          {recipe.description && (
            <p className="text-muted-foreground leading-relaxed">
              {recipe.description}
            </p>
          )}

          <div className="flex flex-wrap gap-x-5 gap-y-1 text-sm text-muted-foreground">
            {recipe.prepTimeMin ? (
              <span>
                <span className="font-medium text-foreground">Prep</span>{" "}
                {formatTime(recipe.prepTimeMin)}
              </span>
            ) : null}
            {recipe.activeTimeMin ? (
              <span>
                <span className="font-medium text-foreground">Active</span>{" "}
                {formatTime(recipe.activeTimeMin)}
              </span>
            ) : null}
            {recipe.totalTimeMin ? (
              <span>
                <span className="font-medium text-foreground">Total</span>{" "}
                {formatTime(recipe.totalTimeMin)}
              </span>
            ) : null}
            {recipe.servings ? (
              <span>
                <span className="font-medium text-foreground">Serves</span>{" "}
                {recipe.servings}
                {recipe.servingsUnit ? ` ${recipe.servingsUnit}` : ""}
              </span>
            ) : null}
            {recipe.timeNotes ? (
              <span className="italic">{recipe.timeNotes}</span>
            ) : null}
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {tags.map((tag) => (
              <span
                key={tag}
                className="inline-flex items-center rounded-full bg-muted px-2.5 py-0.5 text-xs font-medium"
              >
                {tag}
              </span>
            ))}
            {cookCount > 0 && (
              <span className="text-xs text-muted-foreground ml-auto">
                Cooked {cookCount}×
              </span>
            )}
          </div>
        </div>

        {/* Ingredients */}
        {ingredients.length > 0 && (
          <div className="space-y-3">
            <div className="flex items-center justify-between gap-4 flex-wrap">
              <h2 className="text-lg font-semibold">Ingredients</h2>

              {hasScalable && (
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-xs text-muted-foreground">Scale:</span>
                  {(
                    [
                      { label: "½×", value: 0.5 },
                      { label: "1×", value: 1 },
                      { label: "2×", value: 2 },
                    ] as const
                  ).map(({ label, value }) => (
                    <button
                      key={value}
                      onClick={() => applyScale(value)}
                      className={`px-2.5 py-1 rounded-md text-xs font-medium border transition-colors ${
                        scaleActive(value)
                          ? "bg-primary text-primary-foreground border-primary"
                          : "bg-background text-foreground border-input hover:bg-muted"
                      }`}
                    >
                      {label}
                    </button>
                  ))}
                  <input
                    type="number"
                    min="0.1"
                    step="0.1"
                    placeholder="custom"
                    value={customScale}
                    onChange={(e) => {
                      setCustomScale(e.target.value);
                      const v = parseFloat(e.target.value);
                      if (v > 0) setScaleFactor(v);
                    }}
                    className="w-20 px-2 py-1 text-xs border border-input rounded-md bg-background focus:outline-none focus:ring-1 focus:ring-ring"
                  />
                </div>
              )}
            </div>

            <ul className="space-y-1.5">
              {ingredients.map((ing) => {
                if (ing.isGroupHeader) {
                  return (
                    <li key={ing.id} className="pt-3 pb-0.5 first:pt-0">
                      <span className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">
                        {ing.name}
                      </span>
                    </li>
                  );
                }

                const rawQty =
                  ing.quantityDecimal != null
                    ? formatQuantity(ing.quantityDecimal * scaleFactor)
                    : (ing.quantityRaw ?? "");
                const unit = ing.unitRaw ?? "";
                const qtyUnit = [rawQty, unit].filter(Boolean).join("\u00a0");

                return (
                  <li key={ing.id} className="flex gap-3 text-sm leading-snug">
                    <span className="w-20 shrink-0 text-right tabular-nums text-muted-foreground">
                      {qtyUnit}
                    </span>
                    <span className="flex-1">
                      {ing.name}
                      {ing.notes ? (
                        <span className="text-muted-foreground">
                          , {ing.notes}
                        </span>
                      ) : null}
                      {ing.weightG ? (
                        <span className="text-muted-foreground text-xs ml-1">
                          ({ing.weightG}g)
                        </span>
                      ) : null}
                    </span>
                  </li>
                );
              })}
            </ul>
          </div>
        )}

        {/* Directions */}
        {directions.length > 0 && (
          <div className="space-y-3">
            <h2 className="text-lg font-semibold">Directions</h2>
            <ol className="space-y-4">
              {directions.map((step, i) => (
                <li key={i} className="flex gap-3 text-sm leading-relaxed">
                  <span className="shrink-0 w-6 h-6 rounded-full bg-primary text-primary-foreground text-xs font-bold flex items-center justify-center mt-0.5">
                    {i + 1}
                  </span>
                  <p className="flex-1">{step}</p>
                </li>
              ))}
            </ol>
          </div>
        )}

        {/* Notes */}
        {recipe.notes && (
          <div className="space-y-2">
            <h2 className="text-lg font-semibold">Notes</h2>
            <p className="text-sm leading-relaxed whitespace-pre-line text-muted-foreground">
              {recipe.notes}
            </p>
          </div>
        )}

        {/* Source link */}
        {recipe.sourceUrl && (
          <p className="text-xs text-muted-foreground">
            Source:{" "}
            <a
              href={recipe.sourceUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="underline underline-offset-2 hover:text-foreground"
            >
              {recipe.sourceUrl}
            </a>
          </p>
        )}
      </main>
    </div>
  );
}
