import type { Recipe, RecipeDraft } from "./recipe.types";

export function addCookedDate<T extends Recipe | RecipeDraft>(
  recipe: T,
  cookedOn: string,
): T {
  return {
    ...recipe,
    cookedDates: normalizeCookedDates([...(recipe.cookedDates ?? []), cookedOn]),
  };
}

export function normalizeCookedDates(cookedDates: readonly string[]): string[] {
  return [...new Set(cookedDates)]
    .filter((date) => /^\d{4}-\d{2}-\d{2}$/.test(date))
    .sort((firstDate, secondDate) => secondDate.localeCompare(firstDate));
}

export function getCookCount(recipe: Pick<Recipe | RecipeDraft, "cookedDates">): number {
  return recipe.cookedDates?.length ?? 0;
}

export function getLastCookedDate(
  recipe: Pick<Recipe | RecipeDraft, "cookedDates">,
): string | undefined {
  return normalizeCookedDates(recipe.cookedDates ?? [])[0];
}
