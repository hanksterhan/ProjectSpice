export const FAMILY_RECIPE_VISIBILITY = "family";
export const PRIVATE_RECIPE_VISIBILITY = "private";

export const COPYRIGHT_RESTRICTED_SOURCE_TYPES = new Set(["epub", "pdf"]);

export type ShareableRecipe = {
  userId: string;
  visibility: string;
  sourceType?: string | null;
};

export function canManageRecipe(
  recipe: Pick<ShareableRecipe, "userId">,
  userId: string
): boolean {
  return recipe.userId === userId;
}

export function canViewRecipe(recipe: ShareableRecipe, userId: string): boolean {
  return canManageRecipe(recipe, userId) || recipe.visibility === FAMILY_RECIPE_VISIBILITY;
}

export function canPubliclyShareRecipe(
  recipe: Pick<ShareableRecipe, "sourceType">
): boolean {
  return !COPYRIGHT_RESTRICTED_SOURCE_TYPES.has(recipe.sourceType ?? "");
}
