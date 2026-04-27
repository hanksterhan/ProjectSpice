/**
 * Inline ingredient mapping for recipe directions.
 *
 * Builds a term index from an ingredient list, then greedy-matches ingredient
 * names against each direction step. Disabled in cooking mode per spec.
 */

export interface MappableIngredient {
  id: string;
  name: string;
  quantityRaw: string | null;
  quantityDecimal: number | null;
  unitRaw: string | null;
  notes: string | null;
  weightG: number | null;
  isGroupHeader: boolean;
}

export interface IngredientSpan {
  /** Character index where the match starts */
  start: number;
  /** Character index where the match ends (exclusive) */
  end: number;
  /** The matched substring as it appears in the direction text */
  text: string;
  /** The ingredient this span refers to */
  ingredientId: string;
  /** Display label for the popover */
  label: string;
}

// Normalise for comparison: lowercase, collapse whitespace, strip punctuation
function normalise(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9\s]/g, " ").replace(/\s+/g, " ").trim();
}

// Stopwords that should never match alone
const STOPWORDS = new Set([
  "a", "an", "the", "and", "or", "of", "with", "to", "in", "for", "on",
  "at", "by", "from", "into", "fresh", "large", "small", "medium", "dry",
  "dried", "ground", "whole", "chopped", "sliced", "diced", "minced",
]);

interface TermEntry {
  ingredientId: string;
  label: string;
  /** Normalised term string */
  term: string;
  /** Number of tokens — longer terms get priority */
  tokenCount: number;
}

/**
 * Build a sorted term index from a list of ingredients.
 * Longer terms sort first so the greedy scan picks the longest match.
 */
export function buildTermIndex(ingredients: MappableIngredient[]): TermEntry[] {
  const entries: TermEntry[] = [];

  for (const ing of ingredients) {
    if (ing.isGroupHeader) continue;

    const label = buildLabel(ing);

    // Primary: full name
    const normName = normalise(ing.name);
    if (normName && !STOPWORDS.has(normName)) {
      entries.push({
        ingredientId: ing.id,
        label,
        term: normName,
        tokenCount: normName.split(" ").length,
      });
    }

    // Also index the name without parenthetical notes ("chicken (bone-in)" → "chicken")
    const stripped = normalise(ing.name.replace(/\s*\([^)]*\)/g, ""));
    if (stripped && stripped !== normName && !STOPWORDS.has(stripped)) {
      entries.push({
        ingredientId: ing.id,
        label,
        term: stripped,
        tokenCount: stripped.split(" ").length,
      });
    }
  }

  // Longest match first — greedy scan relies on this ordering
  entries.sort((a, b) => b.tokenCount - a.tokenCount || b.term.length - a.term.length);

  // Deduplicate: keep first occurrence of each (term, ingredientId) pair
  const seen = new Set<string>();
  return entries.filter((e) => {
    const key = `${e.ingredientId}::${e.term}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function buildLabel(ing: MappableIngredient): string {
  const parts: string[] = [];
  if (ing.quantityRaw) parts.push(ing.quantityRaw);
  if (ing.unitRaw) parts.push(ing.unitRaw);
  parts.push(ing.name);
  if (ing.notes) parts.push(`(${ing.notes})`);
  if (ing.weightG) parts.push(`(${ing.weightG}g)`);
  return parts.join(" ");
}

/**
 * Annotate a single direction step with ingredient spans.
 *
 * Uses a greedy left-to-right scan: at each position, tries all terms in
 * longest-first order. Overlapping spans are never emitted.
 */
export function annotateStep(
  step: string,
  termIndex: TermEntry[]
): IngredientSpan[] {
  if (!step || termIndex.length === 0) return [];

  // Build parallel arrays: normChars[i] and origOffset[i].
  // normalise() can collapse whitespace runs, changing lengths; we need a
  // mapping from every normalised position back to the original string offset.
  const normChars: string[] = [];
  const origOffset: number[] = []; // origOffset[normIdx] = original char index

  let origIdx = 0;
  while (origIdx < step.length) {
    const ch = step[origIdx];
    const normCh = ch.toLowerCase().replace(/[^a-z0-9\s]/, " ");
    // Skip if this would be a redundant space (collapse runs)
    if (normCh === " " && normChars.length > 0 && normChars[normChars.length - 1] === " ") {
      origIdx++;
      continue;
    }
    normChars.push(normCh);
    origOffset.push(origIdx);
    origIdx++;
  }
  // Trim trailing space from normalised view
  while (normChars.length > 0 && normChars[normChars.length - 1] === " ") {
    normChars.pop();
    origOffset.pop();
  }
  const normStep = normChars.join("");

  const spans: IngredientSpan[] = [];
  const consumed = new Uint8Array(normStep.length);

  let pos = 0;
  while (pos < normStep.length) {
    if (consumed[pos]) {
      pos++;
      continue;
    }

    let matched = false;
    for (const entry of termIndex) {
      const { term } = entry;
      if (pos + term.length > normStep.length) continue;

      const candidate = normStep.slice(pos, pos + term.length);
      if (candidate !== term) continue;

      // Require word-boundary on both sides
      const before = pos === 0 || /\W/.test(normStep[pos - 1]);
      const after =
        pos + term.length === normStep.length ||
        /\W/.test(normStep[pos + term.length]);
      if (!before || !after) continue;

      let alreadyUsed = false;
      for (let k = pos; k < pos + term.length; k++) {
        if (consumed[k]) { alreadyUsed = true; break; }
      }
      if (alreadyUsed) continue;

      // Map normalised positions back to original string offsets
      const origStart = origOffset[pos];
      const normEnd = pos + term.length - 1;
      const origEnd = origOffset[normEnd] + 1; // exclusive

      spans.push({
        start: origStart,
        end: origEnd,
        text: step.slice(origStart, origEnd),
        ingredientId: entry.ingredientId,
        label: entry.label,
      });

      for (let k = pos; k < pos + term.length; k++) consumed[k] = 1;
      pos += term.length;
      matched = true;
      break;
    }

    if (!matched) pos++;
  }

  return spans.sort((a, b) => a.start - b.start);
}

/**
 * Render a direction step as an array of text-or-span segments.
 * Suitable for React rendering via `.map()`.
 */
export type Segment =
  | { kind: "text"; text: string }
  | { kind: "span"; text: string; ingredientId: string; label: string };

export function segmentStep(step: string, termIndex: TermEntry[]): Segment[] {
  const spans = annotateStep(step, termIndex);
  if (spans.length === 0) return [{ kind: "text", text: step }];

  const segments: Segment[] = [];
  let cursor = 0;
  for (const span of spans) {
    if (span.start > cursor) {
      segments.push({ kind: "text", text: step.slice(cursor, span.start) });
    }
    segments.push({
      kind: "span",
      text: span.text,
      ingredientId: span.ingredientId,
      label: span.label,
    });
    cursor = span.end;
  }
  if (cursor < step.length) {
    segments.push({ kind: "text", text: step.slice(cursor) });
  }
  return segments;
}
