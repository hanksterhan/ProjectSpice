/**
 * Generates per-recipe export formats for the data export ZIP.
 *
 * - toJsonLd:      Schema.org Recipe JSON-LD object (plain object, caller serialises)
 * - toPaprikaHtml: Paprika-compatible HTML string matching the import format
 * - buildExportPayload: collects all user data into a single JSON-serialisable object
 */

// ─── Types ────────────────────────────────────────────────────────────────────

export interface ExportIngredient {
  sortOrder: number;
  groupName: string | null;
  quantityRaw: string | null;
  unitRaw: string | null;
  name: string;
  notes: string | null;
  weightG: number | null;
  footnoteRef: string | null;
  isGroupHeader: boolean;
}

export interface ExportTag {
  id: string;
  name: string;
}

export interface ExportRecipe {
  id: string;
  title: string;
  slug: string;
  description: string | null;
  sourceUrl: string | null;
  sourceType: string;
  prepTimeMin: number | null;
  activeTimeMin: number | null;
  totalTimeMin: number | null;
  timeNotes: string | null;
  servings: number | null;
  servingsUnit: string | null;
  difficulty: string | null;
  directionsText: string;
  notes: string | null;
  imageKey: string | null;
  rating: number | null;
  visibility: string;
  paprikaOriginalId: string | null;
  createdAt: Date | null;
  updatedAt: Date | null;
  ingredients: ExportIngredient[];
  tags: ExportTag[];
}

export interface ExportLog {
  id: string;
  recipeId: string | null;
  cookedAt: Date | null;
  rating: number | null;
  notes: string | null;
  modifications: string | null;
}

export interface ExportPayload {
  exportedAt: string;
  version: "1";
  recipes: ExportRecipe[];
  logs: ExportLog[];
}

// ─── Schema.org JSON-LD ───────────────────────────────────────────────────────

function minutesToIso8601(min: number | null): string | undefined {
  if (!min) return undefined;
  const h = Math.floor(min / 60);
  const m = min % 60;
  return h > 0 ? `PT${h}H${m > 0 ? `${m}M` : ""}` : `PT${m}M`;
}

export function toJsonLd(recipe: ExportRecipe): Record<string, unknown> {
  const ingredientStrings = recipe.ingredients
    .filter((i) => !i.isGroupHeader)
    .map((i) => {
      const parts: string[] = [];
      if (i.quantityRaw) parts.push(i.quantityRaw);
      if (i.unitRaw) parts.push(i.unitRaw);
      parts.push(i.name);
      if (i.notes) parts.push(i.notes);
      return parts.join(" ");
    });

  const ld: Record<string, unknown> = {
    "@context": "https://schema.org",
    "@type": "Recipe",
    name: recipe.title,
    description: recipe.description ?? undefined,
    recipeIngredient: ingredientStrings,
    recipeInstructions: recipe.directionsText
      .split("\n")
      .map((s) => s.trim())
      .filter(Boolean)
      .map((text) => ({ "@type": "HowToStep", text })),
    keywords: recipe.tags.map((t) => t.name).join(", ") || undefined,
  };

  if (recipe.prepTimeMin) ld.prepTime = minutesToIso8601(recipe.prepTimeMin);
  if (recipe.totalTimeMin) ld.totalTime = minutesToIso8601(recipe.totalTimeMin);
  if (recipe.servings) ld.recipeYield = `${recipe.servings}${recipe.servingsUnit ? " " + recipe.servingsUnit : ""}`;
  if (recipe.rating) ld.aggregateRating = { "@type": "AggregateRating", ratingValue: recipe.rating, reviewCount: 1 };
  if (recipe.sourceUrl) ld.url = recipe.sourceUrl;

  return ld;
}

// ─── Paprika-compatible HTML ──────────────────────────────────────────────────

function escHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function formatMinutes(min: number | null): string {
  if (!min) return "";
  const h = Math.floor(min / 60);
  const m = min % 60;
  if (h === 0) return `${m} min`;
  if (m === 0) return `${h} hr`;
  return `${h} hr ${m} min`;
}

export function toPaprikaHtml(recipe: ExportRecipe): string {
  const tags = recipe.tags.map((t) => t.name).join(", ");
  const prepStr = formatMinutes(recipe.prepTimeMin);
  const totalStr = formatMinutes(recipe.totalTimeMin);

  const ingredientLines = recipe.ingredients
    .map((ing) => {
      if (ing.isGroupHeader) {
        return `<p class="line" itemprop="recipeIngredient"><strong>${escHtml(ing.name)}</strong></p>`;
      }
      const parts: string[] = [];
      if (ing.quantityRaw) parts.push(ing.quantityRaw);
      if (ing.unitRaw) parts.push(ing.unitRaw);
      parts.push(ing.name);
      if (ing.notes) parts.push(ing.notes);
      const line = parts.join(" ");
      return `<p class="line" itemprop="recipeIngredient">${escHtml(line)}</p>`;
    })
    .join("\n");

  const directionLines = recipe.directionsText
    .split("\n")
    .map((s) => s.trim())
    .filter(Boolean)
    .map((s) => `<li itemprop="recipeInstructions">${escHtml(s)}</li>`)
    .join("\n");

  return `<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><title>${escHtml(recipe.title)}</title></head>
<body itemscope itemtype="http://schema.org/Recipe">
<h2 itemprop="name">${escHtml(recipe.title)}</h2>
${recipe.description ? `<p itemprop="description">${escHtml(recipe.description)}</p>` : ""}
${prepStr ? `<p>Prep Time: <span itemprop="prepTime">${escHtml(prepStr)}</span></p>` : ""}
${totalStr ? `<p>Total Time: <span itemprop="totalTime">${escHtml(totalStr)}</span></p>` : ""}
${recipe.servings ? `<p>Servings: <span itemprop="recipeYield">${recipe.servings}${recipe.servingsUnit ? " " + recipe.servingsUnit : ""}</span></p>` : ""}
${tags ? `<p>Categories: ${escHtml(tags)}</p>` : ""}
<div class="ingredients">
<h3>Ingredients</h3>
${ingredientLines}
</div>
<div class="directions">
<h3>Directions</h3>
<ol>
${directionLines}
</ol>
</div>
${recipe.notes ? `<div class="notes"><h3>Notes</h3><p itemprop="description">${escHtml(recipe.notes)}</p></div>` : ""}
${recipe.sourceUrl ? `<p>Source: <a href="${escHtml(recipe.sourceUrl)}">${escHtml(recipe.sourceUrl)}</a></p>` : ""}
</body>
</html>`;
}

// ─── Full JSON payload ────────────────────────────────────────────────────────

export function buildExportPayload(
  recipes: ExportRecipe[],
  logs: ExportLog[]
): ExportPayload {
  return {
    exportedAt: new Date().toISOString(),
    version: "1",
    recipes,
    logs,
  };
}
