import { Link, useNavigate } from "react-router";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { eq, inArray } from "drizzle-orm";
import type { Route } from "./+types/recipes";
import { requireUser } from "~/lib/auth.server";
import { createDb, schema } from "~/db";
import { FAMILY_RECIPE_VISIBILITY } from "~/lib/family-sharing";
import { AppShell } from "~/components/app-shell";
import { Button, Chip, FilterGroup, ImageFallback, SectionHeader, SegmentedControl } from "~/components/ui";
import { appImageSrcSet, appImageUrl } from "~/lib/image-url";

const LOAD_INCREMENT = 30;

type SortOption = "recent" | "alpha" | "most-made";
type ViewOption = "grid" | "list";
type DensityOption = "compact" | "regular" | "comfy";

type RecipeCard = {
  id: string;
  title: string;
  totalTimeMin: number | null;
  imageKey: string | null;
  createdAt: number;
  cookCount: number;
  ownerName: string;
  isOwnedByViewer: boolean;
  visibility: string;
};

type TagCount = {
  id: string;
  name: string;
  recipeCount: number;
};

type CookbookCount = {
  id: string;
  name: string;
  description: string | null;
  archived: boolean;
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
  selectedCookbookId: string | null
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
      WHERE rt.recipe_id = r.id AND t.name = ?
    )`);
    params.push(tag);
  }

  if (selectedCookbookId) {
    parts.push(`EXISTS (
      SELECT 1 FROM cookbook_recipes cr
      WHERE cr.recipe_id = r.id AND cr.cookbook_id = ?
    )`);
    params.push(selectedCookbookId);
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
  const requestedLimit = parseInt(url.searchParams.get("limit") ?? String(LOAD_INCREMENT), 10);
  const limit = Math.max(
    LOAD_INCREMENT,
    Number.isFinite(requestedLimit) ? requestedLimit : LOAD_INCREMENT
  );
  const rawTags = url.searchParams.get("tags") ?? "";
  const selectedTags = rawTags
    ? rawTags
        .split(",")
        .map((t) => t.trim())
        .filter(Boolean)
    : [];
  const showArchived = url.searchParams.get("archived") === "1";
  const selectedCookbookId = url.searchParams.get("cookbook")?.trim() || null;
  const rawView = url.searchParams.get("view") ?? "grid";
  const view: ViewOption = rawView === "list" ? "list" : "grid";
  const rawDensity = url.searchParams.get("density") ?? "regular";
  const density: DensityOption =
    rawDensity === "compact" || rawDensity === "comfy" ? rawDensity : "regular";
  const rawScope = url.searchParams.get("scope") ?? "mine";
  const scope: "mine" | "family" | "shared" =
    rawScope === "family" || rawScope === "shared" ? rawScope : "mine";
  const accessSql =
    scope === "mine"
      ? "r.user_id = ?"
      : scope === "shared"
        ? "r.user_id <> ? AND r.visibility = ?"
        : "(r.user_id = ? OR r.visibility = ?)";
  const accessParams =
    scope === "mine" ? [user.id] : [user.id, FAMILY_RECIPE_VISIBILITY];

  const d1 = context.cloudflare.env.DB;
  const { db } = createDb(d1);

  const safeQ = q ? sanitizeFtsQuery(q) : "";
  const orderBy = orderByClause(sort);
  const { sql: filterSql, params: filterParams } = buildFilterFragments(
    selectedTags,
    showArchived,
    selectedCookbookId
  );

  let rows: RecipeCard[];
  let total: number;

  if (safeQ) {
    const [rowsResult, countResult] = await Promise.all([
      d1
        .prepare(
          `SELECT r.id, r.title, r.total_time_min, r.image_key, r.created_at,
                  r.user_id, r.visibility, u.name as owner_name,
                  COALESCE(cl.cook_count, 0) as cook_count
           FROM recipes_fts fts
           JOIN recipes r ON r.rowid = fts.rowid
           JOIN users u ON u.id = r.user_id
           LEFT JOIN (
             SELECT recipe_id, COUNT(*) as cook_count
             FROM cooking_log WHERE user_id = ?
             GROUP BY recipe_id
           ) cl ON r.id = cl.recipe_id
           WHERE recipes_fts MATCH ?
             AND ${accessSql}
             AND r.deleted_at IS NULL
             ${filterSql}
           ORDER BY ${orderBy}
           LIMIT ?`
        )
        .bind(user.id, safeQ, ...accessParams, ...filterParams, limit)
        .all<{
          id: string;
          title: string;
          total_time_min: number | null;
          image_key: string | null;
          created_at: number;
          user_id: string;
          visibility: string;
          owner_name: string;
          cook_count: number;
        }>(),
      d1
        .prepare(
          `SELECT COUNT(*) as cnt
           FROM recipes_fts fts
           JOIN recipes r ON r.rowid = fts.rowid
           WHERE recipes_fts MATCH ?
             AND ${accessSql}
             AND r.deleted_at IS NULL
             ${filterSql}`
        )
        .bind(safeQ, ...accessParams, ...filterParams)
        .first<{ cnt: number }>(),
    ]);
    rows = (rowsResult.results ?? []).map((r) => ({
      id: r.id,
      title: r.title,
      totalTimeMin: r.total_time_min,
      imageKey: r.image_key,
      createdAt: r.created_at,
      ownerName: r.owner_name,
      isOwnedByViewer: r.user_id === user.id,
      visibility: r.visibility,
      cookCount: r.cook_count,
    }));
    total = countResult?.cnt ?? 0;
  } else {
    const [rowsResult, countResult] = await Promise.all([
      d1
        .prepare(
          `SELECT r.id, r.title, r.total_time_min, r.image_key, r.created_at,
                  r.user_id, r.visibility, u.name as owner_name,
                  COALESCE(cl.cook_count, 0) as cook_count
           FROM recipes r
           JOIN users u ON u.id = r.user_id
           LEFT JOIN (
             SELECT recipe_id, COUNT(*) as cook_count
             FROM cooking_log WHERE user_id = ?
             GROUP BY recipe_id
           ) cl ON r.id = cl.recipe_id
           WHERE ${accessSql}
             AND r.deleted_at IS NULL
             ${filterSql}
           ORDER BY ${orderBy}
           LIMIT ?`
        )
        .bind(user.id, ...accessParams, ...filterParams, limit)
        .all<{
          id: string;
          title: string;
          total_time_min: number | null;
          image_key: string | null;
          created_at: number;
          user_id: string;
          visibility: string;
          owner_name: string;
          cook_count: number;
        }>(),
      d1
        .prepare(
           `SELECT COUNT(*) as cnt
           FROM recipes r
           WHERE ${accessSql}
             AND r.deleted_at IS NULL
             ${filterSql}`
        )
        .bind(...accessParams, ...filterParams)
        .first<{ cnt: number }>(),
    ]);
    rows = (rowsResult.results ?? []).map((r) => ({
      id: r.id,
      title: r.title,
      totalTimeMin: r.total_time_min,
      imageKey: r.image_key,
      createdAt: r.created_at,
      ownerName: r.owner_name,
      isOwnedByViewer: r.user_id === user.id,
      visibility: r.visibility,
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
       LEFT JOIN recipes r ON rt.recipe_id = r.id AND r.deleted_at IS NULL AND ${accessSql}
       WHERE ${scope === "mine" ? "t.user_id = ?" : "r.id IS NOT NULL"}
       GROUP BY t.id, t.name
       ORDER BY t.name ASC`
    )
    .bind(...accessParams, ...(scope === "mine" ? [user.id] : []))
    .all<{ id: string; name: string; recipe_count: number }>();

  const allTags: TagCount[] = (allTagsResult.results ?? []).map((r) => ({
    id: r.id,
    name: r.name,
    recipeCount: r.recipe_count,
  }));

  const allCookbooksResult = await d1
    .prepare(
      `SELECT cb.id, cb.name, cb.description, cb.archived, COUNT(DISTINCT r.id) as recipe_count
       FROM cookbooks cb
       LEFT JOIN cookbook_recipes cr ON cr.cookbook_id = cb.id
       LEFT JOIN recipes r ON r.id = cr.recipe_id
        AND r.deleted_at IS NULL
        AND ${accessSql}
       WHERE cb.user_id = ?
       GROUP BY cb.id, cb.name, cb.description, cb.archived
       ORDER BY cb.archived ASC, cb.name ASC`
    )
    .bind(...accessParams, user.id)
    .all<{
      id: string;
      name: string;
      description: string | null;
      archived: number;
      recipe_count: number;
    }>();

  const allCookbooks: CookbookCount[] = (allCookbooksResult.results ?? []).map((r) => ({
    id: r.id,
    name: r.name,
    description: r.description,
    archived: r.archived === 1,
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
    user: { name: user.name, email: user.email },
    recipes: rows,
    tagsByRecipe,
    allTags,
    allCookbooks,
    selectedTags,
    selectedCookbookId,
    showArchived,
    view,
    density,
    scope,
    total,
    limit,
    loadIncrement: LOAD_INCREMENT,
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

export default function RecipeList({ loaderData }: Route.ComponentProps) {
  const {
    user,
    recipes,
    tagsByRecipe,
    allTags,
    allCookbooks,
    selectedTags,
    selectedCookbookId,
    showArchived,
    view,
    density,
    scope,
    total,
    limit,
    loadIncrement,
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
      sort: sort === "recent" ? null : sort,
      limit: limit > loadIncrement ? String(limit) : null,
      tags: selectedTags.length > 0 ? selectedTags.join(",") : null,
      cookbook: selectedCookbookId,
      archived: showArchived ? "1" : null,
      scope: scope === "mine" ? null : scope,
      view: view === "grid" ? null : view,
      density: density === "regular" ? null : density,
    };
    const merged = { ...base, ...overrides };
    for (const [k, v] of Object.entries(merged)) {
      if (v !== null && v !== "") {
        params.set(k, v);
      }
    }
    return params.toString();
  }

  function handleSearchChange(value: string) {
    setInputValue(value);
    clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      const qs = buildParams({ q: value.trim() || null, limit: null });
      navigate(`/recipes${qs ? `?${qs}` : ""}`, { replace: true });
    }, 300);
  }

  function handleSortChange(newSort: SortOption) {
    const qs = buildParams({ sort: newSort, limit: null });
    navigate(`/recipes${qs ? `?${qs}` : ""}`);
  }

  function handleViewChange(newView: ViewOption) {
    const qs = buildParams({ view: newView === "grid" ? null : newView });
    navigate(`/recipes${qs ? `?${qs}` : ""}`, { replace: true });
  }

  function handleDensityChange(newDensity: DensityOption) {
    const qs = buildParams({ density: newDensity === "regular" ? null : newDensity });
    navigate(`/recipes${qs ? `?${qs}` : ""}`, { replace: true });
  }

  function toggleTag(tagName: string) {
    const newTags = selectedTags.includes(tagName)
      ? selectedTags.filter((t) => t !== tagName)
      : [...selectedTags, tagName];
    const qs = buildParams({
      tags: newTags.length > 0 ? newTags.join(",") : null,
      limit: null,
    });
    navigate(`/recipes${qs ? `?${qs}` : ""}`);
  }

  function toggleArchived() {
    const qs = buildParams({ archived: showArchived ? null : "1", limit: null });
    navigate(`/recipes${qs ? `?${qs}` : ""}`);
  }

  function selectCookbook(cookbookId: string | null) {
    const qs = buildParams({ cookbook: cookbookId, limit: null });
    navigate(`/recipes${qs ? `?${qs}` : ""}`);
    setFilterOpen(false);
  }

  function clearFilters() {
    const qs = buildParams({ tags: null, archived: null, cookbook: null, limit: null });
    navigate(`/recipes${qs ? `?${qs}` : ""}`);
    setFilterOpen(false);
  }

  function clearAll() {
    navigate("/recipes");
    setFilterOpen(false);
  }

  const nextLimit = Math.min(limit + loadIncrement, total);
  const visibleCount = Math.min(recipes.length, total);
  const hasMoreRecipes = visibleCount < total;
  const loadMoreUrl = (() => {
    const qs = buildParams({ limit: String(nextLimit) });
    return `/recipes${qs ? `?${qs}` : ""}`;
  })();

  const hasRecipes = recipes.length > 0;
  const selectedCookbook = selectedCookbookId
    ? allCookbooks.find((cookbook) => cookbook.id === selectedCookbookId) ?? null
    : null;
  const activeFilterCount =
    selectedTags.length + (showArchived ? 1 : 0) + (selectedCookbook ? 1 : 0);
  const hasActiveFilters = activeFilterCount > 0;
  const activeCookbooks = allCookbooks.filter((cookbook) => !cookbook.archived);
  const archivedCookbooks = allCookbooks.filter((cookbook) => cookbook.archived);
  const shellCookbooks = activeCookbooks.slice(0, 6).map((cookbook) => ({
    id: cookbook.id,
    name: cookbook.name,
    href: `/cookbooks/${cookbook.id}`,
    count: cookbook.recipeCount,
  }));

  return (
    <AppShell user={user} cookbooks={shellCookbooks}>
      <div className="space-y-5">
        <SectionHeader
          eyebrow="Library"
          title="Recipes"
          description={`${total} recipe${total === 1 ? "" : "s"} found across ${SCOPE_LABELS[scope].toLowerCase()} recipes.`}
          actions={
            <>
              <Button
                className="lg:hidden"
                variant={filterOpen ? "primary" : "secondary"}
                onClick={() => setFilterOpen((open) => !open)}
              >
                Filters {activeFilterCount > 0 ? `(${activeFilterCount})` : ""}
              </Button>
              <LinkButton to="/recipes/new">New recipe</LinkButton>
            </>
          }
        />

        <div className="grid gap-5 lg:grid-cols-[17rem_minmax(0,1fr)]">
          <aside className="hidden lg:block">
            <FilterRail
              scope={scope}
              allTags={allTags}
              selectedTags={selectedTags}
              allCookbooks={allCookbooks}
              selectedCookbookId={selectedCookbookId}
              showArchived={showArchived}
              buildParams={buildParams}
              toggleTag={toggleTag}
              toggleArchived={toggleArchived}
              selectCookbook={selectCookbook}
              clearFilters={clearFilters}
              hasActiveFilters={hasActiveFilters}
              activeCookbooks={activeCookbooks}
              archivedCookbooks={archivedCookbooks}
            />
          </aside>

          <div className="min-w-0 space-y-4">
            {filterOpen && (
              <div className="rounded-lg border border-rule bg-paper-2 p-4 shadow-[var(--shadow-2)] lg:hidden">
                <FilterRail
                  scope={scope}
                  allTags={allTags}
                  selectedTags={selectedTags}
                  allCookbooks={allCookbooks}
                  selectedCookbookId={selectedCookbookId}
                  showArchived={showArchived}
                  buildParams={buildParams}
                  toggleTag={toggleTag}
                  toggleArchived={toggleArchived}
                  selectCookbook={selectCookbook}
                  clearFilters={clearFilters}
                  hasActiveFilters={hasActiveFilters}
                  activeCookbooks={activeCookbooks}
                  archivedCookbooks={archivedCookbooks}
                />
              </div>
            )}

            <div className="rounded-lg border border-rule bg-paper-2 p-4 shadow-[var(--shadow-1)]">
              <div className="flex flex-col gap-3 xl:flex-row xl:items-center">
                <label className="min-w-0 flex-1">
                  <span className="sr-only">Search recipes</span>
                  <input
                    type="search"
                    value={inputValue}
                    onChange={(event) => handleSearchChange(event.target.value)}
                    placeholder="Search title, ingredient, or note"
                    className="ps-control w-full border border-rule bg-paper px-3 text-sm text-ink placeholder:text-ink-4 focus-visible:ps-focus-ring"
                  />
                </label>
                <div className="flex flex-wrap items-center gap-2">
                  <SegmentedControl
                    label="Sort recipes"
                    value={sort}
                    onChange={handleSortChange}
                    options={[
                      { value: "recent", label: "Recent" },
                      { value: "alpha", label: "A-Z" },
                      { value: "most-made", label: "Most cooked" },
                    ]}
                  />
                  <SegmentedControl
                    label="Recipe view"
                    value={view}
                    onChange={handleViewChange}
                    options={[
                      { value: "grid", label: "Grid" },
                      { value: "list", label: "List" },
                    ]}
                  />
                  <SegmentedControl
                    label="Density"
                    value={density}
                    onChange={handleDensityChange}
                    options={[
                      { value: "compact", label: "Compact" },
                      { value: "regular", label: "Regular" },
                      { value: "comfy", label: "Comfy" },
                    ]}
                  />
                </div>
              </div>

              {(q || hasActiveFilters) && (
                <ActiveFilters
                  q={q}
                  selectedTags={selectedTags}
                  selectedCookbook={selectedCookbook}
                  showArchived={showArchived}
                  toggleTag={toggleTag}
                  selectCookbook={selectCookbook}
                  toggleArchived={toggleArchived}
                  clearAll={clearAll}
                />
              )}
            </div>

            {!hasRecipes ? (
              <EmptyState
                q={q}
                hasActiveFilters={hasActiveFilters}
                selectedTags={selectedTags}
                selectedCookbook={selectedCookbook}
                clearAll={clearAll}
              />
            ) : view === "grid" ? (
              <RecipeGrid
                recipes={recipes}
                tagsByRecipe={tagsByRecipe}
                density={density}
              />
            ) : (
              <RecipeTable
                recipes={recipes}
                tagsByRecipe={tagsByRecipe}
                density={density}
              />
            )}

            {hasRecipes && (
              <LoadMoreStatus
                visibleCount={visibleCount}
                total={total}
                hasMore={hasMoreRecipes}
                loadMoreUrl={loadMoreUrl}
                loadIncrement={loadIncrement}
              />
            )}
          </div>
        </div>
      </div>
    </AppShell>
  );
}

