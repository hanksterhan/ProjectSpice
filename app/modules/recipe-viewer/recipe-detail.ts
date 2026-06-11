import type { Recipe } from "~/modules/recipe-domain";

export function getRecipeDetailPath(recipe: Pick<Recipe, "id">): string {
  return `/recipes/${encodeURIComponent(recipe.id)}`;
}

export function getRecipeEditPath(recipe: Pick<Recipe, "id">): string {
  return `${getRecipeDetailPath(recipe)}/edit`;
}
