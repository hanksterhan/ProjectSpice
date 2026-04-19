/**
 * Time string parser for ProjectSpice.
 *
 * Handles 12 observed formats from Paprika exports and URL scrapers.
 * Pipeline:
 *  1. Strip `undefined` JS-leak prefix (~18% of Paprika cookbook-sourced recipes)
 *  2. Extract labeled fields (Active Time / Total Time / Prep / Cook)
 *  3. Detect "duration + narrative" (e.g. "1 hour + overnight to marinate")
 *  4. Detect day-scale strings → time_notes
 *  5. Parse simple single duration
 *  6. Fallback → time_notes
 *
 * Output maps to: recipes.prep_time_min, active_time_min, total_time_min, time_notes
 */

export interface ParsedTime {
  prep_min: number | null;
  active_min: number | null;
  total_min: number | null;
  time_notes: string | null;
}

// Strings containing these units are too large for numeric fields; go to time_notes.
const DAY_SCALE_RE =
  /\b(?:d|day|days|wk|week|weeks|mo|month|months|yr|year|years|overnight)\b/i;

// Strip the `undefined` JS-leak prefix present in ~18% of Paprika cookbook-sourced recipes.
function stripUndefinedPrefix(s: string): string {
  return s.replace(/^undefined\s*/i, "").trim();
}

/**
 * Parse a single duration string (e.g. "1 hr 30 min", "1:30", "45 minutes",
 * "PT2H30M") into total minutes. Returns null for day-scale or unrecognizable input.
 */
export function parseDuration(s: string): number | null {
  s = s.trim();
  if (!s) return null;
  if (DAY_SCALE_RE.test(s)) return null;

  // ISO 8601 duration: PT45M, PT2H30M, P1DT2H (day component → null)
  if (/^P/i.test(s)) {
    const iso = /^P(?:(\d+)D)?T?(?:(\d+)H)?(?:(\d+)M)?(?:\d+S)?$/i.exec(s);
    if (iso) {
      if (iso[1] && parseInt(iso[1]) > 0) return null; // day-scale → time_notes
      const hours = parseInt(iso[2] || "0");
      const mins = parseInt(iso[3] || "0");
      if (hours === 0 && mins === 0) return null;
      return hours * 60 + mins;
    }
  }

  // HH:MM format (e.g. "1:30" → 90, "0:45" → 45)
  const hhMm = /^(\d{1,2}):(\d{2})$/.exec(s);
  if (hhMm) return parseInt(hhMm[1]) * 60 + parseInt(hhMm[2]);

  let total = 0;
  let matched = false;

  const hoursMatch = /(\d+(?:\.\d+)?)\s*(?:hr|hrs|hour|hours)\b/i.exec(s);
  if (hoursMatch) {
    total += Math.round(parseFloat(hoursMatch[1]) * 60);
    matched = true;
  }

  const minsMatch = /(\d+(?:\.\d+)?)\s*(?:min|mins|minute|minutes)\b/i.exec(s);
  if (minsMatch) {
    total += Math.round(parseFloat(minsMatch[1]));
    matched = true;
  }

  if (matched) return total;

  // Bare integer → assume minutes
  if (/^\d+$/.test(s)) return parseInt(s);

  return null;
}

/**
 * Extract the value following a time label, stopping at the next label
 * keyword, a field separator (,;|), or end of string.
 *
 * @param s - normalized input string (undefined prefix already stripped)
 * @param labelPattern - regex source for the label (e.g. "active\\s+time")
 */
function extractLabeledValue(s: string, labelPattern: string): string | null {
  const re = new RegExp(
    `\\b(?:${labelPattern})\\b\\s*:?\\s*(.+?)` +
      `(?=\\s+(?:active|total|prep(?:aration)?|cook(?:ing)?)\\b` +
      `|[,;|]` +
      `|$)`,
    "i"
  );
  const m = re.exec(s);
  return m ? m[1].trim() : null;
}

export function parseTimeString(raw: string): ParsedTime {
  const result: ParsedTime = {
    prep_min: null,
    active_min: null,
    total_min: null,
    time_notes: null,
  };

  if (!raw?.trim()) return result;

  const s = stripUndefinedPrefix(raw);

  // --- Pass 1: Labeled fields -----------------------------------------------
  // Handles: "Active Time: X, Total Time: Y", "Prep 10 mins Cook 45 mins",
  //          "Prep Time: X, Cook Time: Y", and all case variants.
  const activeStr = extractLabeledValue(s, "active\\s+time");
  const totalStr = extractLabeledValue(s, "total\\s+time");
  // "prep" / "prep time" / "preparation" — word boundary prevents matching "preheat"
  const prepStr = extractLabeledValue(s, "prep(?:aration)?(?:\\s+time)?");
  // "cook" / "cook time" / "cooking time"
  const cookStr = extractLabeledValue(s, "cook(?:ing)?(?:\\s+time)?");

  if (
    activeStr !== null ||
    totalStr !== null ||
    prepStr !== null ||
    cookStr !== null
  ) {
    if (activeStr !== null) result.active_min = parseDuration(activeStr);
    if (prepStr !== null) result.prep_min = parseDuration(prepStr);
    // Cook time maps to active_min when no explicit "Active Time" field exists.
    if (cookStr !== null && result.active_min === null)
      result.active_min = parseDuration(cookStr);

    if (totalStr !== null) {
      const t = parseDuration(totalStr);
      if (t !== null) {
        result.total_min = t;
      } else {
        // Day-scale total (e.g. "Total Time: 2 days") → preserve as notes
        result.time_notes = s;
      }
    }

    // If a labeled field was day-scale and no time_notes set yet, record raw
    if (activeStr !== null && result.active_min === null && !result.time_notes)
      result.time_notes = s;

    return result;
  }

  // --- Pass 2: "duration + narrative" ----------------------------------------
  // e.g. "1 hour + overnight to marinate" → total_min=60, time_notes preserved
  const plusIdx = s.indexOf("+");
  if (plusIdx > 0) {
    const leading = parseDuration(s.slice(0, plusIdx));
    if (leading !== null) {
      result.total_min = leading;
      result.time_notes = s;
      return result;
    }
  }

  // --- Pass 3: Day-scale strings → time_notes only ---------------------------
  if (DAY_SCALE_RE.test(s) || /^\s*up\s+to\b/i.test(s)) {
    result.time_notes = s;
    return result;
  }

  // --- Pass 4: Simple single duration ----------------------------------------
  const total = parseDuration(s);
  if (total !== null) {
    result.total_min = total;
    return result;
  }

  // --- Fallback: unrecognized format → time_notes ----------------------------
  result.time_notes = s;
  return result;
}
