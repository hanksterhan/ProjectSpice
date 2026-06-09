import {
  createRecipeSlug,
  recipeDraftSchema,
  type DirectionSection,
  type IngredientSection,
  type RecipeDraft,
} from "~/modules/recipe-domain";

import type { ScrapedRecipeDraftResult } from "./recipe-scraper.types";

type StructuredRecipe = Record<string, unknown>;

export class RecipeExtractionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "RecipeExtractionError";
  }
}

export function extractRecipeDraftFromHtml({
  html,
  sourceUrl,
}: {
  html: string;
  sourceUrl: string;
}): ScrapedRecipeDraftResult {
  const sourceName = getSiteName(html, sourceUrl);
  const jsonLdRecipe = findJsonLdRecipe(html);
  const visibleIngredientLines = extractVisibleIngredientLines(html);
  const recipe = applyVisibleIngredientGroups(
    jsonLdRecipe ?? extractVisibleRecipe(html),
    visibleIngredientLines,
  );
  const warnings: string[] = [];

  if (!recipe) {
    throw new RecipeExtractionError(
      "Could not find structured recipe data on this page.",
    );
  }

  const draftRecipe = toRecipeDraft(recipe, {
    sourceName,
    sourceUrl,
    warnings,
  });

  return {
    draftRecipe,
    warnings,
  };
}

