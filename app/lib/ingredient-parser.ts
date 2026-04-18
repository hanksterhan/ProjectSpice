/**
 * Ingredient string parser subsystem for ProjectSpice.
 *
 * Pipeline order (must be preserved):
 *  1. Group header detection
 *  2. Weight-in-parens extraction
 *  3. Footnote marker stripping
 *  4. Unicode fraction normalization
 *  5. Broken ASCII fraction fix
 *  6. Quantity / unit / name extraction
 *  7. Unit canonicalization
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface ParsedIngredient {
  quantity_raw: string;
  quantity_decimal: number | null;
  unit_raw: string;
  unit_canonical: string | null;
  name: string;
  notes: string | null;
  weight_g: number | null;
  footnote_ref: string | null;
  is_group_header: boolean;
}

// ---------------------------------------------------------------------------
// Unicode fraction table
// ---------------------------------------------------------------------------

const UNICODE_FRACTIONS: ReadonlyMap<string, number> = new Map([
  ["½", 0.5],
  ["¼", 0.25],
  ["¾", 0.75],
  ["⅓", 1 / 3],
  ["⅔", 2 / 3],
  ["⅛", 0.125],
  ["⅜", 0.375],
  ["⅝", 0.625],
  ["⅞", 0.875],
  ["⅕", 0.2],
  ["⅖", 0.4],
  ["⅗", 0.6],
  ["⅘", 0.8],
  ["⅙", 1 / 6],
  ["⅚", 5 / 6],
]);

const UNICODE_FRACTION_PATTERN = /[½¼¾⅓⅔⅛⅜⅝⅞⅕⅖⅗⅘⅙⅚]/;

// ---------------------------------------------------------------------------
// Step 1: Group header detection regex
// ---------------------------------------------------------------------------

/** Characters that may appear in a quantity token (digit, fraction chars, space, dash, slash, dot) */
const QUANTITY_CHARS_RE = /^[\d⅛¼⅓⅜½⅝⅔¾⅞ \-\/\.]+$/;

// ---------------------------------------------------------------------------
// Step 2: Weight-in-parens patterns
// ---------------------------------------------------------------------------

/**
 * Matches parenthesised weight expressions, e.g.:
 *   (6.1 oz / 173g)   (14.5 oz)   (411g)   (1 lb)   (250g)   (1 oz)
 *
 * Capture groups:
 *   1 – optional "oz" amount
 *   2 – optional "g" amount
 *   3 – optional "kg" amount
 *   4 – optional "lb" amount
 */
const WEIGHT_PARENS_RE =
  /\(\s*(?:(\d+(?:\.\d+)?)\s*oz\s*(?:\/\s*)?)?(?:(\d+(?:\.\d+)?)\s*g\b)?(?:\s*(?:\/\s*)?(\d+(?:\.\d+)?)\s*kg)?\s*\)/gi;

// Separate simpler pattern to also capture lb-only and standalone oz-only cleanly
const WEIGHT_PARENS_FULL_RE =
  /\(\s*(?:(\d+(?:\.\d+)?)\s*oz(?:\s*\/\s*(\d+(?:\.\d+)?)\s*g)?)?\s*\)|(\((\d+(?:\.\d+)?)\s*g\))|(\((\d+(?:\.\d+)?)\s*kg\))|(\((\d+(?:\.\d+)?)\s*lb\))/gi;

// Consolidated weight extractor using a single regex
const WEIGHT_PARENS_COMBINED_RE =
  /\(\s*(?:(?:(\d+(?:\.\d+)?)\s*oz)(?:\s*\/\s*(\d+(?:\.\d+)?)\s*g)?|(?:(\d+(?:\.\d+)?)\s*g\b)|(?:(\d+(?:\.\d+)?)\s*kg\b)|(?:(\d+(?:\.\d+)?)\s*lb\b))\s*\)/gi;

