import { describe, expect, it } from "vitest";

import {
  addCookJournalNote,
  addCookedDate,
  getCookCount,
  getLastCookedDate,
  normalizeCookedDates,
  validRecipeFixture,
} from "../index";

describe("recipe cooking helpers", () => {
  it("normalizes cooked dates newest first and removes duplicates", () => {
    expect(
      normalizeCookedDates(["2026-05-01", "not-a-date", "2026-06-07", "2026-05-01"]),
    ).toEqual(["2026-06-07", "2026-05-01"]);
  });

  it("adds cooked dates without mutating the recipe", () => {
    const updatedRecipe = addCookedDate(validRecipeFixture, "2026-06-07");

    expect(updatedRecipe.cookedDates).toEqual(["2026-06-07"]);
    expect(getCookCount(updatedRecipe)).toBe(1);
    expect(getLastCookedDate(updatedRecipe)).toBe("2026-06-07");
    expect(validRecipeFixture).not.toHaveProperty("cookedDates");
  });

  it("adds dated cook journal notes without mutating existing notes", () => {
    const updatedRecipe = addCookJournalNote(
      validRecipeFixture,
      "2026-06-07",
      "Used less sugar and baked 5 minutes longer.",
    );

    expect(updatedRecipe.notes).toEqual([
      ...(validRecipeFixture.notes ?? []),
      "Jun 7, 2026 - Used less sugar and baked 5 minutes longer.",
    ]);
    expect(validRecipeFixture.notes).toEqual(["Add steamed snap peas for a greener bowl."]);
  });

  it("does not add duplicate cook journal notes", () => {
    const updatedRecipe = addCookJournalNote(
      {
        ...validRecipeFixture,
        notes: [
          ...(validRecipeFixture.notes ?? []),
          "Jun 7, 2026 - Used less sugar.",
        ],
      },
      "2026-06-07",
      "Used less sugar.",
    );

    expect(updatedRecipe.notes).toEqual([
      ...(validRecipeFixture.notes ?? []),
      "Jun 7, 2026 - Used less sugar.",
    ]);
  });
});
