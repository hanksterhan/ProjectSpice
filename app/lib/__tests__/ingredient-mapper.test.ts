import { describe, it, expect } from "vitest";
import {
  buildTermIndex,
  annotateStep,
  segmentStep,
  type MappableIngredient,
} from "../ingredient-mapper";

function ing(
  id: string,
  name: string,
  opts: Partial<MappableIngredient> = {}
): MappableIngredient {
  return {
    id,
    name,
    quantityRaw: opts.quantityRaw ?? null,
    quantityDecimal: opts.quantityDecimal ?? null,
    unitRaw: opts.unitRaw ?? null,
    notes: opts.notes ?? null,
    weightG: opts.weightG ?? null,
    isGroupHeader: opts.isGroupHeader ?? false,
  };
}

const CHICKEN = ing("c1", "chicken thighs", { quantityRaw: "4", unitRaw: "large" });
const GARLIC = ing("g1", "garlic cloves", { quantityRaw: "3", unitRaw: "" });
const OLIVE_OIL = ing("o1", "olive oil", { quantityRaw: "2", unitRaw: "tbsp" });
const SALT = ing("s1", "salt", { quantityRaw: "1", unitRaw: "tsp" });
const HEADER = ing("h1", "PRODUCE", { isGroupHeader: true });

// ---------------------------------------------------------------------------
// buildTermIndex
// ---------------------------------------------------------------------------

describe("buildTermIndex", () => {
  it("excludes group headers", () => {
    const idx = buildTermIndex([HEADER, CHICKEN]);
    expect(idx.every((e) => e.ingredientId !== "h1")).toBe(true);
  });

  it("includes multi-word names", () => {
    const idx = buildTermIndex([CHICKEN]);
    expect(idx.some((e) => e.term === "chicken thighs")).toBe(true);
  });

  it("also indexes name without parenthetical notes", () => {
    const parens = ing("p1", "chicken (bone-in)", { quantityRaw: "2" });
    const idx = buildTermIndex([parens]);
    expect(idx.some((e) => e.term === "chicken")).toBe(true);
    expect(idx.some((e) => e.term === "chicken bone in")).toBe(true);
  });

  it("sorts longer terms first", () => {
    const idx = buildTermIndex([CHICKEN, GARLIC, OLIVE_OIL]);
    const tokens = idx.map((e) => e.tokenCount);
    for (let i = 0; i < tokens.length - 1; i++) {
      expect(tokens[i]).toBeGreaterThanOrEqual(tokens[i + 1]);
    }
  });

  it("does not index stopword-only names", () => {
    const stopIng = ing("x1", "fresh");
    const idx = buildTermIndex([stopIng]);
    expect(idx).toHaveLength(0);
  });

  it("builds label with qty + unit + name", () => {
    const idx = buildTermIndex([OLIVE_OIL]);
    expect(idx[0].label).toBe("2 tbsp olive oil");
  });
});

// ---------------------------------------------------------------------------
// annotateStep
// ---------------------------------------------------------------------------

describe("annotateStep", () => {
  const ingredients = [CHICKEN, GARLIC, OLIVE_OIL, SALT];
  let termIndex: ReturnType<typeof buildTermIndex>;
  beforeAll(() => {
    termIndex = buildTermIndex(ingredients);
  });

  it("returns empty array for empty step", () => {
    expect(annotateStep("", termIndex)).toEqual([]);
  });

  it("returns empty array when no ingredients match", () => {
    const spans = annotateStep("Preheat the oven to 400°F.", termIndex);
    expect(spans).toHaveLength(0);
  });

  it("matches a simple ingredient name", () => {
    const spans = annotateStep("Add salt and pepper.", termIndex);
    expect(spans).toHaveLength(1);
    expect(spans[0].ingredientId).toBe("s1");
    expect(spans[0].text).toBe("salt");
  });

  it("matches multi-word ingredient name", () => {
    const spans = annotateStep("Season the chicken thighs generously.", termIndex);
    expect(spans.some((s) => s.ingredientId === "c1")).toBe(true);
  });

  it("does not double-match overlapping regions", () => {
    // "olive oil" should match as one span, not "olive" + "oil"
    const spans = annotateStep("Heat the olive oil in a pan.", termIndex);
    expect(spans.filter((s) => s.ingredientId === "o1")).toHaveLength(1);
  });

  it("matches multiple ingredients in one step", () => {
    const spans = annotateStep("Heat olive oil and add garlic cloves.", termIndex);
    const ids = spans.map((s) => s.ingredientId);
    expect(ids).toContain("o1");
    expect(ids).toContain("g1");
  });

  it("respects word boundaries — does not match 'salt' inside 'assault'", () => {
    const spans = annotateStep("the assault continued.", termIndex);
    expect(spans).toHaveLength(0);
  });

  it("spans are sorted by start position", () => {
    const spans = annotateStep("Add garlic cloves then olive oil.", termIndex);
    for (let i = 0; i < spans.length - 1; i++) {
      expect(spans[i].start).toBeLessThan(spans[i + 1].start);
    }
  });
});

// ---------------------------------------------------------------------------
// segmentStep
// ---------------------------------------------------------------------------

describe("segmentStep", () => {
  const ingredients = [OLIVE_OIL, SALT];
  let termIndex: ReturnType<typeof buildTermIndex>;
  beforeAll(() => {
    termIndex = buildTermIndex(ingredients);
  });

  it("returns single text segment when no matches", () => {
    const segs = segmentStep("Preheat oven.", termIndex);
    expect(segs).toHaveLength(1);
    expect(segs[0]).toEqual({ kind: "text", text: "Preheat oven." });
  });

  it("produces text + span + text segments", () => {
    const segs = segmentStep("Heat the olive oil.", termIndex);
    expect(segs.some((s) => s.kind === "span" && s.text === "olive oil")).toBe(true);
    const texts = segs.filter((s) => s.kind === "text").map((s) => s.text);
    expect(texts.join("").includes("Heat the")).toBe(true);
  });

  it("preserves original casing in span text", () => {
    const segs = segmentStep("Add Salt to taste.", termIndex);
    const span = segs.find((s) => s.kind === "span");
    // Salt capitalised in source should still be returned as found
    expect(span?.text).toBe("Salt");
  });

  it("label includes full ingredient info", () => {
    const segs = segmentStep("Add olive oil.", termIndex);
    const span = segs.find((s) => s.kind === "span");
    expect(span?.kind === "span" && span.label).toContain("olive oil");
  });

  it("handles step with no ingredients list gracefully", () => {
    const segs = segmentStep("Mix everything.", []);
    expect(segs).toHaveLength(1);
    expect(segs[0].kind).toBe("text");
  });
});

import { beforeAll } from "vitest";
