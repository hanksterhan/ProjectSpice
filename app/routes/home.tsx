import { useEffect, useMemo, useState } from "react";
import {
  BookOpen,
  ChevronRight,
  Clock,
  Folder,
  Heart,
  History,
  LayoutGrid,
  Search,
  Star,
  Tags,
  Type,
} from "lucide-react";
import { Form, Link, redirect, useNavigate } from "react-router";

import type { Route } from "./+types/home";
import { formatDisplayTime, seedRecipes, type Recipe } from "~/modules/recipe-domain";
import {
  addRecipeTags,
  getActiveLibraryFilters,
  getDefaultSortDirection,
  getLibraryQueryHref,
  getRecipeCookbookTree,
  getRecipeLibraryFacets,
  getRecipeLibraryResults,
  maxRecipeTags,
  parseBulkTagText,
  parseRecipeLibraryQuery,
  removeRecipeTags,
  type RecipeLibraryFacet,
  type RecipeLibraryQuery,
} from "~/modules/library/recipe-library";
import { getRecipeDetailPath } from "~/modules/recipe-viewer/recipe-detail";
import {
  Button,
  EmptyState,
  RecipeImage,
  Tabs,
} from "~/modules/ui-shell/primitives";
import { useShellDrawer } from "~/modules/ui-shell/AppShell";
import { getRecipeService } from "~/server/recipes/recipe.runtime";

export function meta(_args: Route.MetaArgs) {
  return [{ title: "Recipe Library | ProjectSpice" }];
}

export async function loader({ request, context }: Route.LoaderArgs) {
  const query = parseRecipeLibraryQuery(request.url);
  const allRecipes = await getRecipeService(context).list();
  const recipes = getRecipeLibraryResults(allRecipes, query);

  return {
    facets: getRecipeLibraryFacets(allRecipes, query),
    cookbookTree: getRecipeCookbookTree(allRecipes, query),
    query,
    recipes,
    totalRecipeCount: allRecipes.length,
  };
}

export async function action({ request, context }: Route.ActionArgs) {
  const formData = await request.formData();
  const intent = formData.get("intent");

  if (intent !== "add-tags" && intent !== "remove-tags") {
    return { errors: ["Choose a tag action."] };
  }

  const recipeIds = formData
    .getAll("recipeIds")
    .filter((value): value is string => typeof value === "string" && value.length > 0);
  const tags = parseBulkTagText(String(formData.get("tagsText") ?? ""));

  if (recipeIds.length === 0) {
    return { errors: ["Select at least one recipe."] };
  }

  if (tags.length === 0) {
    return { errors: ["Enter at least one tag."] };
  }

  const service = getRecipeService(context);
  const recipes = await Promise.all(recipeIds.map((recipeId) => service.getById(recipeId)));
  const now = new Date().toISOString();

  for (const recipe of recipes) {
    if (!recipe) {
      continue;
    }

    const nextRecipe =
      intent === "add-tags"
        ? addRecipeTags(recipe, tags)
        : removeRecipeTags(recipe, tags);

    if (nextRecipe.tags.length > maxRecipeTags) {
      return {
        errors: [`Keep recipes to ${maxRecipeTags} tags or fewer.`],
      };
    }

    await service.update(
      {
        ...nextRecipe,
        updatedAt: now,
        version: recipe.version + 1,
      },
      recipe.version,
      intent === "add-tags"
        ? `Added tags: ${tags.join(", ")}`
        : `Removed tags: ${tags.join(", ")}`,
    );
  }

  const url = new URL(request.url);

  return redirect(`${url.pathname}${url.search}`);
}

