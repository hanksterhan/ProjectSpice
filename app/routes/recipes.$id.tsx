import { data, Form, Link, useNavigate } from "react-router";
import { useEffect, useRef, useState } from "react";
import { eq, and, isNull, asc, count, desc, or } from "drizzle-orm";
import type { Route } from "./+types/recipes.$id";
import { requireUser } from "~/lib/auth.server";
import { createDb, schema } from "~/db";
import { buildTermIndex, segmentStep, type MappableIngredient } from "~/lib/ingredient-mapper";
import { cacheRecipe } from "~/lib/offline-db";
import {
  canManageRecipe,
  canPubliclyShareRecipe,
  FAMILY_RECIPE_VISIBILITY,
} from "~/lib/family-sharing";
import { AppShell } from "~/components/app-shell";
import { Button, Chip, ImageFallback, SegmentedControl } from "~/components/ui";

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

  const [recipeRows, ingredients, tagRows, logRows, variantRows] = await Promise.all([
    db
      .select({
        id: schema.recipes.id,
        userId: schema.recipes.userId,
        title: schema.recipes.title,
        slug: schema.recipes.slug,
        description: schema.recipes.description,
        sourceUrl: schema.recipes.sourceUrl,
        sourceType: schema.recipes.sourceType,
        prepTimeMin: schema.recipes.prepTimeMin,
        activeTimeMin: schema.recipes.activeTimeMin,
        totalTimeMin: schema.recipes.totalTimeMin,
        timeNotes: schema.recipes.timeNotes,
        servings: schema.recipes.servings,
        servingsUnit: schema.recipes.servingsUnit,
        difficulty: schema.recipes.difficulty,
        directionsText: schema.recipes.directionsText,
        notes: schema.recipes.notes,
        imageKey: schema.recipes.imageKey,
        imageSourceUrl: schema.recipes.imageSourceUrl,
        imageAttribution: schema.recipes.imageAttribution,
        imageAlt: schema.recipes.imageAlt,
        rating: schema.recipes.rating,
        parentRecipeId: schema.recipes.parentRecipeId,
        variantType: schema.recipes.variantType,
        variantProfileId: schema.recipes.variantProfileId,
        contentHash: schema.recipes.contentHash,
        sourceHash: schema.recipes.sourceHash,
        paprikaOriginalId: schema.recipes.paprikaOriginalId,
        importedAt: schema.recipes.importedAt,
        importJobId: schema.recipes.importJobId,
        visibility: schema.recipes.visibility,
        deletedAt: schema.recipes.deletedAt,
        createdAt: schema.recipes.createdAt,
        updatedAt: schema.recipes.updatedAt,
        ownerName: schema.users.name,
      })
      .from(schema.recipes)
      .innerJoin(schema.users, eq(schema.recipes.userId, schema.users.id))
      .where(
        and(
          eq(schema.recipes.id, params.id),
          or(
            eq(schema.recipes.userId, user.id),
            eq(schema.recipes.visibility, FAMILY_RECIPE_VISIBILITY)
          ),
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
    // AI-improved variants
    db
      .select({ id: schema.recipes.id, title: schema.recipes.title, createdAt: schema.recipes.createdAt })
      .from(schema.recipes)
      .where(
        and(
          eq(schema.recipes.parentRecipeId, params.id),
          eq(schema.recipes.userId, user.id),
          isNull(schema.recipes.deletedAt)
        )
      )
      .orderBy(desc(schema.recipes.createdAt)),
  ]);

  const recipe = recipeRows[0];
  if (!recipe) throw data(null, { status: 404 });
  const isOwner = canManageRecipe(recipe, user.id);

  return {
    user: { name: user.name, email: user.email },
    recipe,
    ingredients,
    tags: tagRows.map((r) => r.name),
    cookCount: logRows[0]?.total ?? 0,
    variants: variantRows,
    isOwner,
    canPublicShare: canPubliclyShareRecipe(recipe),
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

const PAREN_KEY = "spice_parenthetical_mode";

function useParentheticalMode(): [boolean, () => void] {
  const [on, setOn] = useState(false);
  useEffect(() => {
    setOn(localStorage.getItem(PAREN_KEY) === "1");
  }, []);
  function toggle() {
    setOn((prev) => {
      const next = !prev;
      localStorage.setItem(PAREN_KEY, next ? "1" : "0");
      return next;
    });
  }
  return [on, toggle];
}

function IngredientPopover({
  text,
  label,
}: {
  text: string;
  label: string;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    if (!open) return;
    function close(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, [open]);

  return (
    <span ref={ref} className="relative inline">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="cursor-pointer border-b border-dotted border-ink-3 focus:outline-none focus-visible:ps-focus-ring"
        aria-expanded={open}
        aria-label={`Ingredient: ${label}`}
      >
        {text}
      </button>
      {open && (
        <span
          role="tooltip"
          className="pointer-events-none absolute bottom-full left-1/2 z-30 mb-1.5 -translate-x-1/2 whitespace-nowrap rounded-md border border-rule bg-paper-2 px-2.5 py-1.5 text-xs text-ink shadow-[var(--shadow-2)]"
        >
          {label}
        </span>
      )}
    </span>
  );
}

export default function RecipeDetail({
  loaderData,
  actionData,
}: Route.ComponentProps) {
  const { user, recipe, ingredients, tags, cookCount, variants } = loaderData;
  const { isOwner, canPublicShare } = loaderData;
  const navigate = useNavigate();
  const [scaleFactor, setScaleFactor] = useState(1);
  const [customScale, setCustomScale] = useState("");
  const [parenthetical, toggleParenthetical] = useParentheticalMode();
  const [checkedIngredients, setCheckedIngredients] = useState<Record<string, boolean>>({});

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

  useEffect(() => {
    cacheRecipe({
      id: recipe.id,
      userId: recipe.userId,
      recipe: recipe as unknown as Record<string, unknown>,
      ingredients: ingredients as unknown[],
      tags,
      cookCount,
    }).catch(() => {});
  }, [recipe.id]);  // eslint-disable-line react-hooks/exhaustive-deps

  const hasScalable = ingredients.some(
    (i) => !i.isGroupHeader && i.quantityDecimal != null
  );

  const directions = recipe.directionsText
    .split(/\n\n+/)
    .flatMap((block) => block.split(/\n/))
    .map((s) => s.replace(/^\d+\.\s*/, "").trim())
    .filter(Boolean);

  const termIndex = buildTermIndex(
    ingredients.filter((i) => !i.isGroupHeader) as MappableIngredient[]
  );

  function scaleActive(v: number) {
    return scaleFactor === v && customScale === "";
  }

  function applyScale(v: number) {
    setScaleFactor(v);
    setCustomScale("");
  }

  const servingLabel = recipe.servings
    ? `${recipe.servings * scaleFactor}${recipe.servingsUnit ? ` ${recipe.servingsUnit}` : ""}`
    : null;
  const sourceLabel = SOURCE_LABELS[recipe.sourceType] ?? recipe.sourceType;
  const ownerLabel = isOwner ? "Your recipe" : `From ${recipe.ownerName}`;
  const visibleIngredientCount = ingredients.filter((i) => !i.isGroupHeader).length;
  const checkedCount = Object.values(checkedIngredients).filter(Boolean).length;

  return (
    <AppShell user={user}>
      {/* Undo toast */}
      {isDeleted && (
        <div className="fixed bottom-6 left-1/2 z-50 flex -translate-x-1/2 items-center gap-3 rounded-lg bg-ink px-4 py-3 text-sm text-paper shadow-[var(--shadow-3)]">
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

      <div className="space-y-5">
        <Link to="/recipes" className="text-sm font-medium text-ink-3 hover:text-ink">
          Back to recipes
        </Link>

        <section className="overflow-hidden rounded-lg border border-rule bg-paper-2 shadow-[var(--shadow-1)]">
          <div className="relative min-h-[18rem] overflow-hidden bg-paper-3 sm:min-h-[22rem]">
            <ImageFallback
              imageKey={recipe.imageKey}
              alt={recipe.imageAlt ?? recipe.title}
              label="Recipe"
              widths={[640, 1024, 1440]}
              className="absolute inset-0 h-full w-full"
            />
            <div className="absolute inset-0 bg-[linear-gradient(180deg,rgb(0_0_0_/_5%)_25%,rgb(0_0_0_/_70%)_100%)]" />
            <div className="absolute inset-x-0 bottom-0 p-5 text-white sm:p-8">
              <p className="ps-mono mb-2 text-xs uppercase text-white/80">
                {ownerLabel} · {sourceLabel}
              </p>
              <h1 className="ps-display-editorial max-w-4xl text-3xl sm:text-5xl">
                {recipe.title}
              </h1>
              <div className="mt-4 flex flex-wrap gap-x-4 gap-y-2 text-sm text-white/90">
                {recipe.totalTimeMin && <span>Total {formatTime(recipe.totalTimeMin)}</span>}
                {servingLabel && <span>Serves {servingLabel}</span>}
                {recipe.rating != null && <span>{renderStars(recipe.rating)}</span>}
                <span>Cooked {cookCount}x</span>
              </div>
            </div>
          </div>

          <div className="grid gap-0 xl:grid-cols-[minmax(0,1fr)_20rem]">
            <div className="space-y-6 p-5 sm:p-8">
              {recipe.description && (
                <p className="max-w-2xl text-sm leading-6 text-ink-2">{recipe.description}</p>
              )}

              <div className="flex flex-wrap items-center gap-2">
                {recipe.visibility === FAMILY_RECIPE_VISIBILITY && <Chip selected>Family</Chip>}
                {!canPublicShare && <Chip tone="warning">Private source link</Chip>}
                {tags.map((tag) => (
                  <Chip key={tag}>{tag}</Chip>
                ))}
              </div>

              <div className="grid gap-8 lg:grid-cols-[20rem_minmax(0,1fr)] lg:items-start">
                <IngredientPanel
                  ingredients={ingredients}
                  scaleFactor={scaleFactor}
                  customScale={customScale}
                  setCustomScale={setCustomScale}
                  setScaleFactor={setScaleFactor}
                  applyScale={applyScale}
                  scaleActive={scaleActive}
                  hasScalable={hasScalable}
                  checkedIngredients={checkedIngredients}
                  setCheckedIngredients={setCheckedIngredients}
                  checkedCount={checkedCount}
                  visibleIngredientCount={visibleIngredientCount}
                />

                <div className="space-y-7">
                  {directions.length > 0 && (
                    <section className="space-y-3">
                      <div className="flex items-center gap-3">
                        <h2 className="ps-display text-xl text-ink">Directions</h2>
                        <span className="flex-1" />
                        {termIndex.length > 0 && (
                          <Button
                            type="button"
                            size="sm"
                            variant={parenthetical ? "primary" : "secondary"}
                            onClick={toggleParenthetical}
                            title="Toggle parenthetical ingredient quantities inline"
                          >
                            Qty inline
                          </Button>
                        )}
                      </div>
                      <ol className="space-y-3">
                        {directions.map((step, i) => {
                          const segments = termIndex.length > 0
                            ? segmentStep(step, termIndex)
                            : null;
                          return (
                            <li
                              key={i}
                              className="grid grid-cols-[2rem_minmax(0,1fr)] gap-3 border-b border-rule pb-3 last:border-b-0"
                            >
                              <span className="ps-mono flex h-7 w-7 items-center justify-center rounded-full bg-ink text-xs font-semibold text-paper">
                                {i + 1}
                              </span>
                              <p className="pt-0.5 text-sm leading-7 text-ink-2">
                                {segments
                                  ? segments.map((seg, j) =>
                                      seg.kind === "text" ? (
                                        <span key={j}>{seg.text}</span>
                                      ) : parenthetical ? (
                                        <span key={j}>
                                          {seg.text}
                                          <span className="ml-1 text-xs text-ink-4">
                                            ({seg.label})
                                          </span>
                                        </span>
                                      ) : (
                                        <IngredientPopover
                                          key={j}
                                          text={seg.text}
                                          label={seg.label}
                                        />
                                      )
                                    )
                                  : step}
                              </p>
                            </li>
                          );
                        })}
                      </ol>
                    </section>
                  )}

                  {recipe.notes && (
                    <section className="rounded-lg border-l-4 border-primary bg-paper-3 p-4">
                      <h2 className="ps-mono text-xs font-semibold uppercase text-ink-3">Notes</h2>
                      <p className="mt-2 whitespace-pre-line text-sm leading-6 text-ink-2">
                        {recipe.notes}
                      </p>
                    </section>
                  )}

                  {variants.length > 0 && <VariantPanel variants={variants} />}
                </div>
              </div>
            </div>

            <RecipeMetaRail
              recipe={recipe}
              isOwner={isOwner}
              sourceLabel={sourceLabel}
              canPublicShare={canPublicShare}
              cookCount={cookCount}
            />
          </div>
        </section>
      </div>
    </AppShell>
  );
}

const SOURCE_LABELS: Record<string, string> = {
  url: "Imported from URL",
  gpt: "Created with GPT",
  paprika_html: "Imported from Paprika",
  paprika_binary: "Imported from Paprika",
  pdf: "Imported from PDF",
  epub: "Imported from EPUB",
  manual: "Manual recipe",
};

function renderStars(rating: number) {
  const value = Math.max(0, Math.min(5, rating));
  return `${"★".repeat(value)}${"☆".repeat(5 - value)}`;
}

type Ingredient = Route.ComponentProps["loaderData"]["ingredients"][number];
type Recipe = Route.ComponentProps["loaderData"]["recipe"];
type Variant = Route.ComponentProps["loaderData"]["variants"][number];

function IngredientPanel({
  ingredients,
  scaleFactor,
  customScale,
  setCustomScale,
  setScaleFactor,
  applyScale,
  scaleActive,
  hasScalable,
  checkedIngredients,
  setCheckedIngredients,
  checkedCount,
  visibleIngredientCount,
}: {
  ingredients: Ingredient[];
  scaleFactor: number;
  customScale: string;
  setCustomScale: (value: string) => void;
  setScaleFactor: (value: number) => void;
  applyScale: (value: number) => void;
  scaleActive: (value: number) => boolean;
  hasScalable: boolean;
  checkedIngredients: Record<string, boolean>;
  setCheckedIngredients: React.Dispatch<React.SetStateAction<Record<string, boolean>>>;
  checkedCount: number;
  visibleIngredientCount: number;
}) {
  return (
    <section className="lg:sticky lg:top-20">
      <div className="rounded-lg border border-rule bg-paper p-4 shadow-[var(--shadow-1)]">
        <div className="flex flex-wrap items-center gap-3">
          <h2 className="ps-display flex-1 text-xl text-ink">Ingredients</h2>
          {visibleIngredientCount > 0 && (
            <span className="ps-mono text-xs text-ink-4">
              {checkedCount}/{visibleIngredientCount}
            </span>
          )}
        </div>

        {hasScalable && (
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <SegmentedControl
              label="Scale ingredients"
              value={String(scaleFactor)}
              onChange={(value) => applyScale(Number(value))}
              options={[
                { value: "0.5", label: "1/2x" },
                { value: "1", label: "1x" },
                { value: "2", label: "2x" },
              ]}
            />
            <label>
              <span className="sr-only">Custom scale</span>
              <input
                type="number"
                min="0.1"
                step="0.1"
                placeholder="custom"
                value={customScale}
                onChange={(event) => {
                  setCustomScale(event.target.value);
                  const next = parseFloat(event.target.value);
                  if (next > 0) setScaleFactor(next);
                }}
                className="ps-control w-20 border border-rule bg-paper-2 px-2 text-xs text-ink focus-visible:ps-focus-ring"
              />
            </label>
            {customScale && !scaleActive(scaleFactor) && (
              <span className="text-xs text-ink-4">{scaleFactor}x</span>
            )}
          </div>
        )}

        <ul className="mt-4 space-y-1.5">
          {ingredients.map((ing) => {
            if (ing.isGroupHeader) {
              return (
                <li key={ing.id} className="pt-3 first:pt-0">
                  <span className="ps-mono text-xs font-semibold uppercase text-ink-3">
                    {ing.name}
                  </span>
                </li>
              );
            }

            const rawQty =
              ing.quantityDecimal != null
                ? formatQuantity(ing.quantityDecimal * scaleFactor)
                : (ing.quantityRaw ?? "");
            const qtyUnit = [rawQty, ing.unitRaw ?? ""].filter(Boolean).join("\u00a0");
            const checked = checkedIngredients[ing.id] ?? false;

            return (
              <li key={ing.id}>
                <label
                  className={`grid cursor-pointer grid-cols-[1.25rem_4.5rem_minmax(0,1fr)] gap-2 rounded-md px-1 py-1.5 text-sm leading-snug hover:bg-paper-3 ${
                    checked ? "text-ink-4 line-through" : "text-ink"
                  }`}
                >
                  <input
                    type="checkbox"
                    checked={checked}
                    onChange={() =>
                      setCheckedIngredients((current) => ({
                        ...current,
                        [ing.id]: !checked,
                      }))
                    }
                    className="mt-0.5 accent-ink"
                    aria-label={`Check ingredient ${ing.name}`}
                  />
                  <span className="ps-mono text-right text-xs tabular-nums text-ink-3">
                    {qtyUnit}
                  </span>
                  <span>
                    {ing.name}
                    {ing.notes && <span className="text-ink-3">, {ing.notes}</span>}
                    {ing.weightG && <span className="ml-1 text-xs text-ink-4">({ing.weightG}g)</span>}
                  </span>
                </label>
              </li>
            );
          })}
        </ul>
      </div>
    </section>
  );
}

function RecipeMetaRail({
  recipe,
  isOwner,
  sourceLabel,
  canPublicShare,
  cookCount,
}: {
  recipe: Recipe;
  isOwner: boolean;
  sourceLabel: string;
  canPublicShare: boolean;
  cookCount: number;
}) {
  return (
    <aside className="border-t border-rule bg-paper p-5 xl:border-l xl:border-t-0">
      <div className="xl:sticky xl:top-20">
        <div className="grid gap-2">
          <LinkButton to={`/recipes/${recipe.id}/cook`} variant="primary">Start cooking</LinkButton>
          <div className="grid grid-cols-2 gap-2">
            <LinkButton to={`/logs/new?recipeId=${recipe.id}`}>I made this</LinkButton>
            <LinkButton to={`/shopping-lists?recipeId=${recipe.id}`}>Add to list</LinkButton>
          </div>
          {isOwner && (
            <LinkButton to={`/recipes/${recipe.id}/improve`} variant="accent">Improve</LinkButton>
          )}
        </div>

        <dl className="mt-6 grid grid-cols-2 gap-3 text-sm xl:grid-cols-1">
          <MetaItem label="Prep" value={formatTime(recipe.prepTimeMin)} />
          <MetaItem label="Active" value={formatTime(recipe.activeTimeMin)} />
          <MetaItem label="Total" value={formatTime(recipe.totalTimeMin)} />
          <MetaItem
            label="Serves"
            value={
              recipe.servings
                ? `${recipe.servings}${recipe.servingsUnit ? ` ${recipe.servingsUnit}` : ""}`
                : ""
            }
          />
          <MetaItem label="Difficulty" value={recipe.difficulty ?? ""} />
          <MetaItem label="Made" value={cookCount ? `${cookCount}x` : "Not yet"} />
        </dl>

        <section className="mt-6 space-y-2 border-t border-rule pt-4">
          <h2 className="ps-mono text-xs font-semibold uppercase text-ink-3">Source</h2>
          <p className="text-sm text-ink">{sourceLabel}</p>
          {recipe.sourceUrl && (
            <a
              href={recipe.sourceUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="block break-all text-xs text-ink-3 underline underline-offset-2 hover:text-ink"
            >
              {recipe.sourceUrl}
            </a>
          )}
          {!canPublicShare && (
            <p className="rounded-md bg-paper-3 p-3 text-xs leading-5 text-ink-3">
              Public signed-link sharing is unavailable for PDF/EPUB-sourced recipes. Family
              sharing is allowed.
            </p>
          )}
        </section>

        {isOwner && (
          <div className="mt-6 space-y-2 border-t border-rule pt-4">
            <LinkButton to={`/recipes/${recipe.id}/edit`}>Edit recipe</LinkButton>
            <Form method="post">
              <input type="hidden" name="_intent" value="delete" />
              <input type="hidden" name="recipeTitle" value={recipe.title} />
              <Button className="w-full" variant="danger" type="submit">
                Delete recipe
              </Button>
            </Form>
          </div>
        )}
      </div>
    </aside>
  );
}

function MetaItem({ label, value }: { label: string; value: string }) {
  if (!value) return null;
  return (
    <div className="rounded-md border border-rule bg-paper-2 p-3">
      <dt className="ps-mono text-xs uppercase text-ink-4">{label}</dt>
      <dd className="mt-1 font-medium text-ink">{value}</dd>
    </div>
  );
}

function LinkButton({
  to,
  children,
  variant = "secondary",
}: {
  to: string;
  children: React.ReactNode;
  variant?: "primary" | "secondary" | "accent";
}) {
  return (
    <Link
      to={to}
      className={`ps-control inline-flex w-full items-center justify-center border px-4 text-sm font-medium focus-visible:ps-focus-ring ${
        variant === "primary"
          ? "border-transparent bg-primary text-primary-foreground hover:opacity-90"
          : variant === "accent"
            ? "border-rule bg-paper-3 text-ink hover:bg-paper-2"
            : "border-rule bg-paper-2 text-ink hover:bg-paper-3"
      }`}
    >
      {children}
    </Link>
  );
}

function VariantPanel({ variants }: { variants: Variant[] }) {
  return (
    <section className="space-y-3">
      <h2 className="ps-display text-xl text-ink">Saved variants</h2>
      <div className="grid gap-2">
        {variants.map((variant) => (
          <Link
            key={variant.id}
            to={`/recipes/${variant.id}`}
            className="grid grid-cols-[2rem_minmax(0,1fr)_auto] items-center gap-3 rounded-lg border border-rule bg-paper-2 p-3 hover:bg-paper-3"
          >
            <span className="flex h-8 w-8 items-center justify-center rounded-md bg-paper-3 text-primary">
              *
            </span>
            <span className="min-w-0">
              <span className="block truncate text-sm font-semibold text-ink">{variant.title}</span>
              <span className="text-xs text-ink-3">
                Saved {variant.createdAt ? new Date(variant.createdAt).toLocaleDateString() : ""}
              </span>
            </span>
            <span className="text-xs font-medium text-ink-3">Open</span>
          </Link>
        ))}
      </div>
    </section>
  );
}