function extractWeightInParens(text: string): {
  cleaned: string;
  weight_g: number | null;
} {
  let weight_g: number | null = null;
  let cleaned = text;

  // We'll scan all parenthesised substrings and pick the first that matches a weight pattern
  // Pattern: ( [number unit] [/ number unit]? ) where unit ∈ {oz, g, kg, lb}
  const WEIGHT_BLOCK_RE =
    /\(\s*([\d.]+)\s*(oz|g|kg|lb)(?:\s*\/\s*([\d.]+)\s*(oz|g|kg|lb))?\s*\)/gi;

  const matches = [...text.matchAll(WEIGHT_BLOCK_RE)];

  for (const m of matches) {
    const val1 = parseFloat(m[1]);
    const unit1 = m[2].toLowerCase();
    const val2 = m[3] !== undefined ? parseFloat(m[3]) : undefined;
    const unit2 = m[4] !== undefined ? m[4].toLowerCase() : undefined;

    let grams: number | null = null;

    if (val2 !== undefined && unit2 !== undefined) {
      // Dual value — prefer g, then kg, then oz, then lb for the "g" side
      if (unit2 === "g") grams = val2;
      else if (unit2 === "kg") grams = val2 * 1000;
      else if (unit1 === "g") grams = val1;
      else if (unit1 === "kg") grams = val1 * 1000;
      else if (unit1 === "oz") grams = val1 * 28.3495;
      else if (unit2 === "oz") grams = val2 * 28.3495;
      else if (unit1 === "lb") grams = val1 * 453.592;
      else if (unit2 === "lb") grams = val2 * 453.592;
    } else {
      if (unit1 === "g") grams = val1;
      else if (unit1 === "kg") grams = val1 * 1000;
      else if (unit1 === "oz") grams = val1 * 28.3495;
      else if (unit1 === "lb") grams = val1 * 453.592;
    }

    if (grams !== null) {
      weight_g = grams;
      cleaned = cleaned.replace(m[0], "").trim();
      break; // Use first weight found
    }
  }

  return { cleaned, weight_g };
}

// ---------------------------------------------------------------------------
// Step 3: Footnote marker stripping
// ---------------------------------------------------------------------------

const FOOTNOTE_CHARS_RE = /[①②③④⑤⑥⑦⑧⑨⑩]/g;

function extractFootnotes(text: string): {
  cleaned: string;
  footnote_ref: string | null;
} {
  const found = text.match(FOOTNOTE_CHARS_RE);
  const footnote_ref = found ? found.join("") : null;
  const cleaned = text.replace(FOOTNOTE_CHARS_RE, "").trim();
  return { cleaned, footnote_ref };
}

// ---------------------------------------------------------------------------
// Step 4: Unicode fraction normalization (exported helper)
// ---------------------------------------------------------------------------

export function normalizeUnicodeFractions(text: string): string {
  let result = text;

  for (const [char, value] of UNICODE_FRACTIONS) {
    // Match: optional leading integer immediately followed by fraction char
    // e.g. "1½" → "1.5", "½" → "0.5"
    const re = new RegExp(`(\\d+)?${escapeRegex(char)}`, "g");
    result = result.replace(re, (_, intPart: string | undefined) => {
      const intVal = intPart !== undefined ? parseInt(intPart, 10) : 0;
      const total = intVal + value;
      // Round to 6 significant decimal places to avoid floating point noise
      return String(Math.round(total * 1_000_000) / 1_000_000);
    });
  }

  return result;
}

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

// ---------------------------------------------------------------------------
// Step 5: Broken ASCII fraction fix (exported helper)
// ---------------------------------------------------------------------------

/**
 * Standard fraction denominators that Paprika's broken export produces.
 * When we see a token like "11/2" we split it into "1 1/2".
 */
const STANDARD_FRACTIONS = new Set([
  "1/2",
  "1/3",
  "2/3",
  "1/4",
  "3/4",
  "1/8",
  "3/8",
  "5/8",
  "7/8",
]);

export function fixBrokenAsciiFractions(text: string): string {
  // Split on whitespace, process each token
  const tokens = text.split(/(\s+)/);
  return tokens
    .map((token) => {
      // Only process tokens that look like \d\d/\d  (exactly 2-digit numerator + slash + 1+ digit denominator)
      if (!/^\d{2,}\/\d+$/.test(token)) return token;

      const slashIdx = token.indexOf("/");
      const numStr = token.slice(0, slashIdx);
      const denStr = token.slice(slashIdx + 1);

      // Try splitting the numerator at each position to find a valid standard fraction
      for (let splitAt = 1; splitAt < numStr.length; splitAt++) {
        const wholePart = numStr.slice(0, splitAt);
        const fracNum = numStr.slice(splitAt);
        const candidate = `${fracNum}/${denStr}`;
        if (STANDARD_FRACTIONS.has(candidate)) {
          return `${wholePart} ${candidate}`;
        }
      }

      return token; // No fix found, leave unchanged
    })
    .join("");
}