export default function Home({ loaderData, actionData }: Route.ComponentProps) {
  const fallbackQuery = parseRecipeLibraryQuery("https://spice.local/");
  const {
    cookbookTree = getRecipeCookbookTree(seedRecipes, fallbackQuery),
    facets = getRecipeLibraryFacets(seedRecipes, fallbackQuery),
    query = fallbackQuery,
    recipes = getRecipeLibraryResults(seedRecipes, fallbackQuery),
    totalRecipeCount = seedRecipes.length,
  } = loaderData ?? {};
  const activeFilters = useMemo(() => getActiveLibraryFilters(query), [query]);
  const hasSearch = query.q.length > 0;
  const hasFilters = activeFilters.length > 0;
  const isGridView = query.view === "grid";
  const isListView = query.view === "list";
  const [isBulkMode, setIsBulkMode] = useState(false);
  const showBulkTools = isBulkMode || Boolean(actionData?.errors?.length);
  const resultLabel =
    recipes.length === 1 ? "1 recipe" : `${recipes.length} recipes`;
  const organizerDrawer = useMemo(
    () => ({
      title: "Organize Library",
      content: (
        <LibraryOrganizerDrawer
          activeFilters={activeFilters}
          cookbookTree={cookbookTree}
          facets={facets}
          hasSearch={hasSearch}
          query={query}
        />
      ),
    }),
    [activeFilters, cookbookTree, facets, hasSearch, query],
  );

  useShellDrawer(organizerDrawer);

  return (
    <div className="library-page">
      <section className="page-toolbar" aria-labelledby="library-heading">
        <div>
          <h1 id="library-heading">Recipe Library</h1>
          <p className="page-summary">
            {hasSearch || hasFilters
              ? `${resultLabel} in the current view`
              : `${totalRecipeCount} recipes organized by cookbook and tags`}
          </p>
        </div>

        <div className="toolbar-actions">
          <Link className="button button-primary" to="/recipes/new">
            New Recipe
          </Link>
        </div>
      </section>

      <section className="library-results" aria-labelledby="results-heading">
        <div className="results-header">
          <div>
            <h2 id="results-heading">{resultLabel}</h2>
          </div>
          <div className="results-header-actions">
            <Button
              aria-pressed={showBulkTools}
              onClick={() => setIsBulkMode((value) => !value)}
              type="button"
              variant={showBulkTools ? "primary" : "secondary"}
            >
              {showBulkTools ? "Selecting" : "Select"}
            </Button>
            <Tabs tabs={getViewTabs(query)} />
          </div>
        </div>

          {actionData?.errors?.length ? (
            <div className="form-status error" role="alert">
              <p>{actionData.errors.join(" ")}</p>
            </div>
          ) : null}

          {recipes.length > 0 ? (
            <Form className="library-organizer-form" method="post">
              {showBulkTools ? (
                <div className="bulk-tag-toolbar">
                  <div>
                    <strong>Add or remove comma-separated tags from selected recipes</strong>
                  </div>
                  <label className="field">
                    <span>Tags</span>
                    <input name="tagsText" placeholder="weeknight, favorite" />
                  </label>
                  <div className="editor-actions compact">
                    <Button name="intent" type="submit" value="add-tags" variant="secondary">
                      Add Tags
                    </Button>
                    <Button name="intent" type="submit" value="remove-tags" variant="secondary">
                      Remove Tags
                    </Button>
                    <Button onClick={() => setIsBulkMode(false)} type="button" variant="secondary">
                      Cancel
                    </Button>
                  </div>
                </div>
              ) : null}

              <div
                className={
                  isListView
                    ? "recipe-list large"
                    : isGridView
                      ? "recipe-dense-grid"
                      : "recipe-card-grid"
                }
              >
                {recipes.map((recipe) =>
                  isListView ? (
                    <article className="recipe-row large selectable-recipe" key={recipe.id}>
                      {showBulkTools ? <RecipeSelect recipe={recipe} /> : null}
                      <RecipeImage src={recipe.imageUrl} title={recipe.title} />
                      <div>
                        <h3>
                          <Link to={getRecipeDetailPath(recipe)}>{recipe.title}</Link>
                        </h3>
                        <RecipeRating rating={recipe.rating} />
                        <RecipeMeta query={query} recipe={recipe} />
                      </div>
                    </article>
                  ) : isGridView ? (
                    <article className="recipe-grid-tile selectable-recipe" key={recipe.id}>
                      {showBulkTools ? <RecipeSelect recipe={recipe} /> : null}
                      <Link className="recipe-grid-image-link" to={getRecipeDetailPath(recipe)}>
                        <RecipeImage
                          className="recipe-grid-image"
                          src={recipe.imageUrl}
                          title={recipe.title}
                        />
                      </Link>
                      <h3>
                        <Link to={getRecipeDetailPath(recipe)}>{recipe.title}</Link>
                      </h3>
                      <RecipeRating rating={recipe.rating} />
                    </article>
                  ) : (
                    <article className="recipe-card selectable-recipe" key={recipe.id}>
                      {showBulkTools ? <RecipeSelect recipe={recipe} /> : null}
                      <Link to={getRecipeDetailPath(recipe)} aria-label={recipe.title}>
                        <RecipeImage
                          className="recipe-card-image"
                          src={recipe.imageUrl}
                          title={recipe.title}
                        />
                      </Link>
                      <div className="recipe-card-copy">
                        <div>
                          <p className="recipe-card-kicker">
                            {recipe.source?.name ?? recipe.yield?.notes ?? "Recipe"}
                          </p>
                          <h3>
                            <Link to={getRecipeDetailPath(recipe)}>{recipe.title}</Link>
                          </h3>
                          <RecipeRating rating={recipe.rating} />
                        </div>
                        <RecipeMeta query={query} recipe={recipe} />
                      </div>
                    </article>
                  ),
                )}
              </div>
            </Form>
          ) : (
            <EmptyState
              title="No recipes found"
              body="Try another title, tag, cookbook, or yield search."
              actionLabel="Show all recipes"
              actionHref="/"
            />
          )}
      </section>
    </div>
  );
}

