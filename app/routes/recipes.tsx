import { Link, useNavigate } from "react-router";
import { useEffect, useRef, useState } from "react";
import { eq, inArray } from "drizzle-orm";
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

type TagCount = {
  id: string;
  name: string;
  recipeCount: number;
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
  return words.map((w) => `"${w}"`).join(" ");
}

function orderByClause(sort: SortOption): string {
  if (sort === "alpha") return "r.title ASC";
  if (sort === "most-made") return "cook_count DESC, r.created_at DESC";
  return "r.created_at DESC";
}

// Build WHERE clause fragments for tag + archived filters.
// Returns a SQL fragment starting with AND (if non-empty) and the corresponding params.
function buildFilterFragments(
  selectedTags: string[],
  showArchived: boolean,
  userId: string
): { sql: string; params: unknown[] } {
  const parts: string[] = [];
  const params: unknown[] = [];

  if (!showArchived) {
    // Show recipe if: not in any cookbook, OR in at least one non-archived cookbook.
    // Hides recipes whose only cookbook associations are archived.
    parts.push(`(
      NOT EXISTS (SELECT 1 FROM cookbook_recipes cr WHERE cr.recipe_id = r.id)
      OR EXISTS (
        SELECT 1 FROM cookbook_recipes cr
        JOIN cookbooks cb ON cr.cookbook_id = cb.id
        WHERE cr.recipe_id = r.id AND cb.archived = 0
      )
    )`);
  }

  for (const tag of selectedTags) {
    parts.push(`EXISTS (
      SELECT 1 FROM recipe_tags rt
      JOIN tags t ON rt.tag_id = t.id
      WHERE rt.recipe_id = r.id AND t.name = ? AND t.user_id = ?
    )`);
    params.push(tag, userId);
  }

  return {
    sql: parts.length > 0 ? " AND " + parts.join(" AND ") : "",
    params,
  };
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
  const rawTags = url.searchParams.get("tags") ?? "";
  const selectedTags = rawTags
    ? rawTags
        .split(",")
        .map((t) => t.trim())
        .filter(Boolean)
    : [];
  const showArchived = url.searchParams.get("archived") === "1";

  const d1 = context.cloudflare.env.DB;
  const { db } = createDb(d1);

  const safeQ = q ? sanitizeFtsQuery(q) : "";
  const orderBy = orderByClause(sort);
  const { sql: filterSql, params: filterParams } = buildFilterFragments(
    selectedTags,
    showArchived,
    user.id
  );

  let rows: RecipeCard[];
  let total: number;

  if (safeQ) {
    const [rowsResult, countResult] = await Promise.all([
      d1
        .prepare(
          `SELECT r.id, r.title, r.total_time_min, r.image_key, r.created_at,
                  COALESCE(cl.cook_count, 0) as cook_count
           FROM recipes_fts fts
           JOIN recipes r ON r.rowid = fts.rowid
           LEFT JOIN (
             SELECT recipe_id, COUNT(*) as cook_count
             FROM cooking_log WHERE user_id = ?
             GROUP BY recipe_id
           ) cl ON r.id = cl.recipe_id
           WHERE recipes_fts MATCH ?
             AND r.user_id = ?
             AND r.deleted_at IS NULL
             ${filterSql}
           ORDER BY ${orderBy}
           LIMIT ? OFFSET ?`
        )
        .bind(user.id, safeQ, user.id, ...filterParams, PAGE_SIZE, offset)
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
           WHERE recipes_fts MATCH ?
             AND r.user_id = ?
             AND r.deleted_at IS NULL
             ${filterSql}`
        )
        .bind(safeQ, user.id, ...filterParams)
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
    const [rowsResult, countResult] = await Promise.all([
      d1
        .prepare(
          `SELECT r.id, r.title, r.total_time_min, r.image_key, r.created_at,
                  COALESCE(cl.cook_count, 0) as cook_count
           FROM recipes r
           LEFT JOIN (
             SELECT recipe_id, COUNT(*) as cook_count
             FROM cooking_log WHERE user_id = ?
             GROUP BY recipe_id
           ) cl ON r.id = cl.recipe_id
           WHERE r.user_id = ?
             AND r.deleted_at IS NULL
             ${filterSql}
           ORDER BY ${orderBy}
           LIMIT ? OFFSET ?`
        )
        .bind(user.id, user.id, ...filterParams, PAGE_SIZE, offset)
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
           FROM recipes r
           WHERE r.user_id = ?
             AND r.deleted_at IS NULL
             ${filterSql}`
        )
        .bind(user.id, ...filterParams)
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
  }

  // All tags for the faceted browser (counts are across non-deleted recipes, no filter applied)
  const allTagsResult = await d1
    .prepare(
      `SELECT t.id, t.name, COUNT(DISTINCT r.id) as recipe_count
       FROM tags t
       LEFT JOIN recipe_tags rt ON t.id = rt.tag_id
       LEFT JOIN recipes r ON rt.recipe_id = r.id AND r.deleted_at IS NULL AND r.user_id = ?
       WHERE t.user_id = ?
       GROUP BY t.id, t.name
       ORDER BY t.name ASC`
    )
    .bind(user.id, user.id)
    .all<{ id: string; name: string; recipe_count: number }>();

  const allTags: TagCount[] = (allTagsResult.results ?? []).map((r) => ({
    id: r.id,
    name: r.name,
    recipeCount: r.recipe_count,
  }));

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
    allTags,
    selectedTags,
    showArchived,
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
  const {
    recipes,
    tagsByRecipe,
    allTags,
    selectedTags,
    showArchived,
    total,
    page,
    pageCount,
    sort,
    q,
  } = loaderData;
  const navigate = useNavigate();
  const [inputValue, setInputValue] = useState(q);
  const [filterOpen, setFilterOpen] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  useEffect(() => {
    setInputValue(q);
  }, [q]);

  function buildParams(overrides: Record<string, string | null>): string {
    const params = new URLSearchParams();
    const base: Record<string, string | null> = {
      q: q || null,
      sort,
      page: String(page),
      tags: selectedTags.length > 0 ? selectedTags.join(",") : null,
      archived: showArchived ? "1" : null,
    };
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

  function toggleTag(tagName: string) {
    const newTags = selectedTags.includes(tagName)
      ? selectedTags.filter((t) => t !== tagName)
      : [...selectedTags, tagName];
    const qs = buildParams({
      tags: newTags.length > 0 ? newTags.join(",") : null,
      page: "1",
    });
    navigate(`/recipes${qs ? `?${qs}` : ""}`);
  }

  function toggleArchived() {
    const qs = buildParams({ archived: showArchived ? null : "1", page: "1" });
    navigate(`/recipes${qs ? `?${qs}` : ""}`);
  }

  function clearFilters() {
    const qs = buildParams({ tags: null, archived: null, page: "1" });
    navigate(`/recipes${qs ? `?${qs}` : ""}`);
    setFilterOpen(false);
  }

  function buildPageUrl(targetPage: number) {
    const qs = buildParams({ page: String(targetPage) });
    return `/recipes${qs ? `?${qs}` : ""}`;
  }

  const hasRecipes = recipes.length > 0;
  const hasActiveFilters = selectedTags.length > 0 || showArchived;

  return (
    <div className="min-h-screen bg-background">
      <header className="sticky top-0 z-10 bg-background/95 backdrop-blur border-b">
        <div className="max-w-6xl mx-auto px-4 h-14 flex items-center gap-3">
          <span className="font-semibold text-sm flex-1">My Recipes</span>
          {total > 0 && (
            <span className="text-xs text-muted-foreground hidden sm:block">
              {total} recipe{total !== 1 ? "s" : ""}
              {selectedTags.length > 0 && (
                <span className="ml-1">· {selectedTags.join(", ")}</span>
              )}
              {showArchived && (
                <span className="ml-1">· incl. archived</span>
              )}
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

      <main className="max-w-6xl mx-auto px-4 py-6 space-y-4">
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

        {/* Filter bar */}
        {allTags.length > 0 && (
          <div className="flex flex-wrap gap-2 items-center">
            <button
              onClick={() => setFilterOpen(!filterOpen)}
              className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium border transition-colors ${
                filterOpen || selectedTags.length > 0
                  ? "bg-primary text-primary-foreground border-primary"
                  : "bg-background text-foreground border-input hover:bg-muted"
              }`}
            >
              Tags
              {selectedTags.length > 0 && (
                <span className="rounded-full bg-primary-foreground/20 w-4 h-4 flex items-center justify-center text-[10px] font-bold">
                  {selectedTags.length}
                </span>
              )}
              <span className="text-[10px] opacity-60">{filterOpen ? "▲" : "▼"}</span>
            </button>

            <button
              onClick={toggleArchived}
              className={`px-3 py-1.5 rounded-md text-xs font-medium border transition-colors ${
                showArchived
                  ? "bg-primary text-primary-foreground border-primary"
                  : "bg-background text-foreground border-input hover:bg-muted"
              }`}
            >
              {showArchived ? "Hide archived" : "Show archived"}
            </button>

            {/* Active tag chips */}
            {selectedTags.map((tag) => (
              <button
                key={tag}
                onClick={() => toggleTag(tag)}
                className="inline-flex items-center gap-1 rounded-full bg-primary/10 text-primary px-2.5 py-0.5 text-xs font-medium hover:bg-primary/20 transition-colors"
              >
                {tag}
                <span className="opacity-60">×</span>
              </button>
            ))}

            {hasActiveFilters && (
              <button
                onClick={clearFilters}
                className="text-xs text-muted-foreground hover:text-foreground transition-colors underline"
              >
                Clear all
              </button>
            )}
          </div>
        )}

        {/* Collapsible tag panel */}
        {filterOpen && allTags.length > 0 && (
          <div className="border rounded-lg p-3 bg-muted/20">
            <div className="flex flex-wrap gap-2">
              {allTags.map((tag) => {
                const active = selectedTags.includes(tag.name);
                return (
                  <button
                    key={tag.id}
                    onClick={() => toggleTag(tag.name)}
                    className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium border transition-colors ${
                      active
                        ? "bg-primary text-primary-foreground border-primary"
                        : "bg-background text-foreground border-input hover:bg-muted"
                    }`}
                  >
                    {tag.name}
                    <span
                      className={`text-[10px] tabular-nums ${
                        active ? "text-primary-foreground/70" : "text-muted-foreground"
                      }`}
                    >
                      {tag.recipeCount}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {/* Results */}
        {!hasRecipes ? (
          <div className="flex flex-col items-center justify-center py-20 text-center gap-3">
            {q || hasActiveFilters ? (
              <>
                <p className="text-lg font-medium">No recipes match your filters</p>
                <p className="text-sm text-muted-foreground">
                  {q && `Search: "${q}"`}
                  {q && hasActiveFilters && " · "}
                  {selectedTags.length > 0 && `Tags: ${selectedTags.join(", ")}`}
                </p>
                <button
                  onClick={clearFilters}
                  className="mt-1 text-sm text-primary hover:underline"
                >
                  Clear filters
                </button>
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
                      <span className="ml-auto">Cooked {recipe.cookCount}×</span>
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
