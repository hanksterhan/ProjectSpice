/**
 * Browser-side parser for Paprika 3 HTML export files.
 *
 * Each HTML file is a single recipe rendered with Schema.org microdata.
 * Parsing uses regex rather than DOMParser so it works in both browser and
 * Vitest (Node) test environments without an HTML engine dependency.
 */

// ─── Types ─────────────────────────────────────────────────────────────────

export interface PaprikaHtmlIngredient {
  /** Full text of the ingredient line (HTML-entities decoded, tags stripped). */
  text: string;
  /** Content of the leading <strong> tag, if present; null for group headers. */
  strongToken: string | null;
}

export interface PaprikaHtmlRecipe {
  /** Decoded filename (e.g. "51-hour focaccia.html"). Used as dedup key. */
  filename: string;
  title: string;
  description: string | null;
  /** Raw prepTime string — pass directly to parseDuration / parseTimeString. */
  prepTime: string | null;
  /** Raw cookTime string — may contain the "undefinedACTIVE TIME:…" bug. */
  cookTime: string | null;
  servings: string | null;
  difficulty: string | null;
  /** Canonical source URL from <a itemprop="url">, if present. */
  sourceUrl: string | null;
  /** Author / book credit from <span itemprop="author">. */
  sourceAttribution: string | null;
  /** Comma-split category tokens (already HTML-entity-decoded). */
  categories: string[];
  /** 0–5 star rating from the value="N" attribute on the rating element. */
  rating: number;
  ingredients: PaprikaHtmlIngredient[];
  /** Directions text with <br> converted to newlines and all tags stripped. */
  directions: string;
  notes: string | null;
  /**
   * External image URL from the <a href> wrapping the recipe photo.
   * null when href is "#" (local-only image) or absent.
   */
  imageSourceUrl: string | null;
  /**
   * Relative path inside the ZIP, e.g. "Images/{GUID1}/{GUID2}.jpg".
   * Use this to locate the image file in the fflate-unpacked ZIP entries.
   */
  imageSrc: string | null;
}

// ─── HTML entity decoding ────────────────────────────────────────────────────

const HTML_ENTITIES: Record<string, string> = {
  "&amp;": "&",
  "&lt;": "<",
  "&gt;": ">",
  "&quot;": '"',
  "&#39;": "'",
  "&apos;": "'",
  "&nbsp;": " ",
};

function decodeHtmlEntities(s: string): string {
  return s
    .replace(/&[a-z]+;|&#\d+;/gi, (m) => {
      if (m in HTML_ENTITIES) return HTML_ENTITIES[m];
      const num = m.match(/&#(\d+);/);
      if (num) return String.fromCharCode(parseInt(num[1], 10));
      return m;
    })
    .trim();
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

/** Strip all HTML tags, decode entities, collapse whitespace. */
function stripTags(html: string): string {
  return decodeHtmlEntities(html.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ")).trim();
}

/** Convert <br> variants to newlines, then strip remaining tags. */
function tagsToText(html: string): string {
  return decodeHtmlEntities(
    html
      .replace(/<br\s*\/?>/gi, "\n")
      .replace(/<\/p>\s*<p[^>]*>/gi, "\n")
      .replace(/<[^>]*>/g, "")
      .replace(/[ \t]+/g, " ")
      .replace(/\n[ \t]+/g, "\n")
  ).trim();
}

/** Extract the first occurrence of itemprop="X" element text content. */
function itempropText(html: string, prop: string): string | null {
  const m = html.match(
    new RegExp(`itemprop="${prop}"[^>]*>([\\s\\S]*?)<\\/(?:span|p|div|h1|h2|h3)>`, "i")
  );
  return m ? stripTags(m[1]) || null : null;
}

/** Extract the rating from value="N" attribute on the aggregateRating element. */
function extractRating(html: string): number {
  const m = html.match(/itemprop="aggregateRating"[^>]*value="(\d+)"/);
  return m ? Math.min(5, Math.max(0, parseInt(m[1], 10))) : 0;
}

/** Extract the source URL from <a itemprop="url" href="...">. */
function extractSourceUrl(html: string): string | null {
  const m = html.match(/<a[^>]*itemprop="url"[^>]*href="([^"#][^"]*)"/i);
  if (!m) return null;
  const url = m[1].trim();
  return url && url !== "#" ? url : null;
}

/** Extract <span itemprop="author"> text content. */
function extractAttribution(html: string): string | null {
  return itempropText(html, "author");
}

/** Extract image src (relative path) and the external href wrapping it. */
function extractImage(html: string): { imageSrc: string | null; imageSourceUrl: string | null } {
  // Find any <img> with itemprop="image" regardless of attribute order
  const imgTagMatch = html.match(/<img\b[^>]*\bitemprop="image"[^>]*>/i);
  if (!imgTagMatch) return { imageSrc: null, imageSourceUrl: null };

  const imgTag = imgTagMatch[0];
  const srcMatch = imgTag.match(/\bsrc="([^"]+)"/i);
  const imageSrc = srcMatch?.[1]?.trim() ?? null;

  // Find the photobox <a href> that wraps the image
  const photoboxMatch = html.match(
    /<div class="photobox">[\s\S]*?<a\b[^>]*\bhref="([^"]+)"[\s\S]*?<\/div>/i
  );
  const href = photoboxMatch?.[1]?.trim();
  const imageSourceUrl = href && href !== "#" ? href : null;

  return { imageSrc, imageSourceUrl };
}

