import { seedRecipes, type Recipe } from "~/modules/recipe-domain";

export function getSeedRecipeById(recipeId: string | undefined): Recipe | undefined {
  if (!recipeId) {
    return undefined;
  }

  return seedRecipes.find((recipe) => recipe.id === recipeId);
}

export function getRecipeDetailPath(recipe: Pick<Recipe, "id">): string {
  return `/recipes/${encodeURIComponent(recipe.id)}`;
}

export function getRecipeEditPath(recipe: Pick<Recipe, "id">): string {
  return `${getRecipeDetailPath(recipe)}/edit`;
}