const SCOPE_LABELS: Record<"mine" | "family" | "shared", string> = {
  mine: "Mine",
  family: "Family",
  shared: "Shared with You",
};

function LinkButton({ to, children }: { to: string; children: ReactNode }) {
  return (
    <Link
      to={to}
      className="ps-control inline-flex items-center justify-center border border-transparent bg-primary px-4 text-sm font-medium text-primary-foreground hover:opacity-90 focus-visible:ps-focus-ring"
    >
      {children}
    </Link>
  );
}

function FilterRail({
  scope,
  allTags,
  selectedTags,
  allCookbooks,
  selectedCookbookId,
  showArchived,
  buildParams,
  toggleTag,
  toggleArchived,
  selectCookbook,
  clearFilters,
  hasActiveFilters,
  activeCookbooks,
  archivedCookbooks,
}: {
  scope: "mine" | "family" | "shared";
  allTags: TagCount[];
  selectedTags: string[];
  allCookbooks: CookbookCount[];
  selectedCookbookId: string | null;
  showArchived: boolean;
  buildParams: (overrides: Record<string, string | null>) => string;
  toggleTag: (tagName: string) => void;
  toggleArchived: () => void;
  selectCookbook: (cookbookId: string | null) => void;
  clearFilters: () => void;
  hasActiveFilters: boolean;
  activeCookbooks: CookbookCount[];
  archivedCookbooks: CookbookCount[];
}) {
  return (
    <div className="space-y-6 rounded-lg border border-rule bg-paper-2 p-4 shadow-[var(--shadow-1)]">
      <FilterGroup title="Scope">
        {(["mine", "family", "shared"] as const).map((option) => {
          const qs = buildParams({
            scope: option === "mine" ? null : option,
            limit: null,
          });
          return (
            <Link
              key={option}
              to={`/recipes${qs ? `?${qs}` : ""}`}
              className={`ps-control inline-flex min-h-8 items-center justify-center border px-3 text-xs font-medium focus-visible:ps-focus-ring ${
                scope === option
                  ? "border-transparent bg-primary text-primary-foreground"
                  : "border-rule bg-paper text-ink hover:bg-paper-3"
              }`}
            >
              {SCOPE_LABELS[option]}
            </Link>
          );
        })}
      </FilterGroup>

      <FilterGroup
        title="Tags"
        actions={
          selectedTags.length > 0 ? (
            <button
              type="button"
              onClick={clearFilters}
              className="text-xs font-medium text-ink-3 hover:text-ink"
            >
              Clear all
            </button>
          ) : null
        }
      >
        {allTags.length === 0 ? (
          <p className="text-sm text-ink-3">No tags yet.</p>
        ) : (
          allTags.slice(0, 18).map((tag) => (
            <button
              key={tag.id}
              type="button"
              onClick={() => toggleTag(tag.name)}
              className={`inline-flex min-h-7 items-center gap-1.5 rounded-full border px-2.5 text-xs font-medium ${
                selectedTags.includes(tag.name)
                  ? "border-transparent bg-primary text-primary-foreground"
                  : "border-rule bg-paper text-ink hover:bg-paper-3"
              }`}
            >
              {tag.name}
              <span className="opacity-70">{tag.recipeCount}</span>
            </button>
          ))
        )}
      </FilterGroup>

      <FilterGroup
        title="Cookbooks"
        actions={
          allCookbooks.length > 0 ? (
            <span className="text-xs text-ink-4">{allCookbooks.length}</span>
          ) : null
        }
      >
        <div className="grid w-full gap-1">
          <CookbookFilterButton
            cookbook={null}
            selected={!selectedCookbookId}
            onClick={() => selectCookbook(null)}
          />
          {activeCookbooks.map((cookbook) => (
            <CookbookFilterButton
              key={cookbook.id}
              cookbook={cookbook}
              selected={selectedCookbookId === cookbook.id}
              onClick={() => selectCookbook(cookbook.id)}
            />
          ))}
          {archivedCookbooks.length > 0 && (
            <div className="mt-2 border-t border-rule pt-2">
              <button
                type="button"
                onClick={toggleArchived}
                className={`mb-2 inline-flex min-h-8 w-full items-center justify-between rounded-md border px-2 text-xs font-medium ${
                  showArchived
                    ? "border-transparent bg-primary text-primary-foreground"
                    : "border-rule bg-paper text-ink hover:bg-paper-3"
                }`}
              >
                <span>{showArchived ? "Hide archived" : "Show archived"}</span>
                <span>{archivedCookbooks.length}</span>
              </button>
              {showArchived &&
                archivedCookbooks.map((cookbook) => (
                  <CookbookFilterButton
                    key={cookbook.id}
                    cookbook={cookbook}
                    selected={selectedCookbookId === cookbook.id}
                    onClick={() => selectCookbook(cookbook.id)}
                  />
                ))}
            </div>
          )}
        </div>
      </FilterGroup>

      <FilterGroup title="Visibility">
        <label className="flex min-h-8 w-full items-center gap-2 rounded-md px-2 text-sm text-ink-2 hover:bg-paper-3">
          <input
            type="checkbox"
            checked={showArchived}
            onChange={toggleArchived}
            className="accent-ink"
          />
          Include recipes only found in archived cookbooks
        </label>
      </FilterGroup>

      {hasActiveFilters && (
        <Button className="w-full" variant="ghost" onClick={clearFilters}>
          Clear filters
        </Button>
      )}
    </div>
  );
}

