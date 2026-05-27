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

  const quantity = ingredient.quantity ? formatQuantity(ingredient.quantity) : "";
  const unit = ingredient.unit?.trim() ?? "";
  const item = ingredient.item.trim();
  const preparation = ingredient.preparation?.trim();
  const baseText = [quantity, unit, item].filter(Boolean).join(" ");

  if (!preparation) {
    return baseText;
  }

  return `${baseText}, ${preparation}`;
}

function formatQuantity(quantity: number): string {
  return Number.isInteger(quantity) ? String(quantity) : String(quantity);
}