// ---------------------------------------------------------------------------
// Step 6: Core quantity/unit/name extraction
// ---------------------------------------------------------------------------

/**
 * Unit lexicon: maps every alias to its canonical key.
 */
const UNIT_LEXICON: ReadonlyMap<string, string> = new Map([
  ["tsp", "tsp"],
  ["teaspoon", "tsp"],
  ["teaspoons", "tsp"],
  ["tbsp", "tbsp"],
  ["tablespoon", "tbsp"],
  ["tablespoons", "tbsp"],
  ["tbs", "tbsp"],
  ["cup", "cup"],
  ["cups", "cup"],
  ["c", "cup"],
  ["ml", "ml"],
  ["milliliter", "ml"],
  ["milliliters", "ml"],
  ["millilitre", "ml"],
  ["millilitres", "ml"],
  ["l", "l"],
  ["liter", "l"],
  ["liters", "l"],
  ["litre", "l"],
  ["litres", "l"],
  ["oz", "oz"],
  ["ounce", "oz"],
  ["ounces", "oz"],
  ["lb", "lb"],
  ["lbs", "lb"],
  ["pound", "lb"],
  ["pounds", "lb"],
  ["g", "g"],
  ["gram", "g"],
  ["grams", "g"],
  ["kg", "kg"],
  ["kilogram", "kg"],
  ["kilograms", "kg"],
  ["fl oz", "fl_oz"],
  ["fluid ounce", "fl_oz"],
  ["fluid ounces", "fl_oz"],
  ["pint", "pint"],
  ["pints", "pint"],
  ["pt", "pint"],
  ["quart", "quart"],
  ["quarts", "quart"],
  ["qt", "quart"],
  ["piece", "count"],
  ["pieces", "count"],
  ["slice", "count"],
  ["slices", "count"],
  ["clove", "count"],
  ["cloves", "count"],
  ["sprig", "count"],
  ["sprigs", "count"],
  ["can", "can"],
  ["cans", "can"],
  ["package", "package"],
  ["packages", "package"],
  ["pkg", "package"],
  ["bunch", "bunch"],
  ["bunches", "bunch"],
  ["pinch", "pinch"],
  ["pinches", "pinch"],
  ["dash", "dash"],
  ["dashes", "dash"],
  ["handful", "handful"],
  ["handfuls", "handful"],
]);

function canonicalizeUnit(unit: string): string | null {
  if (!unit) return null;
  const lower = unit.toLowerCase().trim();
  return UNIT_LEXICON.get(lower) ?? null;
}

/**
 * Internal ingredient line parser.
 *
 * Parses a normalized (post-steps-2-5) ingredient text into its components.
 * This replaces the external `ingredient-parser-js` dependency.
 */
interface RawParsed {
  quantity: string;
  unit: string;
  name: string;
  notes: string | null;
}

// All known unit aliases joined as alternation, sorted longest-first to avoid short matches swallowing long ones
const ALL_UNITS = [...UNIT_LEXICON.keys()]
  .sort((a, b) => b.length - a.length)
  .map(escapeRegex)
  .join("|");

const UNIT_RE = new RegExp(`^(${ALL_UNITS})(?=\\s|$|,)`, "i");

/**
 * Quantity pattern: integer, decimal, fraction, or mixed.
 * Handles:
 *   - "1 1/2"         mixed number with slash fraction
 *   - "1 0.5"         integer + space-separated decimal (from "1 ½" after normalization)
 *   - "0.5"           pure decimal
 *   - "1/2"           pure fraction
 *   - "1"             plain integer
 */
const QTY_RE =
  /^(\d+(?:\.\d+)?(?:\s+\d+\/\d+|\s+0\.\d+)?|\d+\/\d+)/;

function parseIngredientText(text: string): RawParsed {
  let remaining = text.trim();

  // Extract quantity
  let quantity = "";
  const qtyMatch = remaining.match(QTY_RE);
  if (qtyMatch) {
    quantity = qtyMatch[1].trim();
    remaining = remaining.slice(qtyMatch[0].length).trim();
  }

  // Extract unit
  let unit = "";
  const unitMatch = remaining.match(UNIT_RE);
  if (unitMatch) {
    unit = unitMatch[1];
    remaining = remaining.slice(unitMatch[0].length).trim();
  }

  // Extract parenthetical notes from the remaining name
  let notes: string | null = null;
  const notesMatch = remaining.match(/,?\s*\(([^)]+)\)\s*$/);
  if (notesMatch) {
    notes = notesMatch[1];
    remaining = remaining.slice(0, remaining.length - notesMatch[0].length).trim();
  }

  // Also capture comma-separated qualifiers as notes (e.g. "softened", "minced")
  // Only if there's a comma after a reasonable name length
  // We skip this to keep the name intact as many tests expect the comma-separated part in name.

  const name = remaining.replace(/\s+/g, " ").trim();

  return { quantity, unit, name, notes };
}