function CookbookFilterButton({
  cookbook,
  selected,
  onClick,
}: {
  cookbook: CookbookCount | null;
  selected: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex min-h-8 w-full items-center gap-2 rounded-md px-2 text-left text-sm ${
        selected ? "bg-paper-3 text-ink" : "text-ink-2 hover:bg-paper-3 hover:text-ink"
      }`}
    >
      <span
        className={`h-4 w-1 shrink-0 rounded-full ${
          cookbook?.archived ? "bg-ink-4" : "bg-primary"
        }`}
      />
      <span className="min-w-0 flex-1 truncate">{cookbook?.name ?? "All cookbooks"}</span>
      <span className="shrink-0 text-xs text-ink-4">{cookbook?.recipeCount ?? ""}</span>
    </button>
  );
}

function ActiveFilters({
  q,
  selectedTags,
  selectedCookbook,
  showArchived,
  toggleTag,
  selectCookbook,
  toggleArchived,
  clearAll,
}: {
  q: string;
  selectedTags: string[];
  selectedCookbook: CookbookCount | null;
  showArchived: boolean;
  toggleTag: (tagName: string) => void;
  selectCookbook: (cookbookId: string | null) => void;
  toggleArchived: () => void;
  clearAll: () => void;
}) {
  return (
    <div className="mt-4 flex flex-wrap items-center gap-2 border-t border-rule pt-3">
      <span className="text-xs font-semibold uppercase text-ink-3">Active</span>
      {q && <Chip tone="neutral">Search: {q}</Chip>}
      {selectedTags.map((tag) => (
        <button key={tag} type="button" onClick={() => toggleTag(tag)}>
          <Chip selected>{tag} x</Chip>
        </button>
      ))}
      {selectedCookbook && (
        <button type="button" onClick={() => selectCookbook(null)}>
          <Chip selected>{selectedCookbook.name} x</Chip>
        </button>
      )}
      {showArchived && (
        <button type="button" onClick={toggleArchived}>
          <Chip selected>Archived visible x</Chip>
        </button>
      )}
      <Button size="sm" variant="ghost" onClick={clearAll}>
        Reset library
      </Button>
    </div>
  );
}

function RecipeGrid({
  recipes,
  tagsByRecipe,
  density,
}: {
  recipes: RecipeCard[];
  tagsByRecipe: Record<string, string[]>;
  density: DensityOption;
}) {
  const cardClass =
    density === "compact"
      ? "sm:grid-cols-2 xl:grid-cols-4"
      : density === "comfy"
        ? "sm:grid-cols-2 xl:grid-cols-3"
        : "sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4";

  return (
    <div className={`grid gap-4 ${cardClass}`}>
      {recipes.map((recipe) => (
        <RecipeTile
          key={recipe.id}
          recipe={recipe}
          tags={tagsByRecipe[recipe.id] ?? []}
          density={density}
        />
      ))}
    </div>
  );
}

function RecipeTile({
  recipe,
  tags,
  density,
}: {
  recipe: RecipeCard;
  tags: string[];
  density: DensityOption;
}) {
  const imageClass = density === "compact" ? "aspect-[16/10]" : "aspect-[4/3]";

  return (
    <Link
      to={`/recipes/${recipe.id}`}
      prefetch="intent"
      className="group overflow-hidden rounded-lg border border-rule bg-paper-2 shadow-[var(--shadow-1)] transition hover:border-ink-4 hover:shadow-[var(--shadow-2)]"
    >
      <div className={`${imageClass} overflow-hidden bg-paper-3`}>
        <ResponsiveRecipeImage imageKey={recipe.imageKey} title={recipe.title} />
      </div>
      <div className={density === "compact" ? "space-y-2 p-3" : "space-y-3 p-4"}>
        <div className="flex items-start gap-2">
          <h2 className="line-clamp-2 flex-1 text-sm font-semibold leading-snug text-ink group-hover:text-primary">
            {recipe.title}
          </h2>
          {recipe.visibility === FAMILY_RECIPE_VISIBILITY && <Chip>Family</Chip>}
        </div>
        <p className="text-xs text-ink-3">
          {recipe.isOwnedByViewer ? "Yours" : `From ${recipe.ownerName}`}
          {recipe.totalTimeMin ? ` · ${formatTime(recipe.totalTimeMin)}` : ""}
          {recipe.cookCount > 0 ? ` · Cooked ${recipe.cookCount}x` : ""}
        </p>
        {tags.length > 0 && (
          <div className="flex flex-wrap gap-1.5">
            {tags.slice(0, density === "compact" ? 2 : 3).map((tag) => (
              <Chip key={tag}>{tag}</Chip>
            ))}
            {tags.length > (density === "compact" ? 2 : 3) && (
              <Chip>+{tags.length - (density === "compact" ? 2 : 3)}</Chip>
            )}
          </div>
        )}
      </div>
    </Link>
  );
}

function RecipeTable({
  recipes,
  tagsByRecipe,
  density,
}: {
  recipes: RecipeCard[];
  tagsByRecipe: Record<string, string[]>;
  density: DensityOption;
}) {
  return (
    <div className="overflow-hidden rounded-lg border border-rule bg-paper-2 shadow-[var(--shadow-1)]">
      <div className="hidden grid-cols-[3rem_minmax(0,1fr)_12rem_6rem_6rem] gap-3 border-b border-rule bg-paper-3 px-4 py-2 text-xs font-semibold uppercase text-ink-3 md:grid">
        <span />
        <span>Recipe</span>
        <span>Tags</span>
        <span>Time</span>
        <span>Made</span>
      </div>
      <div>
        {recipes.map((recipe) => (
          <RecipeListRow
            key={recipe.id}
            recipe={recipe}
            tags={tagsByRecipe[recipe.id] ?? []}
            density={density}
          />
        ))}
      </div>
    </div>
  );
}

function RecipeListRow({
  recipe,
  tags,
  density,
}: {
  recipe: RecipeCard;
  tags: string[];
  density: DensityOption;
}) {
  const rowPadding = density === "compact" ? "px-3 py-2" : density === "comfy" ? "px-4 py-4" : "px-4 py-3";

  return (
    <Link
      to={`/recipes/${recipe.id}`}
      prefetch="intent"
      className={`grid gap-3 border-b border-rule last:border-b-0 hover:bg-paper-3 md:grid-cols-[3rem_minmax(0,1fr)_12rem_6rem_6rem] ${rowPadding}`}
    >
      <div className="h-12 w-12 overflow-hidden rounded-md bg-paper-3">
        <ResponsiveRecipeImage imageKey={recipe.imageKey} title={recipe.title} />
      </div>
      <div className="min-w-0">
        <h2 className="truncate text-sm font-semibold text-ink">{recipe.title}</h2>
        <p className="mt-0.5 truncate text-xs text-ink-3">
          {recipe.isOwnedByViewer ? "Yours" : `From ${recipe.ownerName}`}
          {recipe.visibility === FAMILY_RECIPE_VISIBILITY ? " · Family" : ""}
        </p>
      </div>
      <div className="flex flex-wrap items-center gap-1.5">
        {tags.length > 0 ? tags.slice(0, 2).map((tag) => <Chip key={tag}>{tag}</Chip>) : (
          <span className="text-xs text-ink-4">No tags</span>
        )}
      </div>
      <span className="text-sm text-ink-3">{formatTime(recipe.totalTimeMin) || "-"}</span>
      <span className="text-sm text-ink-3">{recipe.cookCount || "-"}</span>
    </Link>
  );
}

function EmptyState({
  q,
  hasActiveFilters,
  selectedTags,
  selectedCookbook,
  clearAll,
}: {
  q: string;
  hasActiveFilters: boolean;
  selectedTags: string[];
  selectedCookbook: CookbookCount | null;
  clearAll: () => void;
}) {
  const filtered = q || hasActiveFilters;

  return (
    <div className="rounded-lg border border-dashed border-rule bg-paper-2 px-6 py-16 text-center">
      <h2 className="ps-display text-2xl text-ink">
        {filtered ? "No recipes match this shelf" : "No recipes yet"}
      </h2>
      <p className="mx-auto mt-2 max-w-md text-sm text-ink-3">
        {filtered
          ? [
              q ? `Search "${q}"` : null,
              selectedTags.length ? `Tags ${selectedTags.join(", ")}` : null,
              selectedCookbook ? `Cookbook ${selectedCookbook.name}` : null,
            ]
              .filter(Boolean)
              .join(" · ") || "Try broadening the current filters."
          : "Add a recipe or import a cookbook to start building the family library."}
      </p>
      <div className="mt-5 flex justify-center gap-2">
        {filtered ? (
          <Button variant="primary" onClick={clearAll}>Reset library</Button>
        ) : (
          <LinkButton to="/recipes/new">Add recipe</LinkButton>
        )}
      </div>
    </div>
  );
}

function LoadMoreStatus({
  visibleCount,
  total,
  hasMore,
  loadMoreUrl,
  loadIncrement,
}: {
  visibleCount: number;
  total: number;
  hasMore: boolean;
  loadMoreUrl: string;
  loadIncrement: number;
}) {
  return (
    <div className="rounded-lg border border-rule bg-paper-2 px-4 py-4 text-center shadow-[var(--shadow-1)]">
      <p className="text-sm text-ink-3">
        Showing <span className="font-semibold text-ink">{visibleCount}</span> of{" "}
        <span className="font-semibold text-ink">{total}</span> recipes
      </p>
      {hasMore ? (
        <Link
          to={loadMoreUrl}
          preventScrollReset
          className="ps-control mt-3 inline-flex items-center justify-center border border-rule bg-paper px-4 text-sm font-medium text-ink hover:bg-paper-3 focus-visible:ps-focus-ring"
        >
          Load {Math.min(loadIncrement, total - visibleCount)} more
        </Link>
      ) : (
        <span className="mt-2 block text-xs font-medium uppercase text-ink-4">
          End of library
        </span>
      )}
    </div>
  );
}

function ResponsiveRecipeImage({
  imageKey,
  title,
}: {
  imageKey: string | null;
  title: string;
}) {
  const src = appImageUrl(imageKey, { width: 384, format: "webp" });

  if (!src) {
    return <ImageFallback imageKey={null} alt={title} label="Recipe" />;
  }

  return (
    <img
      src={src}
      srcSet={appImageSrcSet(imageKey, [192, 384, 768])}
      sizes="(min-width: 1280px) 25vw, (min-width: 768px) 33vw, 100vw"
      alt={title}
      className="h-full w-full object-cover"
      loading="lazy"
      decoding="async"
    />
  );
}
