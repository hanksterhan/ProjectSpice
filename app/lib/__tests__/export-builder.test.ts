import { describe, it, expect } from "vitest";
import { toJsonLd, toPaprikaHtml, buildExportPayload, type ExportRecipe, type ExportLog } from "../export-builder";

function makeRecipe(overrides: Partial<ExportRecipe> = {}): ExportRecipe {
  return {
    id: "abc12345-0000-0000-0000-000000000000",
    title: "Chocolate Cake",
    slug: "chocolate-cake",
    description: "A rich dessert.",
    sourceUrl: "https://example.com/cake",
    sourceType: "manual",
    prepTimeMin: 15,
    activeTimeMin: null,
    totalTimeMin: 45,
    timeNotes: null,
    servings: 8,
    servingsUnit: "slices",
    difficulty: null,
    directionsText: "Mix ingredients.\nBake at 350°F for 30 minutes.",
    notes: "Best served warm.",
    imageKey: null,
    rating: 5,
    visibility: "private",
    paprikaOriginalId: null,
    createdAt: new Date("2026-01-01"),
    updatedAt: new Date("2026-01-02"),
    ingredients: [
      {
        sortOrder: 0,
        groupName: null,
        quantityRaw: "2",
        unitRaw: "cups",
        name: "flour",
        notes: "sifted",
        weightG: null,
        footnoteRef: null,
        isGroupHeader: false,
      },
      {
        sortOrder: 1,
        groupName: "WET",
        quantityRaw: null,
        unitRaw: null,
        name: "WET",
        notes: null,
        weightG: null,
        footnoteRef: null,
        isGroupHeader: true,
      },
      {
        sortOrder: 2,
        groupName: "WET",
        quantityRaw: "2",
        unitRaw: null,
        name: "eggs",
        notes: null,
        weightG: null,
        footnoteRef: null,
        isGroupHeader: false,
      },
    ],
    tags: [
      { id: "t1", name: "Dessert" },
      { id: "t2", name: "Baking" },
    ],
    ...overrides,
  };
}

// ─── toJsonLd ─────────────────────────────────────────────────────────────────

describe("toJsonLd", () => {
  it("emits @context and @type", () => {
    const ld = toJsonLd(makeRecipe());
    expect(ld["@context"]).toBe("https://schema.org");
    expect(ld["@type"]).toBe("Recipe");
  });

  it("includes ingredient strings (skips group headers)", () => {
    const ld = toJsonLd(makeRecipe()) as Record<string, unknown>;
    const ingreds = ld.recipeIngredient as string[];
    expect(ingreds).toHaveLength(2);
    expect(ingreds[0]).toBe("2 cups flour sifted");
    expect(ingreds[1]).toBe("2 eggs");
  });

  it("maps prep / total time to ISO 8601", () => {
    const ld = toJsonLd(makeRecipe());
    expect(ld.prepTime).toBe("PT15M");
    expect(ld.totalTime).toBe("PT45M");
  });

  it("omits prepTime when null", () => {
    const ld = toJsonLd(makeRecipe({ prepTimeMin: null }));
    expect(ld.prepTime).toBeUndefined();
  });

  it("formats hours correctly", () => {
    const ld = toJsonLd(makeRecipe({ totalTimeMin: 90 }));
    expect(ld.totalTime).toBe("PT1H30M");
  });

  it("formats exact hours without minutes", () => {
    const ld = toJsonLd(makeRecipe({ totalTimeMin: 120 }));
    expect(ld.totalTime).toBe("PT2H");
  });

  it("includes tags as keywords", () => {
    const ld = toJsonLd(makeRecipe());
    expect(ld.keywords).toBe("Dessert, Baking");
  });

  it("omits keywords when no tags", () => {
    const ld = toJsonLd(makeRecipe({ tags: [] }));
    expect(ld.keywords).toBeUndefined();
  });

  it("includes recipeYield with servingsUnit", () => {
    const ld = toJsonLd(makeRecipe());
    expect(ld.recipeYield).toBe("8 slices");
  });

  it("includes aggregateRating", () => {
    const ld = toJsonLd(makeRecipe()) as Record<string, unknown>;
    const rating = ld.aggregateRating as Record<string, unknown>;
    expect(rating.ratingValue).toBe(5);
  });

  it("splits directions into HowToStep array", () => {
    const ld = toJsonLd(makeRecipe()) as Record<string, unknown>;
    const steps = ld.recipeInstructions as Array<Record<string, string>>;
    expect(steps).toHaveLength(2);
    expect(steps[0]["@type"]).toBe("HowToStep");
    expect(steps[0].text).toBe("Mix ingredients.");
  });
});

// ─── toPaprikaHtml ────────────────────────────────────────────────────────────

describe("toPaprikaHtml", () => {
  it("contains recipe title", () => {
    const html = toPaprikaHtml(makeRecipe());
    expect(html).toContain("Chocolate Cake");
  });

  it("renders ingredient lines with itemprop", () => {
    const html = toPaprikaHtml(makeRecipe());
    expect(html).toContain('itemprop="recipeIngredient"');
    expect(html).toContain("2 cups flour sifted");
  });

  it("renders group headers in <strong>", () => {
    const html = toPaprikaHtml(makeRecipe());
    expect(html).toContain("<strong>WET</strong>");
  });

  it("renders direction steps as <li>", () => {
    const html = toPaprikaHtml(makeRecipe());
    expect(html).toContain("<li");
    expect(html).toContain("Mix ingredients.");
  });

  it("includes source URL", () => {
    const html = toPaprikaHtml(makeRecipe());
    expect(html).toContain("https://example.com/cake");
  });

  it("escapes HTML entities in title", () => {
    const html = toPaprikaHtml(makeRecipe({ title: 'Tomato & <Basil> "Soup"' }));
    expect(html).toContain("Tomato &amp; &lt;Basil&gt; &quot;Soup&quot;");
    expect(html).not.toContain("<Basil>");
  });

  it("omits source URL block when null", () => {
    const html = toPaprikaHtml(makeRecipe({ sourceUrl: null }));
    expect(html).not.toContain("Source:");
  });
});

// ─── buildExportPayload ───────────────────────────────────────────────────────

describe("buildExportPayload", () => {
  it("includes exportedAt ISO string", () => {
    const payload = buildExportPayload([], []);
    expect(payload.exportedAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
  });

  it("sets version to '1'", () => {
    const payload = buildExportPayload([], []);
    expect(payload.version).toBe("1");
  });

  it("passes through recipes and logs", () => {
    const log: ExportLog = {
      id: "log1",
      recipeId: null,
      cookedAt: new Date(),
      rating: 4,
      notes: "Great",
      modifications: null,
    };
    const payload = buildExportPayload([makeRecipe()], [log]);
    expect(payload.recipes).toHaveLength(1);
    expect(payload.logs).toHaveLength(1);
    expect(payload.logs[0].notes).toBe("Great");
  });
});