type LibraryOrganizerDrawerProps = {
  activeFilters: ReturnType<typeof getActiveLibraryFilters>;
  cookbookTree: ReturnType<typeof getRecipeCookbookTree>;
  facets: ReturnType<typeof getRecipeLibraryFacets>;
  hasSearch: boolean;
  query: RecipeLibraryQuery;
};

function LibraryOrganizerDrawer({
  activeFilters,
  cookbookTree,
  facets,
  hasSearch,
  query,
}: LibraryOrganizerDrawerProps) {
  const navigate = useNavigate();
  const [searchValue, setSearchValue] = useState(query.q);

  useEffect(() => {
    setSearchValue(query.q);
  }, [query.q]);

  useEffect(() => {
    if (searchValue === query.q) {
      return;
    }

    const timeout = window.setTimeout(() => {
      navigate(getLibraryQueryHref({ ...query, q: searchValue }), { replace: true });
    }, 250);

    return () => window.clearTimeout(timeout);
  }, [navigate, query, searchValue]);

  return (
    <div className="library-drawer-organizer">
      <Form className="drawer-filter-form" action="/" method="get" role="search">
        <label className="drawer-search-field">
          <span className="sr-only">Search</span>
          <Search className="drawer-search-icon" aria-hidden="true" />
          <input
            type="search"
            name="q"
            placeholder="Search recipes"
            value={searchValue}
            onChange={(event) => setSearchValue(event.currentTarget.value)}
          />
        </label>
        <input type="hidden" name="view" value={query.view} />
        {query.favorite ? <input type="hidden" name="favorite" value="1" /> : null}
        {query.topRated ? <input type="hidden" name="topRated" value="1" /> : null}
        {query.sort !== "recent" ? (
          <input type="hidden" name="sort" value={query.sort} />
        ) : null}
        {query.direction !== getDefaultSortDirection(query.sort) ? (
          <input type="hidden" name="dir" value={query.direction} />
        ) : null}
        {query.tags.map((tag) => (
          <input key={`tag:${tag}`} type="hidden" name="tag" value={tag} />
        ))}
        {query.sources.map((source) => (
          <input key={`source:${source}`} type="hidden" name="source" value={source} />
        ))}
        {query.cookbooks.map((cookbook) => (
          <input key={`cookbook:${cookbook}`} type="hidden" name="cookbook" value={cookbook} />
        ))}
        <FilterStateChips
          activeFilters={activeFilters}
          hasSearch={hasSearch}
          query={query}
        />
      </Form>

      <LibraryModePicker query={query} />

      <div className="drawer-facet-list">
        <CookbookTree tree={cookbookTree} />

        {facets.map((group) => (
          <section className="facet-group" key={group.id}>
            <div className="facet-group-header">
              <div className="drawer-section-title">
                <LibraryFacetIcon id={group.id} />
                <h3>{group.label}</h3>
              </div>
              <span>{group.options.length}</span>
            </div>
            <div className="facet-options">
              {group.options.map((option) => (
                <Link
                  className={option.selected ? "facet-option selected" : "facet-option"}
                  key={option.id}
                  to={option.href}
                >
                  <span className="facet-option-label">
                    <span aria-hidden="true" className="facet-option-indent" />
                    <span>{option.label}</span>
                  </span>
                  <strong>{option.count}</strong>
                </Link>
              ))}
            </div>
          </section>
        ))}
      </div>
    </div>
  );
}

