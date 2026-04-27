/**
 * Guided EPUB recipe candidate extractor.
 *
 * EPUB files are ZIP archives with XHTML/HTML content. This parser does not try
 * to fully automate cookbook import; it finds plausible recipe sections and
 * returns a confidence-scored review list for the user to confirm.
 */

import { unzipSync } from "fflate";

export type EpubRecipeCandidate = {
  id: string;
  title: string;
  sourcePath: string;
  confidence: number;
  checked: boolean;
  ingredients: string[];
  directions: string;
  notes: string | null;
  tags: string[];
};

type HtmlDoc = {
  path: string;
  title: string;
  headings: string[];
  lines: string[];
};

const INGREDIENT_CUES = [
  "ingredients",
  "ingredient",
  "you will need",
  "for the",
];

const DIRECTION_CUES = [
  "directions",
  "instructions",
  "method",
  "preparation",
  "steps",
];

const NON_RECIPE_TITLE = /^(contents|copyright|dedication|acknowledg|index|introduction|about|foreword|preface)$/i;

function decodeText(bytes: Uint8Array): string {
  return new TextDecoder("utf-8", { fatal: false }).decode(bytes);
}

function stripTags(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/(p|li|h[1-6]|div|section|article|tr)>/gi, "\n")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&rsquo;/g, "'")
    .replace(/&ldquo;|&rdquo;/g, '"')
    .replace(/\r/g, "\n");
}

function normaliseLines(text: string): string[] {
  return text
    .split("\n")
    .map((line) => line.replace(/\s+/g, " ").trim())
    .filter(Boolean);
}

function extractHeadings(html: string): string[] {
  const headings: string[] = [];
  const re = /<h[1-3][^>]*>([\s\S]*?)<\/h[1-3]>/gi;
  let match: RegExpExecArray | null;
  while ((match = re.exec(html))) {
    const text = normaliseLines(stripTags(match[1])).join(" ").trim();
    if (text) headings.push(text);
  }
  return headings;
}

function extractTitle(path: string, html: string): string {
  const heading = extractHeadings(html).find((h) => !NON_RECIPE_TITLE.test(h));
  if (heading) return heading;
  const titleMatch = /<title[^>]*>([\s\S]*?)<\/title>/i.exec(html);
  const title = titleMatch ? normaliseLines(stripTags(titleMatch[1])).join(" ").trim() : "";
  if (title && !NON_RECIPE_TITLE.test(title)) return title;
  return path
    .split("/")
    .pop()!
    .replace(/\.(xhtml|html?)$/i, "")
    .replace(/[-_]+/g, " ")
    .trim();
}

export function parseEpubHtmlDocuments(
  files: Record<string, string>,
  titleOverrides: Record<string, string> = {}
): EpubRecipeCandidate[] {
  const docs: HtmlDoc[] = Object.entries(files)
    .filter(([path]) => /\.(xhtml|html?)$/i.test(path))
    .map(([path, html]) => ({
      path,
      title: titleOverrides[path] || extractTitle(path, html),
      headings: extractHeadings(html),
      lines: normaliseLines(stripTags(html)),
    }))
    .filter((doc) => doc.lines.length > 0 && !NON_RECIPE_TITLE.test(doc.title));

  return docs
    .map(candidateFromDoc)
    .filter((candidate): candidate is EpubRecipeCandidate => candidate !== null);
}

function candidateFromDoc(doc: HtmlDoc): EpubRecipeCandidate | null {
  const lowerLines = doc.lines.map((line) => line.toLowerCase());
  const ingredientIndex = lowerLines.findIndex((line) =>
    INGREDIENT_CUES.some((cue) => line === cue || line.startsWith(`${cue}:`))
  );
  const directionIndex = lowerLines.findIndex((line) =>
    DIRECTION_CUES.some((cue) => line === cue || line.startsWith(`${cue}:`))
  );

  const ingredientLike = doc.lines.filter((line) => looksLikeIngredient(line)).length;
  const numberedSteps = doc.lines.filter((line) => /^\d+[).\s]/.test(line)).length;

  let confidence = 0;
  if (ingredientIndex >= 0) confidence += 45;
  if (directionIndex >= 0) confidence += 30;
  confidence += Math.min(ingredientLike * 4, 20);
  confidence += Math.min(numberedSteps * 3, 15);
  if (doc.headings.length > 0) confidence += 5;
  if (NON_RECIPE_TITLE.test(doc.title)) confidence -= 60;
  confidence = Math.max(0, Math.min(100, confidence));

  if (confidence < 10) return null;

  const ingredients = extractIngredients(doc.lines, ingredientIndex, directionIndex);
  const directions = extractDirections(doc.lines, ingredientIndex, directionIndex);
  if (ingredients.length === 0 && !directions) return null;

  return {
    id: stableId(doc.path),
    title: doc.title || "Untitled recipe",
    sourcePath: doc.path,
    confidence,
    checked: confidence >= 70,
    ingredients,
    directions,
    notes: null,
    tags: [],
  };
}

function extractIngredients(lines: string[], ingredientIndex: number, directionIndex: number): string[] {
  if (ingredientIndex >= 0) {
    const end = directionIndex > ingredientIndex ? directionIndex : lines.length;
    return lines
      .slice(ingredientIndex + 1, end)
      .filter((line) => !isSectionCue(line))
      .filter((line) => looksLikeIngredient(line) || line.endsWith(":"))
      .slice(0, 80);
  }
  return lines.filter((line) => looksLikeIngredient(line)).slice(0, 40);
}

