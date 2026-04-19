/**
 * GPT recipe parser for ProjectSpice.
 *
 * Parses PROJECTSPICE_RECIPE_V1 template output from ChatGPT or other LLMs.
 * Also handles structurally-conforming recipe text without the marker.
 */

import { parseDuration } from "~/lib/time-parser";

export interface GptParseResult {
  title: string;
  servings: number | null;
  servingsUnit: string | null;
  prepTimeMin: number | null;
  cookTimeMin: number | null;
  tags: string[];
  sourceUrl: string | null;
  ingredients: string[];   // raw lines for parseIngredientLine
  directions: string;      // full directions text
  notes: string | null;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

/**
 * Extract the value of a bold-label metadata field.
 * Matches: **Servings:** 4  OR  **Servings:** 4 servings (forgiving of whitespace)
 */
function extractBoldField(text: string, fieldName: string): string | null {
  // Allow optional whitespace around the colon and between ** markers
  const re = new RegExp(
    `\\*\\*\\s*${fieldName}\\s*:\\s*\\*\\*\\s*(.+?)\\s*$`,
    "im"
  );
  const m = re.exec(text);
  return m ? m[1].trim() : null;
}

/**
 * Split text into named sections by splitting on `## Heading` lines.
 * Returns a map of lowercased section name → body text.
 */
function parseSections(text: string): Map<string, string> {
  const sectionMap = new Map<string, string>();
  // Split at every `## ` heading at start of line
  const parts = text.split(/^(?=## )/m);
  for (const part of parts) {
    const headingMatch = /^## +(.+?)\s*$/m.exec(part);
    if (!headingMatch) continue;
    const name = headingMatch[1].trim().toLowerCase().replace(/\s*\(optional\)\s*$/, "");
    // Body is everything after the heading line
    const afterHeading = part.slice(headingMatch[0].length).trim();
    sectionMap.set(name, afterHeading);
  }
  return sectionMap;
}

/**
 * Parse servings string: "4" → {servings: 4, servingsUnit: null}
 * "4 servings" → {servings: 4, servingsUnit: "servings"}
 */
function parseServingsField(raw: string): { servings: number | null; servingsUnit: string | null } {
  const trimmed = raw.trim();
  const m = /^(\d+(?:\.\d+)?)\s*(.*)$/.exec(trimmed);
  if (!m) return { servings: null, servingsUnit: null };
  const num = parseFloat(m[1]);
  const unit = m[2].trim() || null;
  return { servings: isNaN(num) ? null : num, servingsUnit: unit };
}

// ─── Main Parser ─────────────────────────────────────────────────────────────

/**
 * Parse a GPT-generated recipe text.
 *
 * Returns null only if PROJECTSPICE_RECIPE_V1 marker is NOT found AND
 * title + ingredients + directions sections are all absent.
 */
export function parseGptRecipe(text: string): GptParseResult | null {
  if (!text?.trim()) return null;

  // Check for the V1 marker (flexible — look anywhere in text)
  const hasMarker = /PROJECTSPICE_RECIPE_V1/i.test(text);

  // Extract H1 title
  const titleMatch = /^#\s+(.+?)$/m.exec(text);
  const title = titleMatch ? titleMatch[1].trim() : null;

  // Parse sections up front (used for null check and data extraction)
  const sections = parseSections(text);
  const ingredientsBody = sections.get("ingredients") ?? null;
  const directionsBody = sections.get("directions") ?? null;
  const notesBody = sections.get("notes") ?? null;

  // Reject if marker missing AND all structural elements are absent
  if (!hasMarker && !title && !ingredientsBody && !directionsBody) {
    return null;
  }

  // ── Metadata fields ─────────────────────────────────────────────────────
  const servingsRaw = extractBoldField(text, "Servings");
  const { servings, servingsUnit } = servingsRaw
    ? parseServingsField(servingsRaw)
    : { servings: null, servingsUnit: null };

  const prepTimeRaw = extractBoldField(text, "Prep\\s+Time");
  const prepTimeMin = prepTimeRaw ? (parseDuration(prepTimeRaw) ?? null) : null;

  const cookTimeRaw = extractBoldField(text, "Cook\\s+Time");
  const cookTimeMin = cookTimeRaw ? (parseDuration(cookTimeRaw) ?? null) : null;

  const tagsRaw = extractBoldField(text, "Tags");
  const tags: string[] = tagsRaw
    ? tagsRaw
        .split(",")
        .map((t) => t.trim())
        .filter((t) => t && t.toLowerCase() !== "none")
    : [];

  const sourceRaw = extractBoldField(text, "Source");
  const sourceUrl =
    sourceRaw && sourceRaw.toLowerCase() !== "original" && sourceRaw !== ""
      ? sourceRaw
      : null;

  // ── Ingredients ─────────────────────────────────────────────────────────
  const ingredients: string[] = [];
  if (ingredientsBody) {
    for (const line of ingredientsBody.split("\n")) {
      const trimmed = line.trim();
      if (/^[-*]\s+/.test(trimmed)) {
        // Strip leading "- " or "* "
        ingredients.push(trimmed.replace(/^[-*]\s+/, "").trim());
      } else if (trimmed) {
        // Non-bullet, non-empty lines (section headers / group lines) — pass through
        ingredients.push(trimmed);
      }
    }
  }

  // ── Directions ──────────────────────────────────────────────────────────
  const directions = directionsBody ?? "";

  // ── Notes ───────────────────────────────────────────────────────────────
  const notes = notesBody && notesBody.trim() ? notesBody.trim() : null;

  return {
    title: title ?? "",
    servings,
    servingsUnit,
    prepTimeMin,
    cookTimeMin,
    tags,
    sourceUrl,
    ingredients,
    directions,
    notes,
  };
}
