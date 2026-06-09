import type { RecipeDraft } from "~/modules/recipe-domain";

export type ScrapedRecipeDraftResult = {
  draftRecipe: RecipeDraft;
  warnings: string[];
};

export type RecipeScrapeSource = {
  html: string;
  finalUrl: string;
};