function FilterStateChips({
  activeFilters,
  hasSearch,
  query,
}: {
  activeFilters: ReturnType<typeof getActiveLibraryFilters>;
  hasSearch: boolean;
  query: RecipeLibraryQuery;
}) {
  const hasAnyFilter =
    hasSearch ||
    activeFilters.length > 0 ||
    query.favorite ||
    query.topRated;

  if (!hasAnyFilter) {
    return (
      <div className="drawer-filter-state" aria-label="Current filters">
        <span className="filter-state-empty">All recipes</span>
      </div>
    );
  }

  return (
    <div className="drawer-filter-state active" aria-label="Current filters">
      {hasSearch ? (
        <Link
          className="active-filter-chip"
          to={getLibraryQueryHref({ ...query, q: "" })}
        >
          Search: {query.q}
          <span aria-hidden="true">x</span>
        </Link>
      ) : null}
      {activeFilters.map((filter) => (
        <Link className="active-filter-chip" key={filter.id} to={filter.href}>
          {filter.label}
          <span aria-hidden="true">x</span>
        </Link>
      ))}
      {query.favorite ? (
        <Link
          className="active-filter-chip"
          to={getLibraryQueryHref({ ...query, favorite: false })}
        >
          Favorites
          <span aria-hidden="true">x</span>
        </Link>
      ) : null}
      {query.topRated ? (
        <Link
          className="active-filter-chip"
          to={getLibraryQueryHref({ ...query, topRated: false })}
        >
          Top rated
          <span aria-hidden="true">x</span>
        </Link>
      ) : null}
      <Link className="active-filter-chip clear" to={getClearFiltersHref(query)}>
        Clear
      </Link>
    </div>
  );
}

function CookbookTree({
  tree,
}: {
  tree: ReturnType<typeof getRecipeCookbookTree>;
}) {
  return (
    <section className="facet-group cookbook-tree" aria-label="Cookbooks">
      <div className="facet-group-header">
        <div className="drawer-section-title">
          <BookOpen className="drawer-icon" />
          <h3>Cookbooks</h3>
        </div>
        <span>{tree.length}</span>
      </div>
      <div className="cookbook-tree-list">
        {tree.map((author) => (
          <details className="cookbook-tree-node author" key={author.id} open>
            <summary>
              <span className="cookbook-tree-label">
                <ChevronRight className="drawer-icon tree-chevron" />
                <Folder className="drawer-icon tree-folder" />
                <span>{author.label}</span>
              </span>
              <strong>{author.count}</strong>
            </summary>
            <div className="cookbook-tree-children">
              <Link
                className={author.selected ? "facet-option selected" : "facet-option"}
                to={author.href}
              >
                <span className="facet-option-label">
                  <span aria-hidden="true" className="facet-option-indent" />
                  <span>All Recipes</span>
                </span>
                <strong>{author.count}</strong>
              </Link>
              {author.cookbooks.map((cookbook) => (
                <details
                  className="cookbook-tree-node cookbook"
                  key={cookbook.id}
                  open={cookbook.selected || cookbook.chapters.some((chapter) => chapter.selected)}
                >
                  <summary>
                    <span className="cookbook-tree-label">
                      <ChevronRight className="drawer-icon tree-chevron" />
                      <Folder className="drawer-icon tree-folder" />
                      <span>{cookbook.label}</span>
                    </span>
                    <strong>{cookbook.count}</strong>
                  </summary>
                  <div className="cookbook-tree-children">
                    <Link
                      className={cookbook.selected ? "facet-option selected" : "facet-option"}
                      to={cookbook.href}
                    >
                      <span className="facet-option-label">
                        <span aria-hidden="true" className="facet-option-indent" />
                        <span>All Recipes</span>
                      </span>
                      <strong>{cookbook.count}</strong>
                    </Link>
                    {cookbook.chapters.map((chapter) => (
                      <Link
                        className={chapter.selected ? "facet-option selected" : "facet-option"}
                        key={chapter.id}
                        to={chapter.href}
                      >
                        <span className="facet-option-label">
                          <span aria-hidden="true" className="facet-option-indent" />
                          <span>{chapter.label}</span>
                        </span>
                        <strong>{chapter.count}</strong>
                      </Link>
                    ))}
                  </div>
                </details>
              ))}
            </div>
          </details>
        ))}
      </div>
    </section>
  );
}