function findJsonLdRecipe(html: string): StructuredRecipe | undefined {
  const scriptPattern =
    /<script\b[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi;
  let match: RegExpExecArray | null;

  while ((match = scriptPattern.exec(html)) !== null) {
    const parsedJson = parseJsonLd(match[1]);
    const recipe = findRecipeNode(parsedJson);

    if (recipe) {
      return recipe;
    }
  }

  return undefined;
}

function parseJsonLd(value: string): unknown {
  try {
    return JSON.parse(decodeHtmlEntities(stripHtmlComments(value).trim()));
  } catch {
    return undefined;
  }
}

function findRecipeNode(value: unknown): StructuredRecipe | undefined {
  if (Array.isArray(value)) {
    for (const entry of value) {
      const recipe = findRecipeNode(entry);

      if (recipe) {
        return recipe;
      }
    }

    return undefined;
  }

  if (!isRecord(value)) {
    return undefined;
  }

  if (hasRecipeType(value["@type"])) {
    return value;
  }

  const graphRecipe = findRecipeNode(value["@graph"]);

  if (graphRecipe) {
    return graphRecipe;
  }

  for (const entryValue of Object.values(value)) {
    const recipe = findRecipeNode(entryValue);

    if (recipe) {
      return recipe;
    }
  }

  return undefined;
}

function extractVisibleRecipe(html: string): StructuredRecipe | undefined {
  const title = getMetaContent(html, "og:title") ?? getFirstHeading(html);
  const ingredients = extractListItemsByClass(html, /ingredient/i);
  const instructions = extractListItemsByClass(html, /instruction|direction|method/i);

  if (!title || ingredients.length === 0 || instructions.length === 0) {
    return undefined;
  }

  return {
    name: title,
    description: getMetaContent(html, "og:description"),
    image: getMetaContent(html, "og:image"),
    recipeIngredient: ingredients,
    recipeInstructions: instructions,
  };
}

function applyVisibleIngredientGroups(
  recipe: StructuredRecipe | undefined,
  visibleIngredientLines: string[],
): StructuredRecipe | undefined {
  if (!recipe || !hasIngredientSectionHeadings(visibleIngredientLines)) {
    return recipe;
  }

  return {
    ...recipe,
    recipeIngredient: visibleIngredientLines,
  };
}

function extractVisibleIngredientLines(html: string): string[] {
  const blocks = extractBlocksBetweenHeadings(html, "Ingredients", "Directions");

  for (const block of blocks) {
    const lines = htmlBlockToLines(block)
      .map((line) => line.replace(/^[-*]\s+/, "").trim())
      .filter((line) => line && line.toLowerCase() !== "ingredients");

    if (hasIngredientSectionHeadings(lines) && lines.length >= 3) {
      return lines;
    }
  }

  return [];
}

function extractBlocksBetweenHeadings(
  html: string,
  startHeading: string,
  endHeading: string,
): string[] {
  const headingPattern = new RegExp(
    `<h[1-6]\\b[^>]*>\\s*${escapeRegExp(startHeading)}\\s*<\\/h[1-6]>`,
    "gi",
  );
  const blocks: string[] = [];
  let match: RegExpExecArray | null;

  while ((match = headingPattern.exec(html)) !== null) {
    const blockStart = match.index + match[0].length;
    const remainder = html.slice(blockStart);
    const endMatch = new RegExp(
      `<h[1-6]\\b[^>]*>\\s*${escapeRegExp(endHeading)}\\s*<\\/h[1-6]>`,
      "i",
    ).exec(remainder);

    if (endMatch) {
      blocks.push(remainder.slice(0, endMatch.index));
    }
  }

  return blocks.reverse();
}

function htmlBlockToLines(html: string): string[] {
  return decodeHtmlEntities(
    html
      .replace(/<script\b[\s\S]*?<\/script>/gi, " ")
      .replace(/<style\b[\s\S]*?<\/style>/gi, " ")
      .replace(/<\/(?:p|li|h[1-6]|div|section|ul|ol)>/gi, "\n")
      .replace(/<br\s*\/?>/gi, "\n")
      .replace(/<[^>]+>/g, " "),
  )
    .split(/\n+/)
    .map(normalizeText)
    .filter(Boolean)
    .filter((line) => !/^\d+\.?$/.test(line));
}

function hasIngredientSectionHeadings(lines: string[]): boolean {
  return lines.some((line) => parseIngredientSectionTitle(line));
}

function toRecipeDraft(
  recipe: StructuredRecipe,
  {
    sourceName,
    sourceUrl,
    warnings,
  }: {
    sourceName?: string;
    sourceUrl: string;
    warnings: string[];
  },
): RecipeDraft {
  const title = getText(recipe.name) ?? "Imported Recipe";
  const ingredients = toIngredientSections(recipe.recipeIngredient);
  const directions = toDirectionSections(recipe.recipeInstructions);

  if (ingredients.length === 0) {
    warnings.push("No ingredient list was found.");
  }

  if (directions.length === 0) {
    warnings.push("No direction list was found.");
  }

  const draftInput = {
    title,
    description: getText(recipe.description),
    imageUrl: getImageUrl(recipe.image),
    yield: parseYield(recipe.recipeYield ?? recipe.yield),
    times: parseTimes(recipe),
    ingredients:
      ingredients.length > 0
        ? ingredients
        : [
            {
              id: "ingredients",
              items: [{ id: "ingredient-1", raw: "Ingredient", item: "Ingredient" }],
            },
          ],
    directions:
      directions.length > 0
        ? directions
        : [
            {
              id: "directions",
              steps: [{ id: "step-1", order: 1, text: "Add a step." }],
            },
          ],
    notes: parseNotes(recipe),
    source: {
      type: "scraped",
      name: sourceName,
      url: sourceUrl,
    },
    tags: parseTags(recipe),
  };

  return recipeDraftSchema.parse(removeUndefined(draftInput));
}

function toIngredientSections(value: unknown): IngredientSection[] {
  const lines = toTextArray(value);

  if (lines.length === 0) {
    return [];
  }

  const sections: IngredientSection[] = [];
  let currentSection = createIngredientSection();

  lines.forEach((line, index) => {
    const sectionTitle = parseIngredientSectionTitle(line);

    if (sectionTitle) {
      if (currentSection.items.length > 0) {
        sections.push(currentSection);
      }

      currentSection = createIngredientSection(sectionTitle);
      return;
    }

    currentSection.items.push({
      id: createStableId("ingredient", line, index),
      raw: line,
      item: parseIngredientItemName(line),
    });
  });

  if (currentSection.items.length > 0) {
    sections.push(currentSection);
  }

  return sections.length > 0 ? sections : [];
}

function createIngredientSection(title?: string): IngredientSection {
  return {
    id: title ? createStableId("ingredient-section", title, 0) : "ingredients",
    title,
    items: [],
  };
}

function toDirectionSections(value: unknown): DirectionSection[] {
  const lines = toInstructionLines(value);

  if (lines.length === 0) {
    return [];
  }

  return [
    {
      id: "directions",
      steps: lines.map((line, index) => ({
        id: createStableId("step", line, index),
        order: index + 1,
        text: line,
        timerMinutes: parseTimerMinutes(line),
      })),
    },
  ];
}

function toInstructionLines(value: unknown): string[] {
  if (typeof value === "string") {
    return splitInstructionText(value);
  }

  if (isRecord(value)) {
    if (hasHowToSectionType(value["@type"])) {
      return toInstructionLines(value.itemListElement);
    }

    return toTextArray(value.text ?? value.name);
  }

  if (!Array.isArray(value)) {
    return [];
  }

  return value.flatMap((entry) => {
    if (typeof entry === "string") {
      return splitInstructionText(entry);
    }

    return toInstructionLines(entry);
  });
}

function parseTimes(recipe: StructuredRecipe) {
  const prepMinutes = parseIsoDurationMinutes(recipe.prepTime);
  const cookMinutes = parseIsoDurationMinutes(recipe.cookTime);
  const totalMinutes = parseIsoDurationMinutes(recipe.totalTime);

  return prepMinutes !== undefined ||
    cookMinutes !== undefined ||
    totalMinutes !== undefined
    ? { prepMinutes, cookMinutes, totalMinutes }
    : undefined;
}

function parseYield(value: unknown) {
  const yieldText = toTextArray(value)[0];

  if (!yieldText) {
    return undefined;
  }

  const quantityMatch = /^(\d+(?:\.\d+)?)/.exec(yieldText);
  const quantity = quantityMatch ? Number(quantityMatch[1]) : undefined;
  const unit = quantityMatch
    ? yieldText.slice(quantityMatch[0].length).trim() || undefined
    : undefined;

  return removeUndefined({
    quantity,
    unit,
    notes: yieldText,
  });
}

function parseTags(recipe: StructuredRecipe): string[] {
  const keywords = toTextArray(recipe.keywords)
    .flatMap((entry) => entry.split(","))
    .map((tag) => tag.trim().toLowerCase())
    .filter(Boolean);
  const category = getText(recipe.recipeCategory)?.toLowerCase();
  const cuisine = getText(recipe.recipeCuisine)?.toLowerCase();

  return Array.from(new Set([...keywords, category, cuisine].filter(isText)));
}

function parseNotes(recipe: StructuredRecipe): string[] | undefined {
  const notes = toTextArray(recipe.recipeNotes ?? recipe.notes)
    .map((note) => note.trim())
    .filter(Boolean);

  return notes.length > 0 ? notes : undefined;
}

function parseIsoDurationMinutes(value: unknown): number | undefined {
  const text = getText(value);

  if (!text) {
    return undefined;
  }

  const isoMatch =
    /^P(?:(\d+)D)?(?:T(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?)?$/i.exec(text);

  if (isoMatch) {
    const days = Number(isoMatch[1] ?? 0);
    const hours = Number(isoMatch[2] ?? 0);
    const minutes = Number(isoMatch[3] ?? 0);
    const seconds = Number(isoMatch[4] ?? 0);

    return days * 24 * 60 + hours * 60 + minutes + (seconds > 0 ? 1 : 0);
  }

  const hourMatch = /(\d+)\s*(?:hours?|hrs?|h)\b/i.exec(text);
  const minuteMatch = /(\d+)\s*(?:minutes?|mins?|m)\b/i.exec(text);
  const hours = hourMatch ? Number(hourMatch[1]) : 0;
  const minutes = minuteMatch ? Number(minuteMatch[1]) : 0;

  return hours > 0 || minutes > 0 ? hours * 60 + minutes : undefined;
}

function parseTimerMinutes(text: string): number | undefined {
  const match = /(?:for|about|until)[^\d]*(\d+)(?:\s*to\s*(\d+))?\s*(?:minutes?|mins?)\b/i.exec(
    text,
  );

  if (!match) {
    return undefined;
  }

  return Number(match[2] ?? match[1]);
}

function parseIngredientSectionTitle(line: string): string | undefined {
  const normalizedLine = line.trim();

  if (!normalizedLine.endsWith(":")) {
    return undefined;
  }

  const title = normalizedLine.slice(0, -1).trim();

  if (!title || looksLikeIngredientQuantity(title)) {
    return undefined;
  }

  return title;
}

function looksLikeIngredientQuantity(text: string): boolean {
  return /^(?:\d+\/\d+|\d+(?:\.\d+)?|\d+\s+\d+\/\d+)\b/.test(text);
}

function parseIngredientItemName(line: string): string {
  const withoutLeadingQuantity = line
    .replace(/^\s*(?:\d+\/\d+|\d+(?:\.\d+)?|\d+\s+\d+\/\d+)\s*/, "")
    .replace(/^\s*(?:cups?|tablespoons?|tbsp|teaspoons?|tsp|ounces?|oz|pounds?|lb|grams?|g|kilograms?|kg|milliliters?|ml|liters?|l)\b\.?\s*/i, "")
    .trim();

  return withoutLeadingQuantity || line;
}

function getImageUrl(value: unknown): string | undefined {
  if (typeof value === "string") {
    return isUrl(value) ? value : undefined;
  }

  if (Array.isArray(value)) {
    return value.map(getImageUrl).find(isText);
  }

  if (isRecord(value)) {
    return getImageUrl(value.url ?? value.contentUrl);
  }

  return undefined;
}

function getSiteName(html: string, sourceUrl: string): string | undefined {
  return (
    getMetaContent(html, "og:site_name") ??
    getHostSourceName(sourceUrl)
  );
}

function getHostSourceName(sourceUrl: string): string | undefined {
  try {
    return new URL(sourceUrl).hostname.replace(/^www\./, "");
  } catch {
    return undefined;
  }
}

function getMetaContent(html: string, property: string): string | undefined {
  const escapedProperty = property.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const patterns = [
    new RegExp(
      `<meta\\b[^>]*(?:property|name)=["']${escapedProperty}["'][^>]*content=["']([^"']+)["'][^>]*>`,
      "i",
    ),
    new RegExp(
      `<meta\\b[^>]*content=["']([^"']+)["'][^>]*(?:property|name)=["']${escapedProperty}["'][^>]*>`,
      "i",
    ),
  ];

  for (const pattern of patterns) {
    const match = pattern.exec(html);

    if (match?.[1]) {
      return normalizeText(decodeHtmlEntities(match[1]));
    }
  }

  return undefined;
}

function getFirstHeading(html: string): string | undefined {
  const match = /<h1\b[^>]*>([\s\S]*?)<\/h1>/i.exec(html);

  return match ? normalizeHtmlText(match[1]) : undefined;
}

function extractListItemsByClass(html: string, classPattern: RegExp): string[] {
  const listItems: string[] = [];
  const itemPattern = /<(?:li|p|div|span)\b([^>]*)>([\s\S]*?)<\/(?:li|p|div|span)>/gi;
  let match: RegExpExecArray | null;

  while ((match = itemPattern.exec(html)) !== null) {
    if (!classPattern.test(match[1])) {
      continue;
    }

    const text = normalizeHtmlText(match[2]);

    if (text) {
      listItems.push(text);
    }
  }

  return Array.from(new Set(listItems));
}

function toTextArray(value: unknown): string[] {
  if (typeof value === "string") {
    return value
      .split(/\r?\n/)
      .map(normalizeText)
      .filter(Boolean);
  }

  if (Array.isArray(value)) {
    return value.flatMap(toTextArray);
  }

  if (isRecord(value)) {
    return toTextArray(value.text ?? value.name);
  }

  return [];
}

function getText(value: unknown): string | undefined {
  return toTextArray(value)[0];
}

function splitInstructionText(value: string): string[] {
  return value
    .split(/\r?\n+/)
    .map(normalizeText)
    .filter(Boolean);
}

function createStableId(prefix: string, text: string, index: number): string {
  return createRecipeSlug(`${prefix}-${text}`).slice(0, 60) || `${prefix}-${index + 1}`;
}

function normalizeHtmlText(value: string): string {
  return normalizeText(
    decodeHtmlEntities(
      value
        .replace(/<script\b[\s\S]*?<\/script>/gi, " ")
        .replace(/<style\b[\s\S]*?<\/style>/gi, " ")
        .replace(/<[^>]+>/g, " "),
    ),
  );
}

function normalizeText(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function decodeHtmlEntities(value: string): string {
  return value
    .replace(/&quot;/g, "\"")
    .replace(/&#34;/g, "\"")
    .replace(/&#x22;/gi, "\"")
    .replace(/&amp;/g, "&")
    .replace(/&#38;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&nbsp;/g, " ")
    .replace(/&#160;/g, " ")
    .replace(/&#(\d+);/g, (_, code: string) => String.fromCharCode(Number(code)))
    .replace(/&#x([0-9a-f]+);/gi, (_, code: string) =>
      String.fromCharCode(Number.parseInt(code, 16)),
    );
}

function stripHtmlComments(value: string): string {
  return value.replace(/<!--|-->/g, "");
}

function hasRecipeType(value: unknown): boolean {
  return toTextArray(value).some((type) => type.toLowerCase() === "recipe");
}

function hasHowToSectionType(value: unknown): boolean {
  return toTextArray(value).some(
    (type) => type.toLowerCase() === "howtosection",
  );
}

function isUrl(value: string): boolean {
  try {
    const parsedUrl = new URL(value);

    return parsedUrl.protocol === "https:" || parsedUrl.protocol === "http:";
  } catch {
    return false;
  }
}

function removeUndefined<T>(value: T): T {
  if (Array.isArray(value)) {
    return value.map(removeUndefined).filter((entry) => entry !== undefined) as T;
  }

  if (!isRecord(value)) {
    return value;
  }

  return Object.fromEntries(
    Object.entries(value)
      .filter(([, entryValue]) => entryValue !== undefined)
      .map(([key, entryValue]) => [key, removeUndefined(entryValue)]),
  ) as T;
}

function isText(value: unknown): value is string {
  return typeof value === "string" && value.length > 0;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
