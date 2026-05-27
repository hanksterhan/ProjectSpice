import { Link } from "react-router";

import type { Route } from "./+types/home";
import { formatDisplayTime, seedRecipes, type Recipe } from "~/modules/recipe-domain";
import {
  getRecipeLibraryResults,
  parseRecipeLibraryQuery,
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

export function meta(_args: Route.MetaArgs) {
  return [{ title: "Recipe Library | ProjectSpice" }];
}

export function loader({ request }: Route.LoaderArgs) {
  const query = parseRecipeLibraryQuery(request.url);
  const recipes = getRecipeLibraryResults(seedRecipes, query);

  return {
    query,
    recipes,
    totalRecipeCount: seedRecipes.length,
  };
}

export default function Home({ loaderData }: Route.ComponentProps) {
  const fallbackQuery = parseRecipeLibraryQuery("https://spice.local/");
  const {
    query = fallbackQuery,
    recipes = getRecipeLibraryResults(seedRecipes, fallbackQuery),
    totalRecipeCount = seedRecipes.length,
  } = loaderData ?? {};
  const hasSearch = query.q.length > 0;
  const isListView = query.view === "list";
  const resultLabel =
    recipes.length === 1 ? "1 recipe" : `${recipes.length} recipes`;

  return (
    <div className="library-page">
      <section className="page-toolbar" aria-labelledby="library-heading">
        <div>
          <p className="eyebrow">Recipe Library</p>
          <h1 id="library-heading">Chilled Desserts</h1>
          <p className="page-summary">
            {hasSearch
              ? `${resultLabel} matching "${query.q}"`
              : `${totalRecipeCount} Paprika-derived fixtures ready for browsing`}
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
            <Link className="button button-secondary" to="/">
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
            <p className="eyebrow">Library</p>
            <h2 id="results-heading">{resultLabel}</h2>
          </div>
          <Tabs tabs={getViewTabs(query)} />
        </div>

        {recipes.length > 0 ? (
          <div className={isListView ? "recipe-list large" : "recipe-card-grid"}>
            {recipes.map((recipe) =>
              isListView ? (
                <article className="recipe-row large" key={recipe.id}>
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
                <article className="recipe-card" key={recipe.id}>
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
                        {recipe.yield?.notes ?? "Recipe"}
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
      {recipe.tags.slice(0, 3).map((tag) => (
        <a key={tag} href={getSearchHref(query, tag)} className="tag">
          {tag}
        </a>
      ))}
    </div>
  );
}

function getViewTabs(query: RecipeLibraryQuery) {
  return [
    {
      id: "cards",
      label: "Cards",
      href: getQueryHref({ ...query, view: "cards" }),
      selected: query.view === "cards",
    },
    {
      id: "list",
      label: "List",
      href: getQueryHref({ ...query, view: "list" }),
      selected: query.view === "list",
    },
  ];
}

function getSearchHref(query: RecipeLibraryQuery, tag: string) {
  return getQueryHref({ ...query, q: tag });
}

function getQueryHref(query: RecipeLibraryQuery) {
  const params = new URLSearchParams();

  if (query.q) {
    params.set("q", query.q);
  }

  if (query.sort !== "recent") {
    params.set("sort", query.sort);
  }

  if (query.view !== "cards") {
    params.set("view", query.view);
  }

  const search = params.toString();

  return search ? `/?${search}` : "/";
}

function getRecipeDescription(description: string | undefined) {
  if (!description) {
    return "Structured chilled dessert recipe.";
  }

  return description.length > 180 ? `${description.slice(0, 177)}...` : description;
}