function parseQuantityDecimal(quantity: string): number | null {
  if (!quantity) return null;
  const trimmed = quantity.trim();
  if (!trimmed) return null;

  // Try direct float parse
  const direct = parseFloat(trimmed);
  if (!isNaN(direct) && !trimmed.includes("/") && !trimmed.includes(" ")) {
    return direct;
  }

  // Mixed number with fraction: "1 1/2"
  const mixedMatch = trimmed.match(/^(\d+(?:\.\d+)?)\s+(\d+)\/(\d+)$/);
  if (mixedMatch) {
    const whole = parseFloat(mixedMatch[1]);
    const num = parseInt(mixedMatch[2], 10);
    const den = parseInt(mixedMatch[3], 10);
    return den !== 0 ? whole + num / den : null;
  }

  // Integer + space-separated decimal: "1 0.5" (produced by normalizing "1 ½")
  const intDecimalMatch = trimmed.match(/^(\d+)\s+(0\.\d+)$/);
  if (intDecimalMatch) {
    return parseInt(intDecimalMatch[1], 10) + parseFloat(intDecimalMatch[2]);
  }

  // Simple fraction: "1/2"
  const fracMatch = trimmed.match(/^(\d+)\/(\d+)$/);
  if (fracMatch) {
    const num = parseInt(fracMatch[1], 10);
    const den = parseInt(fracMatch[2], 10);
    return den !== 0 ? num / den : null;
  }

  // Already a decimal string (from unicode normalization)
  const asNum = Number(trimmed);
  return isNaN(asNum) ? null : asNum;
}

// ---------------------------------------------------------------------------
// Main export: parseIngredientLine
// ---------------------------------------------------------------------------

export function parseIngredientLine(
  text: string,
  strongToken: string | null
): ParsedIngredient {
  // EMPTY
  const EMPTY: ParsedIngredient = {
    quantity_raw: "",
    quantity_decimal: null,
    unit_raw: "",
    unit_canonical: null,
    name: "",
    notes: null,
    weight_g: null,
    footnote_ref: null,
    is_group_header: false,
  };

  // -------------------------------------------------------------------------
  // Step 1: Group header detection
  // -------------------------------------------------------------------------
  if (strongToken !== null) {
    const trimmedToken = strongToken.trim();
    if (!QUANTITY_CHARS_RE.test(trimmedToken)) {
      return {
        ...EMPTY,
        is_group_header: true,
        name: trimmedToken,
      };
    }
    // It's a quantity token — fall through to parse the full text line
  }

  let working = text;

  // -------------------------------------------------------------------------
  // Step 2: Weight-in-parens extraction
  // -------------------------------------------------------------------------
  const { cleaned: afterWeight, weight_g } = extractWeightInParens(working);
  working = afterWeight;

  // -------------------------------------------------------------------------
  // Step 3: Footnote marker stripping
  // -------------------------------------------------------------------------
  const { cleaned: afterFootnotes, footnote_ref } = extractFootnotes(working);
  working = afterFootnotes;

  // -------------------------------------------------------------------------
  // Step 4: Unicode fraction normalization
  // -------------------------------------------------------------------------
  working = normalizeUnicodeFractions(working);

  // -------------------------------------------------------------------------
  // Step 5: Broken ASCII fraction fix
  // -------------------------------------------------------------------------
  working = fixBrokenAsciiFractions(working);

  // -------------------------------------------------------------------------
  // Step 6: Parse quantity / unit / name
  // -------------------------------------------------------------------------
  const raw = parseIngredientText(working);

  // -------------------------------------------------------------------------
  // Step 7: Unit canonicalization
  // -------------------------------------------------------------------------
  const unit_canonical = canonicalizeUnit(raw.unit);

  const quantity_decimal = parseQuantityDecimal(raw.quantity);

  return {
    quantity_raw: raw.quantity,
    quantity_decimal,
    unit_raw: raw.unit,
    unit_canonical,
    name: raw.name,
    notes: raw.notes,
    weight_g,
    footnote_ref,
    is_group_header: false,
  };
}
