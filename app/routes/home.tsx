import { useEffect, useMemo, useRef, useState } from "react";
import { ChefHat, CheckSquare2, Search, Tag } from "lucide-react";
import { Form, Link, redirect, useFetcher, useNavigate } from "react-router";

import type { Route } from "./+types/home";
import { getCookSessionHref } from "~/modules/cooking";
import { formatDisplayTime } from "~/modules/recipe-domain";
import {
  addRecipeTags,
  getLibraryQueryHref,
  getRecipeCookbooks,
  getRecipeLibraryFacets,
  getRecipeSourceFilterLink,
  getRecipeVisibleTagLabels,
  maxRecipeTags,
  parseBulkTagText,
  parseRecipeLibraryQuery,
  removeRecipeTags,
  type RecipeLibraryItem,
  type RecipeLibraryQuery,
  type RecipeLibrarySlice,
} from "~/modules/library/recipe-library";
import { LibraryOrganizerDrawer } from "~/modules/library/LibraryOrganizerDrawer";
import { getRecipeBrowseDetailPath } from "~/modules/recipe-viewer/recipe-detail";
import { useShellDrawer } from "~/modules/ui-shell/AppShell";
import {
  Button,
  EmptyState,
  FavoriteStar,
  RecipeImage,
  RatingStars,
  Tabs,
} from "~/modules/ui-shell/primitives";
import { requireAuthenticatedUser } from "~/server/auth";
import { getRecipeService } from "~/server/recipes/recipe.runtime";
import { getUserPreferenceService } from "~/server/user-preferences";

export function meta(_args: Route.MetaArgs) {
  return [{ title: "Recipe Library | ProjectSpice" }];
}

export async function loader({ request, context }: Route.LoaderArgs) {
  const user = await requireAuthenticatedUser({ request, context, params: {} });

  const query = parseRecipeLibraryQuery(request.url);
  const service = getRecipeService(context);
  const libraryPreferences = await getUserPreferenceService(context).getLibraryPreferences(
    user.userId,
  );
  const allRecipes = await service.listSummaries();
  const recipePage = await service.getLibraryPage(query, libraryPreferences);

  return {
    drawerData: {
      cookbooks: getRecipeCookbooks(allRecipes, query, libraryPreferences),
      facets: getRecipeLibraryFacets(allRecipes, query),
      query,
    },
    libraryPreferences,
    query,
    recipePage,
    recipes: recipePage.recipes,
  };
}