/** Extract all ingredient lines from the .ingredients div. */
function extractIngredients(html: string): PaprikaHtmlIngredient[] {
  const section = html.match(/class="ingredients text">([\s\S]*?)<\/div>/i)?.[1] ?? "";
  const results: PaprikaHtmlIngredient[] = [];

  const lineRe = /<p[^>]*itemprop="recipeIngredient"[^>]*>([\s\S]*?)<\/p>/gi;
  for (const m of section.matchAll(lineRe)) {
    const inner = m[1];
    const strongMatch = inner.match(/<strong[^>]*>([\s\S]*?)<\/strong>/i);
    const strongToken = strongMatch ? decodeHtmlEntities(strongMatch[1]) : null;
    const text = stripTags(inner);
    if (text) results.push({ text, strongToken });
  }
  return results;
}

/** Extract directions text (handles both multiple <p> and <br>-separated lines). */
function extractDirections(html: string): string {
  const match = html.match(/itemprop="recipeInstructions"[^>]*>([\s\S]*?)<\/div>/i);
  if (!match) return "";
  return tagsToText(match[1]);
}

/** Extract text from a named .{classname}box section. */
function extractBoxText(html: string, boxClass: string, contentClass: string): string | null {
  const sectionRe = new RegExp(
    `class="${boxClass}[^"]*">[\\s\\S]*?class="${contentClass}[^"]*">([\\s\\S]*?)<\\/div>`,
    "i"
  );
  const m = html.match(sectionRe);
  if (!m) return null;
  const text = tagsToText(m[1]);
  return text || null;
}

// ─── Main export ─────────────────────────────────────────────────────────────

/**
 * Parse a single Paprika HTML export file into a structured recipe object.
 * Returns null if the HTML doesn't look like a Paprika recipe (no title found).
 */
export function parsePaprikaHtml(
  html: string,
  filename: string
): PaprikaHtmlRecipe | null {
  const title = itempropText(html, "name");
  if (!title) return null;

  const prepTimeRaw = itempropText(html, "prepTime");
  const cookTimeRaw = itempropText(html, "cookTime");

  const { imageSrc, imageSourceUrl } = extractImage(html);
  const categoriesRaw = itempropText(html, "recipeCategory");

  return {
    filename,
    title,
    description: extractBoxText(html, "descriptionbox", "description") ?? null,
    prepTime: prepTimeRaw,
    cookTime: cookTimeRaw,
    servings: itempropText(html, "recipeYield"),
    difficulty: itempropText(html, "difficulty"),
    sourceUrl: extractSourceUrl(html),
    sourceAttribution: extractAttribution(html),
    categories: categoriesRaw
      ? categoriesRaw.split(",").map((s) => s.trim()).filter(Boolean)
      : [],
    rating: extractRating(html),
    ingredients: extractIngredients(html),
    directions: extractDirections(html),
    notes: extractBoxText(html, "notesbox", "notes") ?? null,
    imageSourceUrl,
    imageSrc,
  };
}
