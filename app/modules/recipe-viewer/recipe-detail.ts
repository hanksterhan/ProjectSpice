import type { Recipe } from "~/modules/recipe-domain";
import {
  getLibraryQueryHref,
  type RecipeLibraryQuery,
} from "~/modules/library/recipe-library";

export function getRecipeDetailPath(recipe: Pick<Recipe, "id">): string {
  return `/recipes/${encodeURIComponent(recipe.id)}`;
}

export function getRecipeEditPath(recipe: Pick<Recipe, "id">): string {
  return `${getRecipeDetailPath(recipe)}/edit`;
}

export function getRecipeBrowseDetailPath(
  recipe: Pick<Recipe, "id">,
  query: RecipeLibraryQuery,
  lensKey?: string,
): string {
  const params = new URLSearchParams(getLibraryQuerySearch(query));

  if (lensKey && lensKey !== "original") {
    params.set("lens", lensKey);
  }

  const search = params.toString();

  return `${getRecipeDetailPath(recipe)}${search ? `?${search}` : ""}`;
}

function getLibraryQuerySearch(query: RecipeLibraryQuery): string {
  const href = getLibraryQueryHref(query);

  return href.includes("?") ? href.slice(href.indexOf("?") + 1) : "";
}