function LibraryModePicker({ query }: { query: RecipeLibraryQuery }) {
  const activeModeId = getLibraryModeId(query);
  const modes = getLibraryModes(query);

  return (
    <section className="facet-group">
      <div className="facet-group-header">
        <div className="drawer-section-title">
          <LayoutGrid className="drawer-icon" />
          <h3>Library Views</h3>
        </div>
        <span>{modes.length}</span>
      </div>
      <div className="facet-options">
        {modes.map((mode) => {
          const isActive = activeModeId === mode.id;
          const href =
            isActive && mode.canToggleDirection
              ? getLibraryModeHref(query, {
                  ...mode,
                  direction: getNextSortDirection(query.direction),
                })
              : mode.href;

          return (
            <Link
              className={isActive ? "facet-option selected" : "facet-option"}
              key={mode.id}
              title={
                isActive && mode.canToggleDirection
                  ? `Switch to ${getDirectionPillLabel(mode.sort, getNextSortDirection(query.direction))}`
                  : undefined
              }
              to={href}
            >
              <span className="facet-option-label">
                <LibraryModeIcon id={mode.id} />
                <span>{mode.label}</span>
              </span>
              {isActive ? (
                mode.canToggleDirection ? (
                  <strong className="mode-direction">
                    {getDirectionPillLabel(mode.sort, query.direction)}
                  </strong>
                ) : (
                  <strong aria-hidden="true">Selected</strong>
                )
              ) : null}
            </Link>
          );
        })}
      </div>
    </section>
  );
}

function LibraryFacetIcon({ id }: { id: RecipeLibraryFacet }) {
  if (id === "cookbook") {
    return <BookOpen className="drawer-icon" />;
  }

  return <Tags className="drawer-icon" />;
}

function LibraryModeIcon({ id }: { id: string }) {
  if (id === "favorites") {
    return <Heart className="drawer-icon" />;
  }

  if (id === "top-rated") {
    return <Star className="drawer-icon" />;
  }

  if (id === "title") {
    return <Type className="drawer-icon" />;
  }

  if (id === "time") {
    return <Clock className="drawer-icon" />;
  }

  return <History className="drawer-icon" />;
}

function getLibraryModeId(query: RecipeLibraryQuery) {
  if (query.favorite) {
    return "favorites";
  }

  if (query.topRated) {
    return "top-rated";
  }

  return query.sort;
}

function getLibraryModes(query: RecipeLibraryQuery) {
  const modes: LibraryMode[] = [
    {
      id: "recent",
      canToggleDirection: true,
      label: "Most Recent",
      sort: "recent",
    },
    {
      id: "favorites",
      favorite: true,
      label: "Favorites",
      sort: "recent",
    },
    {
      id: "top-rated",
      label: "Top Rated",
      sort: "rating",
      topRated: true,
    },
    {
      id: "title",
      canToggleDirection: true,
      label: "Title",
      sort: "title",
    },
    {
      id: "time",
      canToggleDirection: true,
      label: "Total Time",
      sort: "time",
    },
  ];

  return modes.map((mode) => ({
    ...mode,
    href: getLibraryModeHref(query, mode),
  }));
}

