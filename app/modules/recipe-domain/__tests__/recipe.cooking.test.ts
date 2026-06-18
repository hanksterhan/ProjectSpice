import { describe, expect, it } from "vitest";

import {
  addCookJournalNote,
  addCookHistoryEntry,
  addCookedDate,
  getCookCount,
  getLastCookedDate,
  normalizeCookHistory,
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

  it("adds structured cook history with recipe lens context", () => {
    const updatedRecipe = addCookHistoryEntry(validRecipeFixture, {
      cookedOn: "2026-06-07",
      createdAt: "2026-06-08T01:02:03.000Z",
      lensKey: "lower-cal",
      lensName: "Lower-Cal",
      note: "Used less icing.",
      recipeVersion: 1,
    });

    expect(updatedRecipe.cookedDates).toEqual(["2026-06-07"]);
    expect(updatedRecipe.cookHistory).toEqual([
      {
        cookedOn: "2026-06-07",
        createdAt: "2026-06-08T01:02:03.000Z",
        lensKey: "lower-cal",
        lensName: "Lower-Cal",
        note: "Used less icing.",
        recipeVersion: 1,
      },
    ]);
    expect(getCookCount(updatedRecipe)).toBe(1);
    expect(getLastCookedDate(updatedRecipe)).toBe("2026-06-07");
    expect(validRecipeFixture).not.toHaveProperty("cookHistory");
  });

  it("keeps legacy cooked dates in counts when structured history exists", () => {
    const recipe = {
      ...validRecipeFixture,
      cookedDates: ["2026-06-07", "2026-05-01"],
      cookHistory: [
        {
          cookedOn: "2026-06-07",
          createdAt: "2026-06-08T01:02:03.000Z",
          lensKey: "lower-cal",
          lensName: "Lower-Cal",
        },
      ],
    };

    expect(getCookCount(recipe)).toBe(2);
    expect(getLastCookedDate(recipe)).toBe("2026-06-07");
  });

  it("normalizes structured cook history newest first", () => {
    expect(
      normalizeCookHistory([
        {
          cookedOn: "2026-05-01",
          createdAt: "2026-05-02T01:00:00.000Z",
          lensKey: "original",
          lensName: "Original",
        },
        {
          cookedOn: "2026-06-07",
          createdAt: "2026-06-07T01:00:00.000Z",
          lensKey: "quick",
          lensName: "Quick",
        },
        {
          cookedOn: "2026-06-07",
          createdAt: "2026-06-08T01:00:00.000Z",
          lensKey: "lower-cal",
          lensName: "Lower-Cal",
        },
      ]),
    ).toMatchObject([
      { lensKey: "lower-cal" },
      { lensKey: "quick" },
      { lensKey: "original" },
    ]);
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
