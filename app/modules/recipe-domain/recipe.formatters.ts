import type { IngredientItem } from "./recipe.types";

export function createRecipeSlug(title: string): string {
  return title
    .trim()
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .replace(/-{2,}/g, "-");
}

export function formatDisplayTime(minutes: number | undefined): string {
  if (minutes === undefined) {
    return "";
  }

  if (minutes < 1) {
    return "0 min";
  }

  const hours = Math.floor(minutes / 60);
  const remainingMinutes = minutes % 60;
  const parts: string[] = [];

  if (hours > 0) {
    parts.push(`${hours} hr`);
  }

  if (remainingMinutes > 0) {
    parts.push(`${remainingMinutes} min`);
  }

  return parts.join(" ");
}

export function formatIngredientDisplayText(ingredient: IngredientItem): string {
  if (ingredient.raw.trim().length > 0) {
    return ingredient.raw.trim();
  }

  const measure = formatIngredientMeasure(ingredient);
  const item = ingredient.item.trim();
  const preparation = ingredient.preparation?.trim();
  const baseText = [measure, item].filter(Boolean).join(" ");

  if (!preparation) {
    return baseText;
  }

  return `${baseText}, ${preparation}`;
}

export function formatIngredientMeasure(ingredient: IngredientItem): string {
  const rawMeasure = parseRawIngredientMeasure(ingredient.raw);
  const quantity =
    ingredient.quantity === undefined ? "" : formatQuantity(ingredient.quantity);
  const unit = ingredient.unit?.trim() ?? "";

  return [quantity, unit].filter(Boolean).join(" ") || rawMeasure;
}

function formatQuantity(quantity: number): string {
  const whole = Math.trunc(quantity);
  const remainder = quantity - whole;

  if (Number.isInteger(quantity) || Math.abs(remainder) < Number.EPSILON) {
    return String(quantity);
  }

  const fraction = toSimpleFraction(remainder);

  if (!fraction) {
    return String(quantity);
  }

  return whole > 0 ? `${whole} ${fraction}` : fraction;
}

function toSimpleFraction(value: number): string | undefined {
  const denominators = [2, 3, 4, 8, 16];

  for (const denominator of denominators) {
    const numerator = Math.round(value * denominator);

    if (numerator > 0 && Math.abs(value - numerator / denominator) < 0.001) {
      return `${numerator}/${denominator}`;
    }
  }

  return undefined;
}

function parseRawIngredientMeasure(raw: string): string {
  const rawUnitPattern = [
    "teaspoons?",
    "tsp",
    "tablespoons?",
    "tbsp",
    "cups?",
    "pints?",
    "quarts?",
    "ounces?",
    "oz",
    "pounds?",
    "lbs?",
    "grams?",
    "g",
    "kilograms?",
    "kg",
    "cans?",
    "packages?",
    "sticks?",
    "cloves?",
  ].join("|");
  const quantityPattern =
    "(?:\\d+(?:\\s+\\d+/\\d+|\\s*[¼½¾⅓⅔⅛⅜⅝⅞])?|\\d+/\\d+|[¼½¾⅓⅔⅛⅜⅝⅞])";
  const match = raw
    .trim()
    .match(
      new RegExp(
        `^(${quantityPattern})(?:\\s*\\([^)]*\\))?\\s+(${rawUnitPattern})\\b`,
        "i",
      ),
    );

  return match ? `${match[1]} ${match[2]}` : "";
}
