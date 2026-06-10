import { describe, expect, it } from "vitest";

import {
  createCookSessionStorageKey,
  createInitialCookSessionState,
  flattenCookSessionSteps,
  getActiveCookStep,
  getCookRecipeProgress,
  getNextIncompleteCookStep,
  parseCookRecipeIds,
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
    const recipeState = {
      ...state.recipes[validRecipeFixture.id],
      activeStepId: "missing-step",
      completedStepIds: ["mix-sauce"],
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
    const recipeState = {
      ...state.recipes[validRecipeFixture.id],
      completedStepIds: ["mix-sauce", "brown-chicken", "not-real"],
    };

    expect(getCookRecipeProgress(validRecipeFixture, recipeState)).toEqual({
      completedSteps: 2,
      totalSteps: 3,
    });
  });
});
