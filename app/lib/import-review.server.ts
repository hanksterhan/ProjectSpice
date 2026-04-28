import type { PaprikaRecipeText } from "./paprika-binary-parser";

export type ImportReviewStatus = "pending" | "approved" | "edited" | "skipped";
export type ImportConfidenceLevel = "high" | "medium" | "low";

export type ParsedFieldSummary = {
  titlePresent: boolean;
  ingredientLineCount: number;
  directionStepCount: number;
  categoryCount: number;
  hasSourceUrl: boolean;
  hasImage: boolean;
  hasServings: boolean;
  hasTiming: boolean;
  warnings: string[];
};

export type ImportConfidence = {
  score: number;
  level: ImportConfidenceLevel;
  summary: ParsedFieldSummary;
};

export const BULK_APPROVE_DEFAULT_THRESHOLD = 90;
export const BULK_APPROVE_MIN_THRESHOLD = 60;
export const BULK_APPROVE_MAX_THRESHOLD = 100;

function lineCount(value: string | null | undefined): number {
  return (value ?? "")
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean).length;
}

function directionStepCount(value: string | null | undefined): number {
  const text = value?.trim() ?? "";
  if (!text) return 0;
  const numberedSteps = text.match(/(?:^|\n)\s*\d+[).]/g)?.length ?? 0;
  return Math.max(numberedSteps, lineCount(text), 1);
}

export function clampBulkApproveThreshold(value: unknown): number {
  const numeric = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(numeric)) return BULK_APPROVE_DEFAULT_THRESHOLD;
  return Math.min(
    BULK_APPROVE_MAX_THRESHOLD,
    Math.max(BULK_APPROVE_MIN_THRESHOLD, Math.round(numeric))
  );
}

export function buildPaprikaParsedFieldSummary(
  recipe: PaprikaRecipeText
): ParsedFieldSummary {
  const ingredientLineCount = lineCount(recipe.ingredients);
  const steps = directionStepCount(recipe.directions);
  const categories = recipe.categories?.filter((cat) => cat.trim()).length ?? 0;
  const hasTiming = Boolean(
    recipe.prep_time?.trim() || recipe.cook_time?.trim() || recipe.total_time?.trim()
  );

  const warnings: string[] = [];
  if (!recipe.name?.trim()) warnings.push("Missing title");
  if (ingredientLineCount === 0) warnings.push("No ingredients found");
  if (steps === 0) warnings.push("No directions found");
  if (categories === 0) warnings.push("No Paprika categories");
  if (!recipe.source_url?.trim()) warnings.push("No source URL");
  if (!recipe.image_url?.trim() && !recipe.photo?.trim()) warnings.push("No image reference");
  if (!recipe.servings?.trim()) warnings.push("No servings");
  if (!hasTiming) warnings.push("No timing fields");

  return {
    titlePresent: Boolean(recipe.name?.trim()),
    ingredientLineCount,
    directionStepCount: steps,
    categoryCount: categories,
    hasSourceUrl: Boolean(recipe.source_url?.trim()),
    hasImage: Boolean(recipe.image_url?.trim() || recipe.photo?.trim()),
    hasServings: Boolean(recipe.servings?.trim()),
    hasTiming,
    warnings,
  };
}

export function scorePaprikaImportConfidence(
  recipe: PaprikaRecipeText
): ImportConfidence {
  const summary = buildPaprikaParsedFieldSummary(recipe);
  let score = 100;

  if (!summary.titlePresent) score -= 45;
  if (summary.ingredientLineCount === 0) score -= 25;
  else if (summary.ingredientLineCount < 3) score -= 8;
  if (summary.directionStepCount === 0) score -= 25;
  if (summary.categoryCount === 0) score -= 5;
  if (!summary.hasSourceUrl) score -= 4;
  if (!summary.hasImage) score -= 3;
  if (!summary.hasServings) score -= 4;
  if (!summary.hasTiming) score -= 4;

  score = Math.max(0, Math.min(100, score));
  const level: ImportConfidenceLevel =
    score >= 85 ? "high" : score >= 65 ? "medium" : "low";

  return { score, level, summary };
}
