/**
 * URL scraper for ProjectSpice.
 *
 * 3-tier pipeline:
 *   1. Schema.org JSON-LD extraction (highest confidence)
 *   2. Microdata heuristics (itemprop attributes)
 *   3. Workers AI fallback — stubbed (AI is P2)
 *
 * All time fields are returned as raw strings for the time-parser to handle
 * (including ISO 8601 durations like "PT2H30M").
 */

export interface ScrapedRecipe {
  title: string;
  description: string | null;
  prepTimeRaw: string | null;
  cookTimeRaw: string | null;
  totalTimeRaw: string | null;
  servingsRaw: string | null;
  ingredients: string[];
  directionsText: string;
  notes: string | null;
  imageUrl: string | null;
  tags: string[];
  confidence: "json-ld" | "heuristic";
}

export type ScrapeResult =
  | { ok: true; recipe: ScrapedRecipe }
  | { ok: false; paywalled: true }
  | { ok: false; paywalled: false; error: string };

// ---------------------------------------------------------------------------
// JSON-LD extraction (Tier 1)
// ---------------------------------------------------------------------------

function stripHtml(html: string): string {
  return html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
}

function extractImageUrl(image: unknown): string | null {
  if (!image) return null;
  if (typeof image === "string") return image;
  if (Array.isArray(image)) {
    for (const item of image) {
      const url = extractImageUrl(item);
      if (url) return url;
    }
    return null;
  }
  if (typeof image === "object" && image !== null) {
    const obj = image as Record<string, unknown>;
    if (typeof obj.url === "string") return obj.url;
    if (typeof obj.contentUrl === "string") return obj.contentUrl;
  }
  return null;
}

function extractInstructions(instructions: unknown): string {
  if (!instructions) return "";
  if (typeof instructions === "string") return stripHtml(instructions);

  if (Array.isArray(instructions)) {
    const steps: string[] = [];
    for (const item of instructions) {
      if (typeof item === "string") {
        steps.push(stripHtml(item));
      } else if (typeof item === "object" && item !== null) {
        const obj = item as Record<string, unknown>;
        if (obj["@type"] === "HowToSection" && Array.isArray(obj.itemListElement)) {
          for (const step of obj.itemListElement) {
            if (typeof step === "object" && step !== null) {
              const s = step as Record<string, unknown>;
              if (typeof s.text === "string") steps.push(stripHtml(s.text));
            }
          }
        } else if (typeof obj.text === "string") {
          steps.push(stripHtml(obj.text));
        } else if (typeof obj.name === "string") {
          steps.push(stripHtml(obj.name));
        }
      }
    }
    return steps.join("\n\n");
  }
  return "";
}

function extractTags(obj: Record<string, unknown>): string[] {
  const tags: string[] = [];
  for (const field of ["recipeCategory", "recipeCuisine", "keywords"]) {
    const val = obj[field];
    if (!val) continue;
    if (typeof val === "string") {
      tags.push(...val.split(/[,;]+/).map((s) => s.trim()).filter(Boolean));
    } else if (Array.isArray(val)) {
      for (const v of val) {
        if (typeof v === "string") tags.push(...v.split(/[,;]+/).map((s) => s.trim()).filter(Boolean));
      }
    }
  }
  return [...new Set(tags)];
}

function normalizeRecipeObject(obj: Record<string, unknown>, _url: string): ScrapedRecipe | null {
  const title =
    typeof obj.name === "string" ? obj.name.trim() : null;
  if (!title) return null;

  const ingredients: string[] = [];
  if (Array.isArray(obj.recipeIngredient)) {
    for (const ing of obj.recipeIngredient) {
      if (typeof ing === "string" && ing.trim()) {
        ingredients.push(stripHtml(ing.trim()));
      }
    }
  }

  const directionsText = extractInstructions(obj.recipeInstructions);

  if (ingredients.length === 0 && !directionsText) return null;

  return {
    title,
    description: typeof obj.description === "string" ? stripHtml(obj.description).slice(0, 1000) : null,
    prepTimeRaw: typeof obj.prepTime === "string" ? obj.prepTime : null,
    cookTimeRaw: typeof obj.cookTime === "string" ? obj.cookTime : null,
    totalTimeRaw: typeof obj.totalTime === "string" ? obj.totalTime : null,
    servingsRaw: typeof obj.recipeYield === "string"
      ? obj.recipeYield
      : Array.isArray(obj.recipeYield)
        ? String(obj.recipeYield[0] ?? "")
        : null,
    ingredients,
    directionsText,
    notes: null,
    imageUrl: extractImageUrl(obj.image),
    tags: extractTags(obj),
    confidence: "json-ld",
  };
}

