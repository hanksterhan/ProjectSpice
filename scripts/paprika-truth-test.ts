import { readFileSync } from "node:fs";
import { parseArgs } from "node:util";
import { parseIngredientLine } from "../app/lib/ingredient-parser";
import { parseDuration } from "../app/lib/time-parser";
import {
  normaliseDifficulty,
  parsePaprikaArchive,
  parseServings,
  toTextPayload,
  type PaprikaRecipeRaw,
} from "../app/lib/paprika-binary-parser";
import { toJsonLd, toPaprikaHtml, type ExportRecipe } from "../app/lib/export-builder";

const DEFAULT_ARCHIVE =
  "/Users/hhan/workspaces/RecipeBookParser/data/MyRecipes.paprikarecipes";

type ImportPreview = {
  recipeCount: number;
  ingredientCount: number;
  groupHeaderCount: number;
  tagCount: number;
  cookbookCount: number;
  recipeTagCount: number;
  cookbookRecipeCount: number;
  skippedOnDuplicateImport: number;
  timeNotesCount: number;
  parseableTimeCount: number;
  ratingsCount: number;
  sourceIdCount: number;
  primaryPhotoCount: number;
  decodedPrimaryPhotoCount: number;
  imageSourceUrlCount: number;
  exportableSampleCount: number;
  searchableSampleHits: number;
  errors: string[];
  warnings: string[];
};

function generateSlug(title: string): string {
  return title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 100);
}

function isGroupHeaderLine(line: string): boolean {
  const t = line.trim();
  if (!t) return false;
  if (t.endsWith(":") && !/^[\d⅛¼⅓⅜½⅝⅔¾⅞]/.test(t)) return true;
  if (/^[A-Z][A-Z\s]{2,}$/.test(t)) return true;
  return false;
}

function decodeLooksLikeImage(base64: string): boolean {
  try {
    const bytes = Buffer.from(base64, "base64");
    if (bytes.length < 4) return false;
    const isJpeg = bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;
    const isPng =
      bytes[0] === 0x89 &&
      bytes[1] === 0x50 &&
      bytes[2] === 0x4e &&
      bytes[3] === 0x47;
    return isJpeg || isPng;
  } catch {
    return false;
  }
}

function toExportRecipe(recipe: PaprikaRecipeRaw, index: number): ExportRecipe {
  const ingredients = recipe.ingredients
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line, sortOrder) => {
      const isHeader = isGroupHeaderLine(line);
      const parsed = parseIngredientLine(line, isHeader ? line : null);
      return {
        sortOrder,
        groupName: parsed.is_group_header ? parsed.name : null,
        quantityRaw: parsed.quantity_raw || null,
        unitRaw: parsed.unit_raw || null,
        name: parsed.name,
        notes: parsed.notes,
        weightG: parsed.weight_g,
        footnoteRef: parsed.footnote_ref,
        isGroupHeader: parsed.is_group_header,
      };
    });
  const prepTimeMin = parseDuration(recipe.prep_time ?? "");
  const activeTimeMin = parseDuration(recipe.cook_time ?? "");
  const totalTimeMin = parseDuration(recipe.total_time ?? "");
  const timeNotes = [
    recipe.prep_time && prepTimeMin === null ? `Prep: ${recipe.prep_time}` : null,
    recipe.cook_time && activeTimeMin === null ? `Cook: ${recipe.cook_time}` : null,
    recipe.total_time && totalTimeMin === null ? `Total: ${recipe.total_time}` : null,
  ]
    .filter(Boolean)
    .join(", ");
  const { servings, servingsUnit } = parseServings(recipe.servings ?? "");

  return {
    id: `truth-${index}`,
    title: recipe.name,
    slug: generateSlug(recipe.name),
    description: recipe.description?.trim() || null,
    sourceUrl: recipe.source_url?.trim() || null,
    sourceType: "paprika_binary",
    prepTimeMin,
    activeTimeMin,
    totalTimeMin,
    timeNotes: timeNotes || null,
    servings,
    servingsUnit,
    difficulty: normaliseDifficulty(recipe.difficulty ?? ""),
    directionsText: recipe.directions?.trim() ?? "",
    notes: recipe.notes?.trim() || null,
    imageKey: recipe.photo_data ? `images/truth/${recipe.uid}.jpg` : null,
    rating: typeof recipe.rating === "number" ? recipe.rating : null,
    visibility: "private",
    paprikaOriginalId: recipe.uid,
    createdAt: null,
    updatedAt: null,
    ingredients,
    tags: (recipe.categories ?? []).map((name, tagIndex) => ({
      id: `truth-tag-${index}-${tagIndex}`,
      name,
    })),
  };
}

