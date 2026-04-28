import { describe, expect, it } from "vitest";
import {
  BULK_APPROVE_DEFAULT_THRESHOLD,
  buildPaprikaParsedFieldSummary,
  clampBulkApproveThreshold,
  scorePaprikaImportConfidence,
} from "../import-review.server";
import type { PaprikaRecipeText } from "../paprika-binary-parser";

function makeRecipe(overrides: Partial<PaprikaRecipeText> = {}): PaprikaRecipeText {
  return {
    uid: "paprika-1",
    name: "Weeknight Pasta",
    ingredients: "8 oz pasta\n1 cup tomato sauce\n2 tbsp parmesan",
    directions: "1. Boil pasta.\n2. Toss with sauce.",
    description: "",
    notes: "",
    categories: ["Dinner"],
    servings: "4",
    prep_time: "10 min",
    cook_time: "15 min",
    total_time: "25 min",
    difficulty: "Easy",
    rating: 4,
    source: "",
    source_url: "https://example.com/pasta",
    image_url: "https://example.com/pasta.jpg",
    photo: "",
    photo_hash: "",
    photo_large: null,
    nutritional_info: "",
    created: "2024-01-01 10:00:00",
    hash: "abc",
    ...overrides,
  };
}

describe("Paprika import review foundations", () => {
  it("summarizes parsed fields for review rows", () => {
    const summary = buildPaprikaParsedFieldSummary(makeRecipe());

    expect(summary).toMatchObject({
      titlePresent: true,
      ingredientLineCount: 3,
      directionStepCount: 2,
      categoryCount: 1,
      hasSourceUrl: true,
      hasImage: true,
      hasServings: true,
      hasTiming: true,
      warnings: [],
    });
  });

  it("scores high-confidence complete Paprika recipes", () => {
    const confidence = scorePaprikaImportConfidence(makeRecipe());

    expect(confidence.score).toBe(100);
    expect(confidence.level).toBe("high");
  });

  it("surfaces low-confidence recipes with missing parsed fields", () => {
    const confidence = scorePaprikaImportConfidence(
      makeRecipe({
        ingredients: "",
        directions: "",
        categories: [],
        source_url: "",
        image_url: "",
        servings: "",
        prep_time: "",
        cook_time: "",
        total_time: "",
      })
    );

    expect(confidence.level).toBe("low");
    expect(confidence.score).toBeLessThan(65);
    expect(confidence.summary.warnings).toContain("No ingredients found");
    expect(confidence.summary.warnings).toContain("No directions found");
  });

  it("clamps bulk-approve thresholds to a review-safe range", () => {
    expect(clampBulkApproveThreshold(undefined)).toBe(BULK_APPROVE_DEFAULT_THRESHOLD);
    expect(clampBulkApproveThreshold(42)).toBe(60);
    expect(clampBulkApproveThreshold(97.2)).toBe(97);
    expect(clampBulkApproveThreshold(120)).toBe(100);
  });
});
