import { describe, expect, it } from "vitest";

import {
  createEmptyRecipeDraft,
  createRecipeSlug,
  formatDisplayTime,
  formatIngredientDisplayText,
  formatIngredientMeasure,
  getDisplayDirectionSteps,
  moveRecipeSection,
  normalizeDirectionSections,
  normalizeDirectionSteps,
  recipeDraftSchema,
  validRecipeFixture,
} from "../index";
import { seedRecipes } from "../seed-recipes.fixtures";

describe("createRecipeSlug", () => {
  it("creates URL-safe slugs from recipe titles", () => {
    expect(createRecipeSlug("  Weeknight Sesame Chicken Bowls!  ")).toBe(
      "weeknight-sesame-chicken-bowls",
    );
  });

  it("removes accents and collapses separators", () => {
    expect(createRecipeSlug("Crème brûlée -- quick version")).toBe(
      "creme-brulee-quick-version",
    );
  });
});

describe("formatDisplayTime", () => {
  it("formats empty, minute-only, hour-only, and mixed durations", () => {
    expect(formatDisplayTime(undefined)).toBe("");
    expect(formatDisplayTime(0)).toBe("0 min");
    expect(formatDisplayTime(15)).toBe("15 min");
    expect(formatDisplayTime(60)).toBe("1 hr");
    expect(formatDisplayTime(95)).toBe("1 hr 35 min");
  });
});

describe("formatIngredientDisplayText", () => {
  it("prefers preserved raw ingredient text", () => {
    expect(formatIngredientDisplayText(validRecipeFixture.ingredients[0].items[0])).toBe(
      "1 1/2 lb boneless chicken thighs, cut into bite-size pieces",
    );
  });

  it("falls back to structured fields when raw text is not useful", () => {
    expect(
      formatIngredientDisplayText({
        id: "carrots",
        raw: " ",
        quantity: 2,
        unit: "cups",
        item: "carrots",
        preparation: "thinly sliced",
      }),
    ).toBe("2 cups carrots, thinly sliced");
  });
});

describe("formatIngredientMeasure", () => {
  it("formats common decimal quantities as readable fractions", () => {
    expect(formatIngredientMeasure(validRecipeFixture.ingredients[0].items[0])).toBe(
      "1 1/2 lb",
    );
    expect(formatIngredientMeasure(validRecipeFixture.ingredients[1].items[0])).toBe(
      "1/4 cup",
    );
  });

  it("returns an empty measure when an ingredient has no quantity", () => {
    expect(formatIngredientMeasure(validRecipeFixture.ingredients[1].items[2])).toBe(
      "",
    );
  });

  it("extracts measures from raw Paprika-style ingredient text", () => {
    const classicBombe = seedRecipes.find(
      (recipe) => recipe.id === "classic-sundae-bombe",
    );

    expect(formatIngredientMeasure(classicBombe!.ingredients[0].items[0])).toBe(
      "⅔ cup",
    );
    expect(formatIngredientMeasure(classicBombe!.ingredients[0].items[1])).toBe(
      "1 package",
    );
    expect(formatIngredientMeasure(classicBombe!.ingredients[1].items[2])).toBe(
      "1¼ cups",
    );
  });
});

describe("moveRecipeSection", () => {
  it("moves sections without mutating the original array", () => {
    const sections = validRecipeFixture.ingredients;
    const movedSections = moveRecipeSection(sections, 1, 0);

    expect(movedSections.map((section) => section.id)).toEqual([
      "sauce",
      "main-ingredients",
    ]);
    expect(sections.map((section) => section.id)).toEqual([
      "main-ingredients",
      "sauce",
    ]);
  });

  it("returns a shallow copy when indexes are outside the section range", () => {
    const sections = validRecipeFixture.ingredients;
    const movedSections = moveRecipeSection(sections, 10, 0);

    expect(movedSections).toEqual(sections);
    expect(movedSections).not.toBe(sections);
  });
});

describe("normalizeDirectionSteps", () => {
  it("sorts direction steps by order and renumbers them sequentially", () => {
    const [firstStep, secondStep, thirdStep] =
      validRecipeFixture.directions[0].steps;

    expect(
      normalizeDirectionSteps([
        { ...thirdStep, order: 30 },
        { ...firstStep, order: 10 },
        { ...secondStep, order: 20 },
      ]).map((step) => [step.id, step.order]),
    ).toEqual([
      ["mix-sauce", 1],
      ["brown-chicken", 2],
      ["finish-bowls", 3],
    ]);
  });
});

describe("normalizeDirectionSections", () => {
  it("normalizes step order inside every direction section", () => {
    const normalizedSections = normalizeDirectionSections([
      {
        ...validRecipeFixture.directions[0],
        steps: [
          { ...validRecipeFixture.directions[0].steps[1], order: 2 },
          { ...validRecipeFixture.directions[0].steps[0], order: 1 },
        ],
      },
    ]);

    expect(normalizedSections[0].steps.map((step) => step.order)).toEqual([1, 2]);
  });
});

describe("getDisplayDirectionSteps", () => {
  it("uses sequential display order and removes imported direction labels", () => {
    const steps = getDisplayDirectionSteps([
      {
        id: "step-1",
        order: 1,
        text: "). First prepare the pastry cream.",
      },
      {
        id: "step-1",
        order: 1,
        text: "1) Make the cupcake batter.",
      },
      {
        id: "step-1",
        order: 1,
        text: "Step 3: Bake until set.",
      },
    ]);

    expect(steps.map((step) => step.displayOrder)).toEqual([1, 2, 3]);
    expect(steps.map((step) => step.displayText)).toEqual([
      "First prepare the pastry cream.",
      "Make the cupcake batter.",
      "Bake until set.",
    ]);
  });
});

describe("createEmptyRecipeDraft", () => {
  it("creates a schema-valid draft with editable placeholder sections", () => {
    const draft = createEmptyRecipeDraft();

    expect(recipeDraftSchema.safeParse(draft).success).toBe(true);
    expect(draft.ingredients[0].items[0].raw).toBe("Ingredient");
    expect(draft.directions[0].steps[0].text).toBe("Add a step.");
  });

  it("applies valid caller overrides", () => {
    expect(createEmptyRecipeDraft({ title: "Bean Soup" }).title).toBe("Bean Soup");
  });
});
