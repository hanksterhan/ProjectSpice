import { useState } from "react";
import { Form, Link, redirect } from "react-router";

import type { Route } from "./+types/home";
import { formatDisplayTime, seedRecipes, type Recipe } from "~/modules/recipe-domain";
import {
  addRecipeTags,
  getActiveLibraryFilters,
  getLibraryQueryHref,
  getRecipeLibraryFacets,
  getRecipeLibraryResults,
  maxRecipeTags,
  parseBulkTagText,
  parseRecipeLibraryQuery,
  removeRecipeTags,
  type RecipeLibraryQuery,
} from "~/modules/library/recipe-library";
import { getRecipeDetailPath } from "~/modules/recipe-viewer/recipe-detail";
import {
  Button,
  EmptyState,
  RecipeImage,
  Tabs,
  TextInput,
} from "~/modules/ui-shell/primitives";
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
    facets = getRecipeLibraryFacets(seedRecipes, fallbackQuery),
    query = fallbackQuery,
    recipes = getRecipeLibraryResults(seedRecipes, fallbackQuery),
    totalRecipeCount = seedRecipes.length,
  } = loaderData ?? {};
  const activeFilters = getActiveLibraryFilters(query);
  const hasSearch = query.q.length > 0;
  const hasFilters = activeFilters.length > 0;
  const isListView = query.view === "list";
  const [isBulkMode, setIsBulkMode] = useState(false);
  const [areFiltersOpen, setAreFiltersOpen] = useState(hasFilters);
  const showBulkTools = isBulkMode || Boolean(actionData?.errors?.length);
  const resultLabel =
    recipes.length === 1 ? "1 recipe" : `${recipes.length} recipes`;

  return (
    <div className="library-page">
      <section className="page-toolbar" aria-labelledby="library-heading">
        <div>
          <p className="eyebrow">Library</p>
          <h1 id="library-heading">Recipe Library</h1>
          <p className="page-summary">
            {hasSearch || hasFilters
              ? `${resultLabel} in the current view`
              : `${totalRecipeCount} recipes organized by source, cookbook, and tags`}
          </p>
        </div>

        <form className="toolbar-actions" action="/" method="get" role="search">
          <TextInput
            label="Search"
            type="search"
            name="q"
            placeholder="Find a recipe"
            defaultValue={query.q}
          />
          <label className="field">
            <span>Sort</span>
            <select name="sort" defaultValue={query.sort}>
              <option value="recent">Recently updated</option>
              <option value="title">Title</option>
              <option value="time">Total time</option>
            </select>
          </label>
          <input type="hidden" name="view" value={query.view} />
          {hasSearch ? (
            <Link className="button button-secondary" to={getLibraryQueryHref({ ...query, q: "" })}>
              Clear
            </Link>
          ) : null}
          <Button type="submit" variant="secondary">
            Apply
          </Button>
          <Link className="button button-primary" to="/recipes/new">
            New Recipe
          </Link>
        </form>
      </section>

      <section className="library-results" aria-labelledby="results-heading">
        <div className="results-header">
          <div>
            <p className="eyebrow">Recipes</p>
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

        <details
          className="library-filter-panel"
          onToggle={(event) => setAreFiltersOpen(event.currentTarget.open)}
          open={areFiltersOpen}
        >
          <summary className="filter-panel-summary">
            <div>
              <p className="eyebrow">Filters</p>
              <h3>Source, cookbook, and tags</h3>
            </div>
            <span>{hasFilters ? `${activeFilters.length} active` : "Filter recipes"}</span>
          </summary>
          <div className="filter-panel-body">
            {facets.map((group) => (
              <section className="facet-group" key={group.id}>
                <h3>{group.label}</h3>
                <div className="facet-options">
                  {group.options.map((option) => (
                    <Link
                      className={option.selected ? "facet-option selected" : "facet-option"}
                      key={option.id}
                      to={option.href}
                    >
                      <span>{option.label}</span>
                      <strong>{option.count}</strong>
                    </Link>
                  ))}
                </div>
              </section>
            ))}
          </div>
        </details>

          {activeFilters.length > 0 ? (
            <div className="active-filter-list" aria-label="Active filters">
              {activeFilters.map((filter) => (
                <Link className="active-filter-chip" key={filter.id} to={filter.href}>
                  {filter.label}
                  <span aria-hidden="true">x</span>
                </Link>
              ))}
              <Link className="active-filter-chip clear" to="/">
                Clear all
              </Link>
            </div>
          ) : null}

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
                    <p className="eyebrow">Selection</p>
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

              <div className={isListView ? "recipe-list large" : "recipe-card-grid"}>
                {recipes.map((recipe) =>
                  isListView ? (
                    <article className="recipe-row large selectable-recipe" key={recipe.id}>
                      {showBulkTools ? <RecipeSelect recipe={recipe} /> : null}
                      <RecipeImage src={recipe.imageUrl} title={recipe.title} />
                      <div>
                        <h3>
                          <Link to={getRecipeDetailPath(recipe)}>{recipe.title}</Link>
                        </h3>
                        <p>{getRecipeDescription(recipe.description)}</p>
                        <RecipeMeta query={query} recipe={recipe} />
                      </div>
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
                          <p>{getRecipeDescription(recipe.description)}</p>
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
              body="Try another title, tag, source, or yield search."
              actionLabel="Show all recipes"
              actionHref="/"
            />
          )}
        </section>
    </div>
  );
}

type RecipeMetaProps = {
  query: RecipeLibraryQuery;
  recipe: Recipe;
};

function RecipeMeta({ query, recipe }: RecipeMetaProps) {
  return (
    <div className="recipe-meta">
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

function getRecipeDescription(description: string | undefined) {
  if (!description) {
    return "Structured chilled dessert recipe.";
  }

  return description.length > 180 ? `${description.slice(0, 177)}...` : description;
}