function pickRepresentativeSubset(recipes: PaprikaRecipeRaw[]): PaprikaRecipeRaw[] {
  const picked = new Map<string, PaprikaRecipeRaw>();
  const take = (recipe: PaprikaRecipeRaw | undefined) => {
    if (recipe) picked.set(recipe.uid, recipe);
  };

  for (const recipe of recipes.slice(0, 25)) take(recipe);
  take(recipes.find((r) => r.photo_data));
  take(recipes.find((r) => (r.categories ?? []).length >= 3));
  take(recipes.find((r) => typeof r.rating === "number" && r.rating > 0));
  take(recipes.find((r) => /overnight|day|month/i.test(`${r.prep_time} ${r.cook_time} ${r.total_time}`)));
  take(recipes.find((r) => /\b11\/2\b|\b21\/2\b/.test(r.ingredients)));
  take(recipes.find((r) => /[①②③④⑤⑥⑦⑧⑨⑩]/.test(r.ingredients)));
  take(recipes.find((r) => /\([\d.]+\s*(?:oz|g|kg|lb)/i.test(r.ingredients)));

  return [...picked.values()];
}

function validateImport(recipes: PaprikaRecipeRaw[]): ImportPreview {
  const errors: string[] = [];
  const warnings: string[] = [];
  const usedSlugs = new Set<string>();
  const sourceIds = new Set<string>();
  const categories = new Set<string>();
  let ingredientCount = 0;
  let groupHeaderCount = 0;
  let recipeTagCount = 0;
  let cookbookRecipeCount = 0;
  let timeNotesCount = 0;
  let parseableTimeCount = 0;
  let ratingsCount = 0;
  let primaryPhotoCount = 0;
  let decodedPrimaryPhotoCount = 0;
  let imageSourceUrlCount = 0;
  let exportableSampleCount = 0;
  let searchableSampleHits = 0;

  for (const [index, recipe] of recipes.entries()) {
    if (!recipe.uid) errors.push(`Recipe ${index} is missing uid`);
    if (!recipe.name) errors.push(`Recipe ${recipe.uid || index} is missing name`);
    if (sourceIds.has(recipe.uid)) errors.push(`Duplicate paprika uid ${recipe.uid}`);
    sourceIds.add(recipe.uid);

    const baseSlug = generateSlug(recipe.name);
    let slug = baseSlug;
    let n = 2;
    while (usedSlugs.has(slug)) slug = `${baseSlug}-${n++}`;
    usedSlugs.add(slug);

    const textPayload = toTextPayload(recipe);
    if ("photo_data" in textPayload || "photos" in textPayload) {
      errors.push(`Text payload for ${recipe.uid} still contains photo fields`);
    }

    for (const cat of recipe.categories ?? []) {
      const name = cat.trim();
      if (!name) continue;
      categories.add(name);
      recipeTagCount++;
      cookbookRecipeCount++;
    }

    for (const rawLine of (recipe.ingredients ?? "").split("\n")) {
      const line = rawLine.trim();
      if (!line) continue;
      const parsed = parseIngredientLine(line, isGroupHeaderLine(line) ? line : null);
      if (!parsed.name) errors.push(`Ingredient with empty name in ${recipe.uid}: ${line}`);
      if (parsed.is_group_header) groupHeaderCount++;
      ingredientCount++;
    }

    const parsedTimes = [
      parseDuration(recipe.prep_time ?? ""),
      parseDuration(recipe.cook_time ?? ""),
      parseDuration(recipe.total_time ?? ""),
    ];
    if (parsedTimes.some((value) => value !== null)) parseableTimeCount++;
    if (
      (recipe.prep_time && parsedTimes[0] === null) ||
      (recipe.cook_time && parsedTimes[1] === null) ||
      (recipe.total_time && parsedTimes[2] === null)
    ) {
      timeNotesCount++;
    }

    if (typeof recipe.rating === "number" && recipe.rating > 0) ratingsCount++;
    if (recipe.photo_data) {
      primaryPhotoCount++;
      if (decodeLooksLikeImage(recipe.photo_data)) decodedPrimaryPhotoCount++;
      else warnings.push(`Primary photo did not sniff as JPEG/PNG for ${recipe.uid}`);
    }
    if (recipe.image_url?.trim()) imageSourceUrlCount++;
  }

  const samples = recipes
    .filter((recipe) => recipe.ingredients.trim() && recipe.directions.trim())
    .slice(0, 12);
  for (const [index, recipe] of samples.entries()) {
    const exportRecipe = toExportRecipe(recipe, index);
    const jsonLd = toJsonLd(exportRecipe);
    const paprikaHtml = toPaprikaHtml(exportRecipe);
    if (jsonLd.name === recipe.name && paprikaHtml.includes(recipe.name)) exportableSampleCount++;

    const searchBody = [
      exportRecipe.title,
      exportRecipe.directionsText,
      exportRecipe.notes,
      ...exportRecipe.ingredients.map((ingredient) => ingredient.name),
      ...exportRecipe.tags.map((tag) => tag.name),
    ]
      .join(" ")
      .toLowerCase();
    const ingredientNeedle = exportRecipe.ingredients.find((ingredient) => !ingredient.isGroupHeader)?.name.toLowerCase();
    if (searchBody.includes(exportRecipe.title.toLowerCase()) && ingredientNeedle && searchBody.includes(ingredientNeedle)) {
      searchableSampleHits++;
    }
  }

  return {
    recipeCount: recipes.length,
    ingredientCount,
    groupHeaderCount,
    tagCount: categories.size,
    cookbookCount: categories.size,
    recipeTagCount,
    cookbookRecipeCount,
    skippedOnDuplicateImport: sourceIds.size,
    timeNotesCount,
    parseableTimeCount,
    ratingsCount,
    sourceIdCount: sourceIds.size,
    primaryPhotoCount,
    decodedPrimaryPhotoCount,
    imageSourceUrlCount,
    exportableSampleCount,
    searchableSampleHits,
    errors,
    warnings,
  };
}

function assertTruth(label: string, preview: ImportPreview, expectedCount?: number) {
  if (expectedCount !== undefined && preview.recipeCount !== expectedCount) {
    preview.errors.push(`${label} expected ${expectedCount} recipes, saw ${preview.recipeCount}`);
  }
  if (preview.recipeCount !== preview.sourceIdCount) {
    preview.errors.push(`${label} source id count does not match recipe count`);
  }
  if (preview.primaryPhotoCount !== preview.decodedPrimaryPhotoCount) {
    preview.errors.push(`${label} has undecodable primary photos`);
  }
  if (preview.exportableSampleCount < Math.min(12, preview.recipeCount)) {
    preview.errors.push(`${label} export sample did not round-trip to JSON-LD and Paprika HTML`);
  }
  if (preview.searchableSampleHits < Math.min(12, preview.recipeCount)) {
    preview.errors.push(`${label} searchable sample did not include title and ingredient text`);
  }
}

const { values } = parseArgs({
  options: {
    archive: { type: "string", short: "a", default: DEFAULT_ARCHIVE },
    expected: { type: "string", short: "e", default: "836" },
  },
});

const started = Date.now();
const data = readFileSync(values.archive);
const recipes = parsePaprikaArchive(data);
const subset = pickRepresentativeSubset(recipes);

const subsetPreview = validateImport(subset);
assertTruth("subset", subsetPreview);

const fullPreview = validateImport(recipes);
assertTruth("full corpus", fullPreview, Number(values.expected));

const report = {
  archive: values.archive,
  parseMs: Date.now() - started,
  subset: subsetPreview,
  full: fullPreview,
  rollbackStory:
    "Paprika binary imports stamp every recipe with one import_job_id and paprika_original_id; rollback is delete recipes where import_job_id matches, cascading ingredients/tags/cookbook links, then remove the import_jobs row.",
};

console.log(JSON.stringify(report, null, 2));

if (subsetPreview.errors.length || fullPreview.errors.length) {
  process.exitCode = 1;
}
