import type { Recipe } from "~/modules/recipe-domain";

export const recipeLibrarySortOptions = ["recent", "title", "time"] as const;
export const recipeLibraryViewOptions = ["cards", "list"] as const;

export type RecipeLibrarySort = (typeof recipeLibrarySortOptions)[number];
export type RecipeLibraryView = (typeof recipeLibraryViewOptions)[number];

export type RecipeLibraryQuery = {
  q: string;
  sort: RecipeLibrarySort;
  view: RecipeLibraryView;
};

export function parseRecipeLibraryQuery(url: string): RecipeLibraryQuery {
  const searchParams = new URL(url).searchParams;
  const sort = searchParams.get("sort");
  const view = searchParams.get("view");

  return {
    q: searchParams.get("q")?.trim() ?? "",
    sort: isRecipeLibrarySort(sort) ? sort : "recent",
    view: isRecipeLibraryView(view) ? view : "cards",
  };
}

export function getRecipeLibraryResults(
  recipes: readonly Recipe[],
  query: RecipeLibraryQuery,
): Recipe[] {
  const terms = query.q
    .toLowerCase()
    .split(/\s+/)
    .filter(Boolean);

  const filteredRecipes =
    terms.length === 0
      ? [...recipes]
      : recipes.filter((recipe) => {
          const haystack = [
            recipe.title,
            recipe.description,
            recipe.yield?.notes,
            recipe.source?.name,
            ...recipe.tags,
          ]
            .filter(Boolean)
            .join(" ")
            .toLowerCase();

          return terms.every((term) => haystack.includes(term));
        });

  return filteredRecipes.sort((left, right) =>
    compareRecipes(left, right, query.sort),
  );
}

function compareRecipes(
  left: Recipe,
  right: Recipe,
  sort: RecipeLibrarySort,
): number {
  if (sort === "title") {
    return left.title.localeCompare(right.title);
  }

  if (sort === "time") {
    return (
      (left.times?.totalMinutes ?? Number.MAX_SAFE_INTEGER) -
      (right.times?.totalMinutes ?? Number.MAX_SAFE_INTEGER)
    );
  }

  return right.updatedAt.localeCompare(left.updatedAt);
}

function isRecipeLibrarySort(value: string | null): value is RecipeLibrarySort {
  return recipeLibrarySortOptions.includes(value as RecipeLibrarySort);
}

function isRecipeLibraryView(value: string | null): value is RecipeLibraryView {
  return recipeLibraryViewOptions.includes(value as RecipeLibraryView);
}