function findRecipeInJsonLd(data: unknown, url: string): ScrapedRecipe | null {
  if (!data || typeof data !== "object") return null;

  if (Array.isArray(data)) {
    for (const item of data) {
      const r = findRecipeInJsonLd(item, url);
      if (r) return r;
    }
    return null;
  }

  const obj = data as Record<string, unknown>;

  // Handle @graph arrays
  if (Array.isArray(obj["@graph"])) {
    for (const node of obj["@graph"]) {
      const r = findRecipeInJsonLd(node, url);
      if (r) return r;
    }
  }

  const type = obj["@type"];
  const isRecipe =
    type === "Recipe" ||
    (Array.isArray(type) && type.includes("Recipe"));

  if (isRecipe) return normalizeRecipeObject(obj, url);

  return null;
}

function extractJsonLd(html: string, url: string): ScrapedRecipe | null {
  const scriptRe = /<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi;
  let match: RegExpExecArray | null;
  while ((match = scriptRe.exec(html)) !== null) {
    try {
      const data = JSON.parse(match[1]);
      const recipe = findRecipeInJsonLd(data, url);
      if (recipe) return recipe;
    } catch {
      // malformed JSON-LD — try next block
    }
  }
  return null;
}

// ---------------------------------------------------------------------------
// Microdata heuristic extraction (Tier 2)
// ---------------------------------------------------------------------------

function extractItempropText(html: string, prop: string): string | null {
  // Match itemprop="..." in various element types; extract text content
  const re = new RegExp(
    `<(?:meta|time|span|p|div|li|h[1-6])[^>]*itemprop=["']${prop}["'][^>]*(?:content=["']([^"']+)["'][^>]*/?>|datetime=["']([^"']+)["'][^>]*/?>|>(.*?)</(?:span|p|div|li|h[1-6])>)`,
    "i"
  );
  const m = re.exec(html);
  if (!m) return null;
  return (m[1] || m[2] || (m[3] ? stripHtml(m[3]) : null))?.trim() || null;
}

function extractItempropAll(html: string, prop: string): string[] {
  const results: string[] = [];
  const re = new RegExp(
    `<(?:meta|time|span|p|div|li)[^>]*itemprop=["']${prop}["'][^>]*(?:content=["']([^"']+)["'][^>]*/?>|>(.*?)</(?:span|p|div|li)>)`,
    "gi"
  );
  let m: RegExpExecArray | null;
  while ((m = re.exec(html)) !== null) {
    const text = (m[1] || (m[2] ? stripHtml(m[2]) : null))?.trim();
    if (text) results.push(text);
  }
  return results;
}

function extractHeuristic(html: string, _url: string): ScrapedRecipe | null {
  const title = extractItempropText(html, "name");
  if (!title) return null;

  const ingredients = extractItempropAll(html, "recipeIngredient");
  const directionsRaw = extractItempropAll(html, "recipeInstructions");
  const directionsText = directionsRaw.join("\n\n");

  if (ingredients.length === 0 && !directionsText) return null;

  const categories = extractItempropAll(html, "recipeCategory");
  const cuisines = extractItempropAll(html, "recipeCuisine");
  const tags = [...new Set([...categories, ...cuisines])];

  return {
    title,
    description: extractItempropText(html, "description")?.slice(0, 1000) ?? null,
    prepTimeRaw: extractItempropText(html, "prepTime"),
    cookTimeRaw: extractItempropText(html, "cookTime"),
    totalTimeRaw: extractItempropText(html, "totalTime"),
    servingsRaw: extractItempropText(html, "recipeYield"),
    ingredients,
    directionsText,
    notes: null,
    imageUrl: null,
    tags,
    confidence: "heuristic",
  };
}

// ---------------------------------------------------------------------------
// Paywall detection
// ---------------------------------------------------------------------------

export function detectPaywall(status: number, finalUrl: string, html: string): boolean {
  if (status === 401 || status === 403) return true;

  const loginUrlRe = /[/?](login|signin|sign-in|subscribe|paywall|account\/login)/i;
  if (loginUrlRe.test(finalUrl)) return true;

  // Hard gate: no recipe content + login form present
  const hasLoginForm = /<input[^>]+(?:type=["']password["']|name=["']password["'])/i.test(html);
  const hasRecipeMarker =
    /itemprop=["']recipe/i.test(html) ||
    /"@type"\s*:\s*"Recipe"/i.test(html);

  if (hasLoginForm && !hasRecipeMarker) return true;

  return false;
}

// ---------------------------------------------------------------------------
// Main entry
// ---------------------------------------------------------------------------

export function scrapeHtml(html: string, url: string): ScrapeResult {
  // Tier 1: JSON-LD
  const jsonLdResult = extractJsonLd(html, url);
  if (jsonLdResult) return { ok: true, recipe: jsonLdResult };

  // Tier 2: Microdata heuristics
  const heuristicResult = extractHeuristic(html, url);
  if (heuristicResult) return { ok: true, recipe: heuristicResult };

  // Tier 3: Workers AI fallback (P2 — stubbed)
  // TODO: implement Workers AI extraction for recipes that have no structured data

  return { ok: false, paywalled: false, error: "Could not extract recipe from this page. Try pasting the page HTML directly." };
}