function extractDirections(lines: string[], ingredientIndex: number, directionIndex: number): string {
  if (directionIndex >= 0) {
    return lines
      .slice(directionIndex + 1)
      .filter((line) => !isSectionCue(line))
      .join("\n")
      .trim();
  }
  const afterIngredients = ingredientIndex >= 0 ? lines.slice(ingredientIndex + 1) : lines;
  return afterIngredients
    .filter((line) => !looksLikeIngredient(line) && !isSectionCue(line))
    .slice(0, 40)
    .join("\n")
    .trim();
}

function isSectionCue(line: string): boolean {
  const lower = line.toLowerCase().replace(/:$/, "");
  return INGREDIENT_CUES.includes(lower) || DIRECTION_CUES.includes(lower);
}

function looksLikeIngredient(line: string): boolean {
  const t = line.trim();
  if (!t || t.length > 140) return false;
  if (/^\d+[).\s]/.test(t) && t.split(/\s+/).length > 8) return false;
  return /^([\d¼½¾⅓⅔⅛⅜⅝⅞]+|a few|pinch|dash|one|two|three|four|five|six|seven|eight|nine|ten)\b/i.test(t);
}

function stableId(path: string): string {
  let hash = 0;
  for (let i = 0; i < path.length; i++) hash = (hash * 31 + path.charCodeAt(i)) | 0;
  return `epub-${Math.abs(hash).toString(36)}`;
}

export function parseEpubArchive(data: Uint8Array): EpubRecipeCandidate[] {
  const entries = unzipSync(data);
  const decodedEntries: Record<string, string> = {};
  for (const [path, bytes] of Object.entries(entries)) {
    if (/\.(xhtml|html?|opf|ncx)$/i.test(path)) decodedEntries[path] = decodeText(bytes);
  }

  const htmlFiles = Object.fromEntries(
    Object.entries(decodedEntries).filter(([path]) => /\.(xhtml|html?)$/i.test(path))
  );
  const spinePaths = extractSpinePaths(decodedEntries);
  const titleOverrides = extractNavigationTitles(decodedEntries);

  if (spinePaths.length === 0) return parseEpubHtmlDocuments(htmlFiles, titleOverrides);

  const orderedFiles: Record<string, string> = {};
  for (const path of spinePaths) {
    if (htmlFiles[path]) orderedFiles[path] = htmlFiles[path];
  }
  for (const [path, html] of Object.entries(htmlFiles)) {
    if (!orderedFiles[path]) orderedFiles[path] = html;
  }
  return parseEpubHtmlDocuments(orderedFiles, titleOverrides);
}

function extractSpinePaths(entries: Record<string, string>): string[] {
  const opfEntry = Object.entries(entries).find(([path]) => path.endsWith(".opf"));
  if (!opfEntry) return [];

  const [opfPath, opf] = opfEntry;
  const baseDir = opfPath.includes("/") ? opfPath.slice(0, opfPath.lastIndexOf("/") + 1) : "";
  const manifest = new Map<string, string>();
  const itemRe = /<item\b[^>]*\bid=["']([^"']+)["'][^>]*\bhref=["']([^"']+)["'][^>]*>/gi;
  let itemMatch: RegExpExecArray | null;
  while ((itemMatch = itemRe.exec(opf))) {
    manifest.set(itemMatch[1], normalisePath(baseDir + itemMatch[2]));
  }

  const paths: string[] = [];
  const spineRe = /<itemref\b[^>]*\bidref=["']([^"']+)["'][^>]*>/gi;
  let spineMatch: RegExpExecArray | null;
  while ((spineMatch = spineRe.exec(opf))) {
    const path = manifest.get(spineMatch[1]);
    if (path && /\.(xhtml|html?)$/i.test(path)) paths.push(path);
  }
  return paths;
}

function extractNavigationTitles(entries: Record<string, string>): Record<string, string> {
  const titles: Record<string, string> = {};
  for (const [path, text] of Object.entries(entries)) {
    const baseDir = path.includes("/") ? path.slice(0, path.lastIndexOf("/") + 1) : "";
    if (path.endsWith(".ncx")) {
      const pointRe = /<navPoint[\s\S]*?<navLabel[\s\S]*?<text[^>]*>([\s\S]*?)<\/text>[\s\S]*?<content[^>]*\bsrc=["']([^"']+)["'][^>]*>/gi;
      let match: RegExpExecArray | null;
      while ((match = pointRe.exec(text))) {
        titles[normalisePath(baseDir + stripFragment(match[2]))] = normaliseLines(stripTags(match[1])).join(" ");
      }
    }
    if (/\.(xhtml|html?)$/i.test(path) && /<nav\b/i.test(text)) {
      const linkRe = /<a[^>]*\bhref=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi;
      let match: RegExpExecArray | null;
      while ((match = linkRe.exec(text))) {
        const title = normaliseLines(stripTags(match[2])).join(" ");
        if (title) titles[normalisePath(baseDir + stripFragment(match[1]))] = title;
      }
    }
  }
  return titles;
}

function stripFragment(path: string): string {
  return path.split("#")[0];
}

function normalisePath(path: string): string {
  const parts: string[] = [];
  for (const part of path.split("/")) {
    if (!part || part === ".") continue;
    if (part === "..") parts.pop();
    else parts.push(part);
  }
  return parts.join("/");
}
