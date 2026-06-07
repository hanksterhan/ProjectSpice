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
        text: "soy sauce",
      },
      { type: "text", text: ", " },
      {
        type: "ingredient",
        ingredientId: "toasted-sesame-oil",
        measure: "2 tsp",
        text: "sesame oil",
      },
      { type: "text", text: ", and a splash of water in a small bowl." },
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
