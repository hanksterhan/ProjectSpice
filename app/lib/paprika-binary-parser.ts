/**
 * Paprika binary (.paprikarecipes) archive parser.
 *
 * A .paprikarecipes file is a ZIP archive where each entry is a gzip-compressed
 * JSON file describing one recipe. This module runs in both browser and
 * Cloudflare Worker environments via the fflate library.
 */

import { gunzipSync, unzipSync } from "fflate";

// ─── Types ────────────────────────────────────────────────────────────────────

export interface PaprikaPhoto {
  filename: string;
  data: string; // base64 JPEG/PNG
  name: string;
  hash: string;
}

/** Raw JSON structure from a single .paprikarecipe entry. */
export interface PaprikaRecipeRaw {
  uid: string;
  name: string;
  ingredients: string; // multi-line, one ingredient per line
  directions: string;
  description: string;
  notes: string;
  categories: string[];
  servings: string;
  prep_time: string;
  cook_time: string;
  total_time: string;
  difficulty: string;
  rating: number; // 0–5
  source: string;
  source_url: string;
  image_url: string;
  photo: string; // filename GUID or small base64 thumbnail
  photo_data: string; // base64 JPEG — primary recipe photo
  photo_hash: string;
  photo_large: string | null; // filename GUID for high-res photo
  photos: PaprikaPhoto[]; // additional photos
  nutritional_info: string;
  created: string; // "YYYY-MM-DD HH:MM:SS"
  hash: string;
}

/** Recipe with photo fields stripped — safe to include in API batch payloads. */
export type PaprikaRecipeText = Omit<PaprikaRecipeRaw, "photo_data" | "photos">;

// ─── Parser ───────────────────────────────────────────────────────────────────

/**
 * Parse a .paprikarecipes archive buffer into an array of raw recipe objects.
 *
 * Designed to run client-side in the browser (avoiding CF Worker upload limits).
 * Invalid or malformed entries are silently skipped.
 */
export function parsePaprikaArchive(data: Uint8Array): PaprikaRecipeRaw[] {
  const entries = unzipSync(data);
  const recipes: PaprikaRecipeRaw[] = [];

  for (const [filename, bytes] of Object.entries(entries)) {
    if (!filename.endsWith(".paprikarecipe")) continue;
    try {
      const json = new TextDecoder().decode(gunzipSync(bytes));
      const recipe = JSON.parse(json) as PaprikaRecipeRaw;
      if (!recipe.uid || !recipe.name) continue;
      // Normalise missing arrays/strings so callers don't need to guard
      recipe.categories ??= [];
      recipe.photos ??= [];
      recipe.ingredients ??= "";
      recipe.directions ??= "";
      recipes.push(recipe);
    } catch {
      // skip malformed entries silently
    }
  }

  return recipes;
}

/** Return a text-only copy, dropping base64 photo fields to reduce payload size. */
export function toTextPayload(recipe: PaprikaRecipeRaw): PaprikaRecipeText {
  const { photo_data: _pd, photos: _ph, ...rest } = recipe;
  return rest;
}

function fallbackCookbookName(fileName: string): string {
  const baseName = fileName
    .replace(/\.[^.]+$/, "")
    .replace(/[_-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  return baseName || "Paprika Import";
}

/**
 * Pick one source cookbook name for a Paprika archive.
 *
 * Paprika categories are recipe tags, but some exports include one category
 * applied to every recipe that describes the source. Use that when unambiguous;
 * otherwise fall back to the uploaded file name.
 */
export function derivePaprikaCookbookName(
  fileName: string,
  recipes: Pick<PaprikaRecipeRaw, "categories">[]
): string {
  if (recipes.length === 0) return fallbackCookbookName(fileName);

  const counts = new Map<string, { name: string; count: number }>();
  for (const recipe of recipes) {
    const seen = new Set<string>();
    for (const rawCategory of recipe.categories ?? []) {
      const name = rawCategory.trim();
      if (!name) continue;
      const key = name.toLocaleLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      const current = counts.get(key);
      counts.set(key, { name: current?.name ?? name, count: (current?.count ?? 0) + 1 });
    }
  }

  const commonCategories = Array.from(counts.values()).filter(
    (category) => category.count === recipes.length
  );
  return commonCategories.length === 1
    ? commonCategories[0].name
    : fallbackCookbookName(fileName);
}

/** Parse Paprika's difficulty string into a normalised value (or null). */
export function normaliseDifficulty(raw: string): string | null {
  if (!raw?.trim()) return null;
  // e.g. "2 (Easy)" → "Easy"
  const m = /\(([^)]+)\)/.exec(raw);
  if (m) return m[1].trim();
  // plain text like "Easy" or "Medium"
  return raw.trim() || null;
}

/** Parse a servings string into { servings: number | null, servingsUnit: string | null }. */
export function parseServings(raw: string): {
  servings: number | null;
  servingsUnit: string | null;
} {
  if (!raw?.trim()) return { servings: null, servingsUnit: null };
  const n = parseFloat(raw);
  if (!isNaN(n) && String(Math.round(n)) === raw.trim()) {
    return { servings: n, servingsUnit: null };
  }
  // "Makes enough for one 9-inch pie" → servingsUnit only
  const leading = parseFloat(raw);
  if (!isNaN(leading)) {
    return { servings: leading, servingsUnit: raw.replace(/^\d+\.?\d*\s*/, "").trim() || null };
  }
  return { servings: null, servingsUnit: raw.trim() };
}
