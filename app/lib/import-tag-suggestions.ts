export interface ImportTagInput {
  title: string;
  description?: string | null;
  ingredients?: string[];
  directions?: string | null;
  notes?: string | null;
  sourceTags?: string[];
  existingTags: string[];
  limit?: number;
}

const MIN_TOKEN_LENGTH = 3;

function cleanTag(tag: string): string {
  return tag.trim().replace(/\s+/g, " ");
}

function normalizeTag(tag: string): string {
  return cleanTag(tag).toLowerCase();
}

function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .map((token) => token.trim())
    .filter((token) => token.length >= MIN_TOKEN_LENGTH);
}

function containsPhrase(haystack: string, tag: string): boolean {
  const escaped = normalizeTag(tag).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  if (!escaped) return false;
  return new RegExp(`(^|[^a-z0-9])${escaped}([^a-z0-9]|$)`, "i").test(haystack);
}

function uniqueCleanTags(tags: string[]): string[] {
  const seen = new Set<string>();
  const cleaned: string[] = [];

  for (const raw of tags) {
    const tag = cleanTag(raw);
    const key = normalizeTag(tag);
    if (!tag || seen.has(key)) continue;
    seen.add(key);
    cleaned.push(tag);
  }

  return cleaned;
}

/**
 * Suggest tags from the user's existing vocabulary for a parsed import.
 *
 * This intentionally does not invent new tag names. It scores exact phrase
 * matches and all-token matches against title, description, ingredients,
 * directions, and notes, then returns matching existing tags in rank order.
 */
export function suggestImportTags(input: ImportTagInput): string[] {
  const existingTags = uniqueCleanTags(input.existingTags);
  if (existingTags.length === 0) return [];

  const title = input.title ?? "";
  const body = [
    input.description,
    ...(input.ingredients ?? []),
    input.directions,
    input.notes,
  ]
    .filter(Boolean)
    .join(" ");
  const allText = `${title} ${body}`.toLowerCase();
  const titleText = title.toLowerCase();
  const allTokens = new Set(tokenize(allText));
  const titleTokens = new Set(tokenize(titleText));
  const sourceTagKeys = new Set((input.sourceTags ?? []).map(normalizeTag));

  const scored = existingTags
    .map((tag) => {
      const tagKey = normalizeTag(tag);
      const tagTokens = tokenize(tag);
      if (tagTokens.length === 0) return null;

      let score = 0;
      if (containsPhrase(titleText, tag)) score += 100;
      else if (containsPhrase(allText, tag)) score += 70;

      const matchedTokens = tagTokens.filter((token) => allTokens.has(token));
      if (matchedTokens.length === tagTokens.length) score += 45 + matchedTokens.length * 5;

      const titleMatches = tagTokens.filter((token) => titleTokens.has(token));
      score += titleMatches.length * 15;

      if (sourceTagKeys.has(tagKey)) score += 80;
      if (score < 55) return null;

      return { tag, score };
    })
    .filter((item): item is { tag: string; score: number } => item !== null)
    .sort((a, b) => b.score - a.score || a.tag.localeCompare(b.tag));

  return scored.slice(0, input.limit ?? 8).map((item) => item.tag);
}

/**
 * Merge tags extracted by an importer with existing-vocabulary suggestions.
 * Source tags win first, but their casing is mapped to the existing tag name
 * when a same-name tag already exists.
 */
export function buildImportTagNames(input: ImportTagInput): string[] {
  const existingTags = uniqueCleanTags(input.existingTags);
  const existingByKey = new Map(existingTags.map((tag) => [normalizeTag(tag), tag]));
  const selected: string[] = [];
  const selectedKeys = new Set<string>();

  function add(tag: string) {
    const cleaned = cleanTag(tag);
    const key = normalizeTag(cleaned);
    if (!cleaned || selectedKeys.has(key)) return;
    selectedKeys.add(key);
    selected.push(existingByKey.get(key) ?? cleaned);
  }

  for (const tag of input.sourceTags ?? []) add(tag);
  for (const tag of suggestImportTags(input)) add(tag);

  return selected.slice(0, input.limit ?? 20);
}
