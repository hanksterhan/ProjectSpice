import { describe, expect, it } from "vitest";

import { seedRecipes, validRecipeFixture } from "~/modules/recipe-domain";

import {
  buildDirectionIngredientIndex,
  enrichDirectionStepText,
  getDirectionStepIngredientSummary,
} from "../direction-ingredients";

describe("direction ingredient helpers", () => {
  it("injects referenced ingredient quantities into matching direction text", () => {
    const [step] = validRecipeFixture.directions[0].steps;

    expect(enrichDirectionStepText(step, validRecipeFixture.ingredients)).toEqual([
      { type: "text", text: "Whisk the " },
      {
        type: "ingredient",
        ingredientId: "soy-sauce",
        measure: "1/4 cup",
        showMeasure: true,
        text: "soy sauce",
      },
      { type: "text", text: ", " },
      {
        type: "ingredient",
        ingredientId: "toasted-sesame-oil",
        measure: "2 tsp",
        showMeasure: true,
        text: "sesame oil",
      },
      { type: "text", text: ", and a splash of water in a small bowl." },
    ]);
  });

  it("does not duplicate measures already written into direction text", () => {
    const recipe = {
      ...validRecipeFixture,
      ingredients: [
        {
          id: "sauce",
          items: [
            {
              id: "gochujang",
              raw: "2 tbsp gochujang",
              quantity: 2,
              unit: "tbsp",
              item: "gochujang",
            },
            {
              id: "garlic",
              raw: "4 cloves garlic, grated",
              quantity: 4,
              unit: "cloves",
              item: "garlic",
              preparation: "grated",
            },
          ],
        },
      ],
    };
    const step = {
      id: "mix",
      order: 1,
      text: "Whisk together 2 tablespoons gochujang and 4 grated garlic cloves.",
      ingredientRefs: ["gochujang", "garlic"],
    };

    expect(enrichDirectionStepText(step, recipe.ingredients)).toEqual([
      { type: "text", text: "Whisk together 2 tablespoons " },
      {
        type: "ingredient",
        ingredientId: "gochujang",
        measure: "2 tbsp",
        showMeasure: false,
        text: "gochujang",
      },
      { type: "text", text: " and 4 grated " },
      {
        type: "ingredient",
        ingredientId: "garlic",
        measure: "4 cloves",
        showMeasure: false,
        text: "garlic",
      },
      { type: "text", text: " cloves." },
    ]);
  });

  it("falls back to a measured summary for referenced ingredients absent from text", () => {
    const step = {
      id: "mix",
      order: 1,
      text: "Stir everything together.",
      ingredientRefs: ["soy-sauce"],
    };
    const index = buildDirectionIngredientIndex(validRecipeFixture.ingredients);

    expect(getDirectionStepIngredientSummary(step, index)).toEqual([
      {
        id: "soy-sauce",
        displayText: "1/4 cup soy sauce",
        measure: "1/4 cup",
      },
    ]);
  });

  it("keeps raw-text fallback matching specific enough for Paprika recipes", () => {
    const recipe = seedRecipes.find((seedRecipe) => seedRecipe.id === "classic-sundae-bombe")!;
    const chocolateLayerStep = recipe.directions[0].steps[3];

    const ingredientMentions = enrichDirectionStepText(
      chocolateLayerStep,
      recipe.ingredients,
    ).filter((part) => part.type === "ingredient");

    expect(ingredientMentions).toContainEqual({
      type: "ingredient",
      ingredientId: "classic-sundae-bombe-ingredient-3",
      measure: "1 pint",
      showMeasure: true,
      text: "chocolate ice cream",
    });
    expect(ingredientMentions).not.toContainEqual(
      expect.objectContaining({
        ingredientId: "classic-sundae-bombe-ingredient-6",
        text: "chocolate",
      }),
    );
    expect(ingredientMentions).not.toContainEqual(
      expect.objectContaining({
        ingredientId: "classic-sundae-bombe-ingredient-7",
        text: "cream",
      }),
    );
  });
});
