import { describe, expect, it } from "vitest";

import {
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
});