type LibraryMode = {
  canToggleDirection?: boolean;
  favorite?: boolean;
  id: string;
  label: string;
  sort: RecipeLibraryQuery["sort"];
  topRated?: boolean;
};

function getLibraryModeHref(
  query: RecipeLibraryQuery,
  mode: {
    direction?: RecipeLibraryQuery["direction"];
    favorite?: boolean;
    sort: RecipeLibraryQuery["sort"];
    topRated?: boolean;
  },
) {
  return getLibraryQueryHref({
    ...query,
    direction: mode.direction ?? getDefaultSortDirection(mode.sort),
    favorite: mode.favorite ?? false,
    sort: mode.sort,
    topRated: mode.topRated ?? false,
  });
}

function getNextSortDirection(direction: RecipeLibraryQuery["direction"]) {
  return direction === "asc" ? "desc" : "asc";
}

function getDirectionPillLabel(
  sort: RecipeLibraryQuery["sort"],
  direction: RecipeLibraryQuery["direction"],
) {
  if (sort === "title") {
    return direction === "asc" ? "A-Z" : "Z-A";
  }

  if (sort === "time") {
    return direction === "asc" ? "Short" : "Long";
  }

  if (sort === "rating") {
    return direction === "asc" ? "Low" : "High";
  }

  return direction === "asc" ? "Oldest" : "Newest";
}

type RecipeMetaProps = {
  query: RecipeLibraryQuery;
  recipe: Recipe;
};

function RecipeMeta({ query, recipe }: RecipeMetaProps) {
  return (
    <div className="recipe-meta">
      {recipe.favorite ? <span className="favorite-chip">Favorite</span> : null}
      <span>{formatDisplayTime(recipe.times?.totalMinutes) || "No time"}</span>
      {recipe.source?.type === "imported" && recipe.source.name ? (
        <Link
          className="tag source-tag"
          to={getLibraryQueryHref({ ...query, cookbooks: [recipe.source.name] })}
        >
          {recipe.source.name}
        </Link>
      ) : null}
      {recipe.tags.slice(0, 4).map((tag) => (
        <Link key={tag} to={getSearchHref(query, tag)} className="tag">
          {tag}
        </Link>
      ))}
    </div>
  );
}

function RecipeRating({ rating }: { rating: Recipe["rating"] }) {
  const filledStars = rating === undefined ? 0 : Math.round(rating / 2);
  const label = rating === undefined ? "Unrated" : `${rating.toFixed(1)} out of 10`;

  return (
    <div className="recipe-rating" aria-label={label}>
      {Array.from({ length: 5 }, (_, index) => (
        <Star
          aria-hidden="true"
          className={index < filledStars ? "rating-star filled" : "rating-star"}
          key={index}
        />
      ))}
    </div>
  );
}

function RecipeSelect({ recipe }: { recipe: Recipe }) {
  return (
    <label className="recipe-select-checkbox">
      <input name="recipeIds" type="checkbox" value={recipe.id} />
      <span>Select {recipe.title}</span>
    </label>
  );
}

function getViewTabs(query: RecipeLibraryQuery) {
  return [
    {
      id: "grid",
      label: "Grid",
      href: getLibraryQueryHref({ ...query, view: "grid" }),
      selected: query.view === "grid",
    },
    {
      id: "cards",
      label: "Cards",
      href: getLibraryQueryHref({ ...query, view: "cards" }),
      selected: query.view === "cards",
    },
    {
      id: "list",
      label: "List",
      href: getLibraryQueryHref({ ...query, view: "list" }),
      selected: query.view === "list",
    },
  ];
}

function getSearchHref(query: RecipeLibraryQuery, tag: string) {
  return getLibraryQueryHref({ ...query, tags: [tag] });
}

function getClearFiltersHref(query: RecipeLibraryQuery) {
  return getLibraryQueryHref({
    ...query,
    cookbooks: [],
    favorite: false,
    q: "",
    sources: [],
    tags: [],
    topRated: false,
  });
}
