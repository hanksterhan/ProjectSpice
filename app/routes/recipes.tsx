import { Link, useNavigate } from "react-router";
import { useEffect, useRef, useState } from "react";
import { and, count, eq, inArray, isNull } from "drizzle-orm";
import type { Route } from "./+types/recipes";
import { requireUser } from "~/lib/auth.server";
import { createDb, schema } from "~/db";

const PAGE_SIZE = 24;

type SortOption = "recent" | "alpha" | "most-made";

type RecipeCard = {
  id: string;
  title: string;
  totalTimeMin: number | null;
  imageKey: string | null;
  createdAt: number;
  cookCount: number;
};

export function meta(_args: Route.MetaArgs) {
  return [{ title: "My Recipes — ProjectSpice" }];
}

const FTS_OPERATORS = new Set(["AND", "OR", "NOT"]);

function sanitizeFtsQuery(q: string): string {
  const words = q
    .replace(/['"*()]/g, " ")
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .filter((w) => !FTS_OPERATORS.has(w.toUpperCase()));
  if (words.length === 0) return "";
  // Quote each word so FTS5 treats them as exact tokens, not operators
  return words.map((w) => `"${w}"`).join(" ");
}

function orderByClause(sort: SortOption): string {
  if (sort === "alpha") return "r.title ASC";
  if (sort === "most-made") return "cook_count DESC, r.created_at DESC";
  return "r.created_at DESC";
}

export async function loader({ request, context }: Route.LoaderArgs) {
  const user = await requireUser(request, context);
  const url = new URL(request.url);
  const q = url.searchParams.get("q")?.trim() ?? "";
  const rawSort = url.searchParams.get("sort") ?? "recent";
  const sort: SortOption = ["recent", "alpha", "most-made"].includes(rawSort)
    ? (rawSort as SortOption)
    : "recent";
  const page = Math.max(1, parseInt(url.searchParams.get("page") ?? "1", 10) || 1);
  const offset = (page - 1) * PAGE_SIZE;

  const d1 = context.cloudflare.env.DB;
  const { db } = createDb(d1);

  const safeQ = q ? sanitizeFtsQuery(q) : "";
  const orderBy = orderByClause(sort);

  let rows: RecipeCard[];
  let total: number;

  if (safeQ) {
    // FTS5 search path
    const [rowsResult, countResult] = await Promise.all([
      d1
        .prepare(
          `SELECT r.id, r.title, r.total_time_min, r.image_key, r.created_at,
                  COALESCE(cl.cook_count, 0) as cook_count
           FROM recipes_fts fts
           JOIN recipes r ON r.rowid = fts.rowid
           LEFT JOIN (
             SELECT recipe_id, COUNT(*) as cook_count
             FROM cooking_log WHERE user_id = ?1
             GROUP BY recipe_id
           ) cl ON r.id = cl.recipe_id
           WHERE recipes_fts MATCH ?2
             AND r.user_id = ?3
             AND r.deleted_at IS NULL
           ORDER BY ${orderBy}
           LIMIT ?4 OFFSET ?5`
        )
        .bind(user.id, safeQ, user.id, PAGE_SIZE, offset)
        .all<{
          id: string;
          title: string;
          total_time_min: number | null;
          image_key: string | null;
          created_at: number;
          cook_count: number;
        }>(),
      d1
        .prepare(
          `SELECT COUNT(*) as cnt
           FROM recipes_fts fts
           JOIN recipes r ON r.rowid = fts.rowid
           WHERE recipes_fts MATCH ?1
             AND r.user_id = ?2
             AND r.deleted_at IS NULL`
        )
        .bind(safeQ, user.id)
        .first<{ cnt: number }>(),
    ]);
    rows = (rowsResult.results ?? []).map((r) => ({
      id: r.id,
      title: r.title,
      totalTimeMin: r.total_time_min,
      imageKey: r.image_key,
      createdAt: r.created_at,
      cookCount: r.cook_count,
    }));
    total = countResult?.cnt ?? 0;
  } else {
    // Regular query path (with cook_count for most-made sort)
    const [rowsResult, countResult] = await Promise.all([
      d1
        .prepare(
          `SELECT r.id, r.title, r.total_time_min, r.image_key, r.created_at,
                  COALESCE(cl.cook_count, 0) as cook_count
           FROM recipes r
           LEFT JOIN (
             SELECT recipe_id, COUNT(*) as cook_count
             FROM cooking_log WHERE user_id = ?1
             GROUP BY recipe_id
           ) cl ON r.id = cl.recipe_id
           WHERE r.user_id = ?2 AND r.deleted_at IS NULL
           ORDER BY ${orderBy}
           LIMIT ?3 OFFSET ?4`
        )
        .bind(user.id, user.id, PAGE_SIZE, offset)
        .all<{
          id: string;
          title: string;
          total_time_min: number | null;
          image_key: string | null;
          created_at: number;
          cook_count: number;
        }>(),
      db
        .select({ count: count() })
        .from(schema.recipes)
        .where(
          and(
            eq(schema.recipes.userId, user.id),
            isNull(schema.recipes.deletedAt)
          )
        ),
    ]);
    rows = (rowsResult.results ?? []).map((r) => ({
      id: r.id,
      title: r.title,
      totalTimeMin: r.total_time_min,
      imageKey: r.image_key,
      createdAt: r.created_at,
      cookCount: r.cook_count,
    }));
    total = countResult[0]?.count ?? 0;
  }

  // Batch-load tags for result recipes
  const tagsByRecipe: Record<string, string[]> = {};
  if (rows.length > 0) {
    const ids = rows.map((r) => r.id);
    const tagRows = await db
      .select({
        recipeId: schema.recipeTags.recipeId,
        name: schema.tags.name,
      })
      .from(schema.recipeTags)
      .innerJoin(schema.tags, eq(schema.recipeTags.tagId, schema.tags.id))
      .where(inArray(schema.recipeTags.recipeId, ids));
    for (const row of tagRows) {
      if (!tagsByRecipe[row.recipeId]) tagsByRecipe[row.recipeId] = [];
      tagsByRecipe[row.recipeId].push(row.name);
    }
  }

  return {
    recipes: rows,
    tagsByRecipe,
    total,
    page,
    pageCount: Math.max(1, Math.ceil(total / PAGE_SIZE)),
    sort,
    q,
  };
}

function formatTime(minutes: number | null | undefined): string {
  if (!minutes) return "";
  if (minutes < 60) return `${minutes} min`;
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return m > 0 ? `${h} hr ${m} min` : `${h} hr`;
}

const SORT_LABELS: Record<SortOption, string> = {
  recent: "Recent",
  alpha: "A–Z",
  "most-made": "Most Made",
};

export default function RecipeList({ loaderData }: Route.ComponentProps) {
  const { recipes, tagsByRecipe, total, page, pageCount, sort, q } =
    loaderData;
  const navigate = useNavigate();
  const [inputValue, setInputValue] = useState(q);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  // Sync input when URL q changes (e.g. browser back/forward)
  useEffect(() => {
    setInputValue(q);
  }, [q]);

  function buildParams(overrides: Record<string, string | null>): string {
    const params = new URLSearchParams();
    const base: Record<string, string | null> = { q: q || null, sort, page: String(page) };
    const merged = { ...base, ...overrides };
    for (const [k, v] of Object.entries(merged)) {
      if (v !== null && v !== "" && !(k === "page" && v === "1")) {
        params.set(k, v);
      }
    }
    return params.toString();
  }

  function handleSearchChange(value: string) {
    setInputValue(value);
    clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      const qs = buildParams({ q: value.trim() || null, page: "1" });
      navigate(`/recipes${qs ? `?${qs}` : ""}`, { replace: true });
    }, 300);
  }

  function handleSortChange(newSort: SortOption) {
    const qs = buildParams({ sort: newSort, page: "1" });
    navigate(`/recipes${qs ? `?${qs}` : ""}`);
  }

  function buildPageUrl(targetPage: number) {
    const qs = buildParams({ page: String(targetPage) });
    return `/recipes${qs ? `?${qs}` : ""}`;
  }

  const hasRecipes = recipes.length > 0;

  return (
    <div className="min-h-screen bg-background">
      <header className="sticky top-0 z-10 bg-background/95 backdrop-blur border-b">
        <div className="max-w-6xl mx-auto px-4 h-14 flex items-center gap-3">
          <span className="font-semibold text-sm flex-1">My Recipes</span>
          {total > 0 && (
            <span className="text-xs text-muted-foreground hidden sm:block">
              {total} recipe{total !== 1 ? "s" : ""}
            </span>
          )}
          <Link
            to="/recipes/new"
            className="rounded-md bg-primary text-primary-foreground px-3 py-1.5 text-sm font-medium hover:bg-primary/90 transition-colors shrink-0"
          >
            + New Recipe
          </Link>
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-4 py-6 space-y-5">
        {/* Search + Sort bar */}
        <div className="flex flex-col sm:flex-row gap-3">
          <input
            type="search"
            value={inputValue}
            onChange={(e) => handleSearchChange(e.target.value)}
            placeholder="Search recipes…"
            className="flex-1 h-9 px-3 rounded-md border border-input bg-background text-sm focus:outline-none focus:ring-1 focus:ring-ring"
          />
          <div className="flex gap-1 shrink-0">
            {(["recent", "alpha", "most-made"] as SortOption[]).map((s) => (
              <button
                key={s}
                onClick={() => handleSortChange(s)}
                className={`px-3 py-1.5 rounded-md text-xs font-medium border transition-colors ${
                  sort === s
                    ? "bg-primary text-primary-foreground border-primary"
                    : "bg-background text-foreground border-input hover:bg-muted"
                }`}
              >
                {SORT_LABELS[s]}
              </button>
            ))}
          </div>
        </div>

        {/* Results */}
        {!hasRecipes ? (
          <div className="flex flex-col items-center justify-center py-20 text-center gap-3">
            {q ? (
              <>
                <p className="text-lg font-medium">No recipes match "{q}"</p>
                <p className="text-sm text-muted-foreground">
                  Try a different search term.
                </p>
              </>
            ) : (
              <>
                <p className="text-lg font-medium">No recipes yet</p>
                <p className="text-sm text-muted-foreground">
                  Add your first recipe to get started.
                </p>
                <Link
                  to="/recipes/new"
                  className="mt-2 rounded-md bg-primary text-primary-foreground px-4 py-2 text-sm font-medium hover:bg-primary/90 transition-colors"
                >
                  Add a Recipe
                </Link>
              </>
            )}
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {recipes.map((recipe) => {
              const tags = tagsByRecipe[recipe.id] ?? [];
              const visibleTags = tags.slice(0, 2);
              const extraTags = tags.length - visibleTags.length;
              return (
                <Link
                  key={recipe.id}
                  to={`/recipes/${recipe.id}`}
                  className="group flex flex-col gap-2 rounded-lg border bg-card p-4 hover:border-primary/50 hover:shadow-sm transition-all"
                >
                  <h2 className="font-semibold text-sm leading-snug line-clamp-2 group-hover:text-primary transition-colors">
                    {recipe.title}
                  </h2>
                  <div className="flex items-center gap-3 text-xs text-muted-foreground mt-auto">
                    {recipe.totalTimeMin ? (
                      <span>{formatTime(recipe.totalTimeMin)}</span>
                    ) : null}
                    {recipe.cookCount > 0 ? (
                      <span className="ml-auto">
                        Cooked {recipe.cookCount}×
                      </span>
                    ) : null}
                  </div>
                  {visibleTags.length > 0 && (
                    <div className="flex flex-wrap gap-1">
                      {visibleTags.map((tag) => (
                        <span
                          key={tag}
                          className="inline-flex items-center rounded-full bg-muted px-2 py-0.5 text-xs font-medium"
                        >
                          {tag}
                        </span>
                      ))}
                      {extraTags > 0 && (
                        <span className="inline-flex items-center rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground">
                          +{extraTags}
                        </span>
                      )}
                    </div>
                  )}
                </Link>
              );
            })}
          </div>
        )}

        {/* Pagination */}
        {pageCount > 1 && (
          <div className="flex items-center justify-center gap-3 pt-2">
            {page > 1 ? (
              <Link
                to={buildPageUrl(page - 1)}
                className="px-3 py-1.5 rounded-md border text-sm hover:bg-muted transition-colors"
              >
                ← Prev
              </Link>
            ) : (
              <span className="px-3 py-1.5 rounded-md border text-sm text-muted-foreground opacity-50 cursor-not-allowed">
                ← Prev
              </span>
            )}
            <span className="text-sm text-muted-foreground">
              Page {page} of {pageCount}
            </span>
            {page < pageCount ? (
              <Link
                to={buildPageUrl(page + 1)}
                className="px-3 py-1.5 rounded-md border text-sm hover:bg-muted transition-colors"
              >
                Next →
              </Link>
            ) : (
              <span className="px-3 py-1.5 rounded-md border text-sm text-muted-foreground opacity-50 cursor-not-allowed">
                Next →
              </span>
            )}
          </div>
        )}
      </main>
    </div>
  );
}
