import { useMemo, useState } from "react";
import { ChefHat, Tag } from "lucide-react";
import { Form, Link, redirect } from "react-router";

import type { Route } from "./+types/home";
import { getCookSessionHref } from "~/modules/cooking";
import { formatDisplayTime } from "~/modules/recipe-domain";
import {
  addRecipeTags,
  getActiveLibraryFilters,
  getLibraryQueryHref,
  getRecipeLibraryPage,
  getRecipeCookbookTree,
  getRecipeLibraryFacets,
  getRecipeSourceFilterLink,
  getRecipeLibraryResults,
  maxRecipeTags,
  parseBulkTagText,
  parseRecipeLibraryQuery,
  removeRecipeTags,
  type RecipeLibraryItem,
  type RecipeLibraryQuery,
} from "~/modules/library/recipe-library";
import { LibraryOrganizerDrawer } from "~/modules/library/LibraryOrganizerDrawer";
import { getRecipeDetailPath } from "~/modules/recipe-viewer/recipe-detail";
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

export function meta(_args: Route.MetaArgs) {
  return [{ title: "Recipe Library | ProjectSpice" }];
}

export async function loader({ request, context }: Route.LoaderArgs) {
  await requireAuthenticatedUser({ request, context, params: {} });

  const query = parseRecipeLibraryQuery(request.url);
  const allRecipes = await getRecipeService(context).listSummaries();
  const matchingRecipes = getRecipeLibraryResults(allRecipes, query);
  const recipePage = getRecipeLibraryPage(matchingRecipes, query);

  return {
    drawerData: {
      activeFilters: getActiveLibraryFilters(query),
      cookbookTree: getRecipeCookbookTree(matchingRecipes, query),
      facets: getRecipeLibraryFacets(matchingRecipes, query),
      hasSearch: query.q.length > 0,
      query,
    },
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
  const isGridView = query.view === "grid";
  const isListView = query.view === "list";
  const [isBulkMode, setIsBulkMode] = useState(false);
  const showBulkTools = isBulkMode || Boolean(actionData?.errors?.length);
  const resultLabel =
    recipePage.totalCount === 1 ? "1 recipe" : `${recipePage.totalCount} recipes`;
  const visibleResultLabel = recipePage.hasMore
    ? `Showing ${recipePage.visibleCount} of ${recipePage.totalCount}`
    : `${recipePage.totalCount} shown`;
  const drawer = useMemo(
    () => ({
      title: "Organize Library",
      content: (
        <LibraryOrganizerDrawer
          activeFilters={drawerData?.activeFilters ?? getActiveLibraryFilters(query)}
          cookbookTree={drawerData?.cookbookTree ?? getRecipeCookbookTree(recipes, query)}
          facets={drawerData?.facets ?? getRecipeLibraryFacets(recipes, query)}
          hasSearch={drawerData?.hasSearch ?? query.q.length > 0}
          query={query}
        />
      ),
    }),
    [drawerData, query, recipes],
  );

  useShellDrawer(drawer);

  return (
    <div className="library-page">
      <section className="library-results" aria-labelledby="results-heading">
        <div className="results-header">
          <div>
            <h2 id="results-heading">{resultLabel}</h2>
            <p className="results-count-detail">{visibleResultLabel}</p>
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
            <div className="form-status error library-bulk-error" role="alert">
              <p>{actionData.errors.join(" ")}</p>
            </div>
          ) : null}

          {recipes.length > 0 ? (
            <Form className="library-organizer-form" method="post">
              {showBulkTools ? (
                <div className="bulk-tag-toolbar">
                  <div>
                    <strong>Bulk tags</strong>
                  </div>
                  <label className="bulk-tag-field">
                    <span className="sr-only">Tags to add or remove</span>
                    <Tag aria-hidden="true" size={17} strokeWidth={2.4} />
                    <input name="tagsText" placeholder="weeknight, favorite" />
                  </label>
                  <div className="editor-actions compact">
                    <Button
                      onClick={() => startCookingSelected()}
                      type="button"
                      variant="primary"
                    >
                      <ChefHat aria-hidden="true" size={16} strokeWidth={2.4} />
                      Cook Selected
                    </Button>
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
                          <Link to={getRecipeDetailPath(recipe)}>{recipe.title}</Link>
                        </h3>
                        <RecipeSignals recipe={recipe} />
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
                        <RecipeFavoriteMarker recipe={recipe} />
                      </Link>
                      <h3>
                        <Link to={getRecipeDetailPath(recipe)}>{recipe.title}</Link>
                      </h3>
                      <RecipeSignals recipe={recipe} />
                    </article>
                  ) : (
                    <article className="recipe-card selectable-recipe" key={recipe.id}>
                      {showBulkTools ? <RecipeSelect recipe={recipe} /> : null}
                      <Link
                        className="recipe-card-image-link"
                        to={getRecipeDetailPath(recipe)}
                        aria-label={recipe.title}
                      >
                        <RecipeImage
                          className="recipe-card-image"
                          src={recipe.imageUrl}
                          title={recipe.title}
                        />
                        <RecipeFavoriteMarker recipe={recipe} />
                      </Link>
                      <div className="recipe-card-copy">
                        <div>
                          <p className="recipe-card-kicker">
                            {recipe.source?.name ?? recipe.yield?.notes ?? "Recipe"}
                          </p>
                          <h3>
                            <Link to={getRecipeDetailPath(recipe)}>{recipe.title}</Link>
                          </h3>
                          <RecipeSignals recipe={recipe} />
                        </div>
                        <RecipeMeta query={query} recipe={recipe} />
                      </div>
                    </article>
                  ),
                )}
              </div>
              {recipePage.hasMore ? (
                <div className="library-pagination">
                  <Link
                    className="button button-secondary"
                    to={getLibraryQueryHref({ ...query, page: (query.page ?? 1) + 1 })}
                  >
                    Load more recipes
                  </Link>
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

function startCookingSelected() {
  const checkedRecipeIds = Array.from(
    document.querySelectorAll<HTMLInputElement>(
      ".library-organizer-form input[name='recipeIds']:checked",
    ),
  ).map((input) => input.value);

  window.location.assign(getCookSessionHref(checkedRecipeIds));
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

  return (
    <div className="recipe-meta">
      <span>{formatDisplayTime(recipe.times?.totalMinutes) || "No time"}</span>
      {sourceFilter ? (
        <Link className="tag source-tag" to={sourceFilter.href}>
          {sourceFilter.label}
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

function RecipeSelect({ recipe }: { recipe: RecipeLibraryItem }) {
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
      href: getLibraryQueryHref({ ...query, page: 1, view: "grid" }),
      selected: query.view === "grid",
    },
    {
      id: "cards",
      label: "Cards",
      href: getLibraryQueryHref({ ...query, page: 1, view: "cards" }),
      selected: query.view === "cards",
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