export async function action({ request, context }: Route.ActionArgs) {
  await requireAuthenticatedUser({ request, context, params: {} });

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
    drawerData,
    query = fallbackQuery,
    recipes = [],
  } = loaderData ?? {};
  const recipePage = loaderData?.recipePage ?? {
    hasMore: false,
    recipes,
    totalCount: recipes.length,
    visibleCount: recipes.length,
  };
  const isListView = query.view === "list";
  const navigate = useNavigate();
  const [isBulkMode, setIsBulkMode] = useState(false);
  const [selectedRecipeIds, setSelectedRecipeIds] = useState<Set<string>>(
    () => new Set(),
  );
  const loadMoreRef = useRef<HTMLDivElement | null>(null);
  const initialPage = query.page ?? 1;
  const queryStateKey = useMemo(() => getLibraryStateKey(query), [query]);
  const lastRequestedPageRef = useRef(initialPage);
  const lastRequestedQueryKeyRef = useRef(queryStateKey);
  const loadedPageRef = useRef(initialPage);
  const loadMoreFetcher = useFetcher<RecipeLibrarySlice>();
  const [loadedRecipes, setLoadedRecipes] = useState(recipes);
  const [loadedPage, setLoadedPage] = useState(initialPage);
  const [loadedHasMore, setLoadedHasMore] = useState(recipePage.hasMore);
  const [loadedTotalCount, setLoadedTotalCount] = useState(recipePage.totalCount);
  const showBulkTools = isBulkMode;
  const selectedRecipeCount = selectedRecipeIds.size;
  const nextPage = loadedPage + 1;
  const nextPageHref = loadedHasMore
    ? getLibraryRecipesApiHref(query, nextPage)
    : undefined;
  const isLoadingMore = loadMoreFetcher.state !== "idle";
  const resultLabel =
    loadedTotalCount === 1 ? "1 recipe" : `${loadedTotalCount} recipes`;
  const cookbooks = useMemo(
    () => drawerData?.cookbooks ?? getRecipeCookbooks(recipes, query),
    [drawerData?.cookbooks, query, recipes],
  );
  const drawer = useMemo(
    () => ({
      title: "Organize Library",
      content: (
        <LibraryOrganizerDrawer
          cookbooks={cookbooks}
          facets={drawerData?.facets ?? getRecipeLibraryFacets(recipes, query)}
          query={query}
        />
      ),
    }),
    [cookbooks, drawerData, query, recipes],
  );

  useShellDrawer(drawer);

  useEffect(() => {
    setLoadedRecipes(recipes);
    setLoadedPage(initialPage);
    setLoadedHasMore(recipePage.hasMore);
    setLoadedTotalCount(recipePage.totalCount);
    lastRequestedPageRef.current = initialPage;
    loadedPageRef.current = initialPage;
  }, [initialPage, queryStateKey, recipePage.hasMore, recipePage.totalCount, recipes]);

  useEffect(() => {
    setSelectedRecipeIds((currentRecipeIds) => {
      const loadedRecipeIds = new Set(loadedRecipes.map((recipe) => recipe.id));
      const nextRecipeIds = new Set(
        [...currentRecipeIds].filter((recipeId) => loadedRecipeIds.has(recipeId)),
      );

      return nextRecipeIds.size === currentRecipeIds.size ? currentRecipeIds : nextRecipeIds;
    });
  }, [loadedRecipes]);

  useEffect(() => {
    if (showBulkTools) {
      return;
    }

    setSelectedRecipeIds(new Set());
  }, [showBulkTools]);

  useEffect(() => {
    if (actionData?.errors?.length) {
      setIsBulkMode(true);
    }
  }, [actionData?.errors?.length]);

  useEffect(() => {
    const loadedRecipePage = loadMoreFetcher.data;

    if (
      !loadedRecipePage ||
      lastRequestedQueryKeyRef.current !== queryStateKey ||
      loadedRecipePage.page <= loadedPageRef.current
    ) {
      return;
    }

    loadedPageRef.current = loadedRecipePage.page;
    setLoadedRecipes((currentRecipes) => [
      ...currentRecipes,
      ...loadedRecipePage.recipes.filter(
        (recipe) => !currentRecipes.some((currentRecipe) => currentRecipe.id === recipe.id),
      ),
    ]);
    setLoadedPage(loadedRecipePage.page);
    setLoadedHasMore(loadedRecipePage.hasMore);
    setLoadedTotalCount(loadedRecipePage.totalCount);
    window.history.replaceState(
      window.history.state,
      "",
      getLibraryQueryHref({ ...query, page: loadedRecipePage.page }),
    );
  }, [loadMoreFetcher.data, query, queryStateKey]);

  useEffect(() => {
    const loadMoreNode = loadMoreRef.current;

    if (!loadMoreNode || !nextPageHref || isLoadingMore) {
      return;
    }

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (!entry?.isIntersecting || lastRequestedPageRef.current >= nextPage) {
          return;
        }

        lastRequestedPageRef.current = nextPage;
        lastRequestedQueryKeyRef.current = queryStateKey;
        loadMoreFetcher.load(nextPageHref);
      },
      { rootMargin: "720px 0px 720px" },
    );

    observer.observe(loadMoreNode);

    return () => observer.disconnect();
  }, [isLoadingMore, loadMoreFetcher, nextPage, nextPageHref, queryStateKey]);

  const closeBulkMode = () => {
    setIsBulkMode(false);
    setSelectedRecipeIds(new Set());
  };
  const toggleBulkMode = () => {
    if (showBulkTools) {
      closeBulkMode();
      return;
    }

    setIsBulkMode(true);
  };
  const toggleRecipeSelection = (recipeId: string, selected: boolean) => {
    setSelectedRecipeIds((currentRecipeIds) => {
      const nextRecipeIds = new Set(currentRecipeIds);

      if (selected) {
        nextRecipeIds.add(recipeId);
      } else {
        nextRecipeIds.delete(recipeId);
      }

      return nextRecipeIds;
    });
  };

  return (
    <div className="library-page">
      <section className="library-results" aria-labelledby="results-heading">
        <div className="results-header">
          <div className="results-header-main">
            <LibrarySearch query={query} navigate={navigate} />
            <h2 id="results-heading">{resultLabel}</h2>
          </div>
          <div className="results-header-actions">
            <Button
              className="library-manage-button"
              aria-pressed={showBulkTools}
              onClick={toggleBulkMode}
              type="button"
              variant={showBulkTools ? "primary" : "secondary"}
            >
              <CheckSquare2 aria-hidden="true" size={16} strokeWidth={2.4} />
              {showBulkTools ? "Done" : "Manage"}
            </Button>
            <Tabs tabs={getViewTabs(query)} />
          </div>
        </div>

          {actionData?.errors?.length ? (
            <div className="form-status error library-bulk-error" role="alert">
              <p>{actionData.errors.join(" ")}</p>
            </div>
          ) : null}

          {loadedRecipes.length > 0 ? (
            <Form className="library-organizer-form" method="post">
              {showBulkTools ? (
                <div className="bulk-tag-toolbar">
                  <div className="bulk-toolbar-status">
                    <strong>{selectedRecipeCount} selected</strong>
                    <span>Choose recipes, then cook or edit tags.</span>
                  </div>
                  <label className="bulk-tag-field">
                    <span className="sr-only">Tags to add or remove</span>
                    <Tag aria-hidden="true" size={17} strokeWidth={2.4} />
                    <input name="tagsText" placeholder="weeknight, favorite" />
                  </label>
                  <div className="editor-actions compact">
                    <Button
                      disabled={selectedRecipeCount === 0}
                      onClick={() => startCookingSelected([...selectedRecipeIds])}
                      type="button"
                      variant="primary"
                    >
                      <ChefHat aria-hidden="true" size={16} strokeWidth={2.4} />
                      Cook Selected
                    </Button>
                    <Button
                      disabled={selectedRecipeCount === 0}
                      name="intent"
                      type="submit"
                      value="add-tags"
                      variant="secondary"
                    >
                      Add Tags
                    </Button>
                    <Button
                      disabled={selectedRecipeCount === 0}
                      name="intent"
                      type="submit"
                      value="remove-tags"
                      variant="secondary"
                    >
                      Remove Tags
                    </Button>
                    <Button onClick={closeBulkMode} type="button" variant="secondary">
                      Done
                    </Button>
                  </div>
                </div>
              ) : null}

              <div
                className={
                  isListView ? "recipe-list large" : "recipe-dense-grid"
                }
              >
                {loadedRecipes.map((recipe) =>
                  isListView ? (
                    <article className="recipe-row large selectable-recipe" key={recipe.id}>
                      {showBulkTools ? (
                        <RecipeSelect
                          checked={selectedRecipeIds.has(recipe.id)}
                          onChange={(selected) => toggleRecipeSelection(recipe.id, selected)}
                          recipe={recipe}
                        />
                      ) : null}
                      <div className="recipe-row-image-frame">
                        <RecipeImage
                          className="recipe-row-image"
                          src={recipe.imageUrl}
                          title={recipe.title}
                        />
                        <RecipeFavoriteMarker recipe={recipe} />
                      </div>
                      <div>
                        <h3>
                          <Link to={getRecipeBrowseDetailPath(recipe, query)}>{recipe.title}</Link>
                        </h3>
                        <RecipeSignals recipe={recipe} />
                        <RecipeMeta query={query} recipe={recipe} />
                      </div>
                    </article>
                  ) : (
                    <article className="recipe-grid-tile selectable-recipe" key={recipe.id}>
                      {showBulkTools ? (
                        <RecipeSelect
                          checked={selectedRecipeIds.has(recipe.id)}
                          onChange={(selected) => toggleRecipeSelection(recipe.id, selected)}
                          recipe={recipe}
                        />
                      ) : null}
                      <Link className="recipe-grid-image-link" to={getRecipeBrowseDetailPath(recipe, query)}>
                        <RecipeImage
                          className="recipe-grid-image"
                          src={recipe.imageUrl}
                          title={recipe.title}
                        />
                        <RecipeFavoriteMarker recipe={recipe} />
                      </Link>
                      <h3>
                        <Link to={getRecipeBrowseDetailPath(recipe, query)}>{recipe.title}</Link>
                      </h3>
                      <RecipeSignals recipe={recipe} />
                    </article>
                  ),
                )}
              </div>
              {loadedHasMore ? (
                <div
                  ref={loadMoreRef}
                  className="library-scroll-loader"
                  aria-live="polite"
                  aria-busy={isLoadingMore ? "true" : "false"}
                >
                  <span className={isLoadingMore ? undefined : "sr-only"}>
                    {isLoadingMore ? "Loading more recipes..." : "More recipes will load automatically."}
                  </span>
                </div>
              ) : null}
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

function LibrarySearch({
  navigate,
  query,
}: {
  navigate: ReturnType<typeof useNavigate>;
  query: RecipeLibraryQuery;
}) {
  const [searchValue, setSearchValue] = useState(query.q);

  useEffect(() => {
    setSearchValue(query.q);
  }, [query.q]);

  useEffect(() => {
    if (searchValue === query.q) {
      return;
    }

    const timeout = window.setTimeout(() => {
      navigate(getLibraryQueryHref({ ...query, page: 1, q: searchValue }), { replace: true });
    }, 250);

    return () => window.clearTimeout(timeout);
  }, [navigate, query, searchValue]);

  return (
    <form
      className="library-search-form"
      role="search"
      onSubmit={(event) => {
        event.preventDefault();
        navigate(getLibraryQueryHref({ ...query, page: 1, q: searchValue }));
      }}
    >
      <label className="library-search-field">
        <span className="sr-only">Search recipes</span>
        <Search className="library-search-icon" aria-hidden="true" />
        <input
          type="search"
          name="q"
          placeholder="Search recipes"
          value={searchValue}
          onChange={(event) => setSearchValue(event.currentTarget.value)}
        />
      </label>
    </form>
  );
}

function startCookingSelected(recipeIds: string[]) {
  if (recipeIds.length === 0) {
    return;
  }

  window.location.assign(getCookSessionHref(recipeIds));
}

type RecipeMetaProps = {
  query: RecipeLibraryQuery;
  recipe: RecipeLibraryItem;
};

function RecipeSignals({ recipe }: { recipe: RecipeLibraryItem }) {
  return (
    <div className="recipe-signals">
      <RatingStars rating={recipe.rating} />
    </div>
  );
}

function RecipeFavoriteMarker({ recipe }: { recipe: RecipeLibraryItem }) {
  if (!recipe.favorite) {
    return null;
  }

  return <FavoriteStar favorite className="recipe-favorite-marker" />;
}

function RecipeMeta({ query, recipe }: RecipeMetaProps) {
  const sourceFilter = getRecipeSourceFilterLink(recipe, query);
  const visibleTags = getRecipeVisibleTagLabels(recipe);

  return (
    <div className="recipe-meta">
      <span>{formatDisplayTime(recipe.times?.totalMinutes) || "No time"}</span>
      {sourceFilter ? (
        <Link className="tag source-tag" to={sourceFilter.href}>
          {sourceFilter.label}
        </Link>
      ) : null}
      {visibleTags.slice(0, 4).map((tag) => (
        <Link key={tag} to={getSearchHref(query, tag)} className="tag">
          {tag}
        </Link>
      ))}
    </div>
  );
}

function RecipeSelect({
  checked,
  onChange,
  recipe,
}: {
  checked: boolean;
  onChange: (checked: boolean) => void;
  recipe: RecipeLibraryItem;
}) {
  return (
    <label className="recipe-select-checkbox">
      <input
        checked={checked}
        name="recipeIds"
        onChange={(event) => onChange(event.currentTarget.checked)}
        type="checkbox"
        value={recipe.id}
      />
      <span>Select {recipe.title}</span>
    </label>
  );
}

function getViewTabs(query: RecipeLibraryQuery) {
  return [
    {
      id: "grid",
      label: "Grid",
      href: getLibraryQueryHref({ ...query, page: 1, view: "grid" }),
      selected: query.view === "grid",
    },
    {
      id: "list",
      label: "List",
      href: getLibraryQueryHref({ ...query, page: 1, view: "list" }),
      selected: query.view === "list",
    },
  ];
}

function getSearchHref(query: RecipeLibraryQuery, tag: string) {
  return getLibraryQueryHref({ ...query, page: 1, tags: [tag] });
}

function getLibraryRecipesApiHref(query: RecipeLibraryQuery, page: number) {
  const libraryHref = getLibraryQueryHref({ ...query, page });

  return libraryHref === "/"
    ? "/api/library/recipes"
    : `/api/library/recipes${libraryHref.slice(1)}`;
}

function getLibraryStateKey(query: RecipeLibraryQuery) {
  return getLibraryQueryHref({ ...query, page: 1 });
}
