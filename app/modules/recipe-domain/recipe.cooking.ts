import type { Recipe, RecipeCookHistoryEntry, RecipeDraft } from "./recipe.types";

export type AddCookHistoryEntryInput = {
  cookedOn: string;
  createdAt: string;
  lensKey: string;
  lensName: string;
  note?: string;
  recipeVersion?: number;
};

export function addCookedDate<T extends Recipe | RecipeDraft>(
  recipe: T,
  cookedOn: string,
): T {
  return {
    ...recipe,
    cookedDates: normalizeCookedDates([...(recipe.cookedDates ?? []), cookedOn]),
  };
}

export function addCookHistoryEntry<T extends Recipe | RecipeDraft>(
  recipe: T,
  input: AddCookHistoryEntryInput,
): T {
  const entry: RecipeCookHistoryEntry = {
    cookedOn: input.cookedOn,
    lensKey: input.lensKey,
    lensName: input.lensName,
    ...(input.note?.trim() ? { note: input.note.trim() } : {}),
    ...(input.recipeVersion ? { recipeVersion: input.recipeVersion } : {}),
    createdAt: input.createdAt,
  };

  return {
    ...recipe,
    cookedDates: normalizeCookedDates([...(recipe.cookedDates ?? []), input.cookedOn]),
    cookHistory: normalizeCookHistory([...(recipe.cookHistory ?? []), entry]),
  };
}

export function addCookJournalNote<T extends Recipe | RecipeDraft>(
  recipe: T,
  cookedOn: string,
  note: string | undefined,
): T {
  const trimmedNote = note?.trim();

  if (!trimmedNote) {
    return recipe;
  }

  const journalNote = `${formatCookJournalDate(cookedOn)} - ${trimmedNote}`;

  if (recipe.notes?.includes(journalNote)) {
    return recipe;
  }

  return {
    ...recipe,
    notes: [...(recipe.notes ?? []), journalNote],
  };
}

export function normalizeCookedDates(cookedDates: readonly string[]): string[] {
  return [...new Set(cookedDates)]
    .filter((date) => /^\d{4}-\d{2}-\d{2}$/.test(date))
    .sort((firstDate, secondDate) => secondDate.localeCompare(firstDate));
}

export function normalizeCookHistory(
  cookHistory: readonly RecipeCookHistoryEntry[],
): RecipeCookHistoryEntry[] {
  return cookHistory
    .filter((entry) => /^\d{4}-\d{2}-\d{2}$/.test(entry.cookedOn))
    .slice()
    .sort((firstEntry, secondEntry) => {
      const dateOrder = secondEntry.cookedOn.localeCompare(firstEntry.cookedOn);

      return dateOrder === 0
        ? secondEntry.createdAt.localeCompare(firstEntry.createdAt)
        : dateOrder;
    });
}

export function getCookCount(
  recipe: Pick<Recipe | RecipeDraft, "cookedDates" | "cookHistory">,
): number {
  const cookHistory = recipe.cookHistory ?? [];
  const cookHistoryDateSet = new Set(cookHistory.map((entry) => entry.cookedOn));
  const legacyCookedDates =
    recipe.cookedDates?.filter((cookedOn) => !cookHistoryDateSet.has(cookedOn)) ?? [];

  return cookHistory.length + legacyCookedDates.length;
}

export function getLastCookedDate(
  recipe: Pick<Recipe | RecipeDraft, "cookedDates" | "cookHistory">,
): string | undefined {
  return normalizeCookedDates([
    ...(recipe.cookHistory?.map((entry) => entry.cookedOn) ?? []),
    ...(recipe.cookedDates ?? []),
  ])[0];
}

function formatCookJournalDate(date: string): string {
  const [year, month, day] = date.split("-").map(Number);

  if (!year || !month || !day) {
    return date;
  }

  return new Intl.DateTimeFormat("en", {
    month: "short",
    day: "numeric",
    year: "numeric",
  }).format(new Date(year, month - 1, day));
}
