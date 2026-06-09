import { extractRecipeDraftFromHtml } from "./recipe-scraper.extractors";
import { fetchRecipePage } from "./recipe-scraper.fetcher";
import type { ScrapedRecipeDraftResult } from "./recipe-scraper.types";

export async function scrapeRecipeFromUrl(
  url: string,
): Promise<ScrapedRecipeDraftResult> {
  const page = await fetchRecipePage(url);

  return extractRecipeDraftFromHtml({
    html: page.html,
    sourceUrl: page.finalUrl,
  });
}
