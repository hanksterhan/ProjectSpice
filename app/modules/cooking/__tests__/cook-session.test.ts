import { describe, expect, it } from "vitest";

import {
  createCookSessionStorageKey,
  createInitialCookSessionState,
  flattenCookSessionSteps,
  getActiveCookStep,
  getCookRecipeProgress,
  getNextIncompleteCookStep,
  parseCookRecipeIds,
  stripDirectionStepLabel,
} from "~/modules/cooking/cook-session";
import { validRecipeFixture } from "~/modules/recipe-domain";

describe("cook session helpers", () => {
  it("parses repeated recipe params and removes duplicates", () => {
    expect(
      parseCookRecipeIds(
        "https://spice.test/cook?recipe=first&recipe=second&recipe=first&recipe=&recipeIds=third",
      ),
    ).toEqual(["first", "second", "third"]);
  });

  it("includes recipe ids and versions in the storage key", () => {
    const recipe = validRecipeFixture;
    const editedRecipe = {
      ...validRecipeFixture,
      id: "edited-recipe",
      version: 7,
    };

    expect(createCookSessionStorageKey([editedRecipe, recipe])).toBe(
      "project-spice:cook-session:edited-recipe@7,weeknight-sesame-chicken-bowls@1",
    );
  });

  it("flattens steps with recipe, section, order, and timer details", () => {
    const steps = flattenCookSessionSteps([validRecipeFixture]);

    expect(steps).toHaveLength(3);
    expect(steps[1]).toMatchObject({
      recipeId: "weeknight-sesame-chicken-bowls",
      recipeTitle: "Weeknight Sesame Chicken Bowls",
      sectionId: "cook",
      sectionTitle: "Cook",
      stepIndex: 2,
      totalSteps: 3,
      step: {
        id: "brown-chicken",
        order: 2,
        timerMinutes: 8,
      },
    });
  });

  it("uses the next incomplete step when the saved active step is absent", () => {
    const state = createInitialCookSessionState([validRecipeFixture]);
    const steps = flattenCookSessionSteps([validRecipeFixture]);
    const recipeState = {
      ...state.recipes[validRecipeFixture.id],
      activeStepId: "missing-step",
      completedStepIds: [steps[0].id],
    };

    expect(getActiveCookStep(validRecipeFixture, recipeState)?.step.id).toBe(
      "brown-chicken",
    );
    expect(getNextIncompleteCookStep(validRecipeFixture, recipeState)?.step.id).toBe(
      "brown-chicken",
    );
  });

  it("counts completed recipe progress", () => {
    const state = createInitialCookSessionState([validRecipeFixture]);
    const steps = flattenCookSessionSteps([validRecipeFixture]);
    const recipeState = {
      ...state.recipes[validRecipeFixture.id],
      completedStepIds: [steps[0].id, steps[1].id, "not-real"],
    };

    expect(getCookRecipeProgress(validRecipeFixture, recipeState)).toEqual({
      completedSteps: 2,
      totalSteps: 3,
    });
  });

  it("uses unique state ids when imported steps share ids and order values", () => {
    const recipe = {
      ...validRecipeFixture,
      directions: [
        {
          id: "directions",
          steps: [
            {
              id: "step-1",
              order: 1,
              text: "First shared step.",
            },
            {
              id: "step-1",
              order: 1,
              text: "Second shared step.",
            },
          ],
        },
      ],
    };
    const steps = flattenCookSessionSteps([recipe]);

    expect(steps.map((step) => step.id)).toEqual([
      "weeknight-sesame-chicken-bowls:directions:1:step-1",
      "weeknight-sesame-chicken-bowls:directions:2:step-1",
    ]);
    expect(new Set(steps.map((step) => step.id)).size).toBe(2);
    expect(
      getCookRecipeProgress(recipe, {
        recipeId: recipe.id,
        recipeVersion: recipe.version,
        activeStepId: steps[0].id,
        completedStepIds: [steps[0].id],
        checkedIngredientIds: [],
      }),
    ).toEqual({
      completedSteps: 1,
      totalSteps: 2,
    });
  });
});

describe("stripDirectionStepLabel", () => {
  it("removes common numeric direction labels and delimiters", () => {
    expect(stripDirectionStepLabel("1). First prepare the pastry cream.")).toBe(
      "First prepare the pastry cream.",
    );
    expect(stripDirectionStepLabel("). First prepare the pastry cream.")).toBe(
      "First prepare the pastry cream.",
    );
    expect(stripDirectionStepLabel("1) Make the batter.")).toBe("Make the batter.");
    expect(stripDirectionStepLabel("1. Beat in egg.")).toBe("Beat in egg.");
    expect(stripDirectionStepLabel("1 - Combine wet ingredients.")).toBe(
      "Combine wet ingredients.",
    );
    expect(stripDirectionStepLabel("Step 4: Bake until set.")).toBe(
      "Bake until set.",
    );
  });
});
