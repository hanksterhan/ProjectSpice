import { describe, expect, it } from "vitest";

import { validRecipeFixture } from "~/modules/recipe-domain";

import {
  buildRecipeFromEditorFormData,
  getExpectedRecipeVersion,
  parseRecipeEditorFormData,
} from "../recipe.form";

describe("recipe editor form actions", () => {
  it("parses nested editor form data and builds a new recipe", () => {
    const formData = createRecipeFormData();
    const parsedValues = parseRecipeEditorFormData(formData);

    expect(parsedValues.ingredientSections[0].items[0]).toMatchObject({
      id: "flour",
      raw: "2 cups flour",
      quantity: "2",
      unit: "cups",
      item: "flour",
      optional: false,
    });
    expect(parsedValues.directionSections[0].steps[0]).toMatchObject({
      id: "mix",
      text: "Mix the batter.",
      timerMinutes: "5",
      ingredientRefsText: "flour",
    });

    const result = buildRecipeFromEditorFormData({
      formData,
      baseDraft: validRecipeFixture,
      now: "2026-05-28T08:00:00.000Z",
    });

    expect(result.ok).toBe(true);

    if (result.ok) {
      expect(result.recipe).toMatchObject({
        title: "Test Cake",
        version: 1,
        createdAt: "2026-05-28T08:00:00.000Z",
        updatedAt: "2026-05-28T08:00:00.000Z",
      });
      expect(result.recipe.id).toMatch(/^test-cake-/);
      expect(result.recipe.directions[0].steps[0]).toMatchObject({
        order: 1,
        timerMinutes: 5,
        ingredientRefs: ["flour"],
      });
    }
  });

  it("builds an updated recipe with incremented version and expected version", () => {
    const formData = createRecipeFormData();
    formData.set("expectedVersion", "1");

    const result = buildRecipeFromEditorFormData({
      formData,
      baseDraft: validRecipeFixture,
      existingRecipe: validRecipeFixture,
      now: "2026-05-28T09:00:00.000Z",
    });

    expect(getExpectedRecipeVersion(formData)).toBe(1);
    expect(result.ok).toBe(true);

    if (result.ok) {
      expect(result.recipe).toMatchObject({
        id: validRecipeFixture.id,
        version: 2,
        createdAt: validRecipeFixture.createdAt,
        updatedAt: "2026-05-28T09:00:00.000Z",
      });
    }
  });

  it("returns validation errors for invalid recipe editor payloads", () => {
    const formData = createRecipeFormData();
    formData.set("title", "");
    formData.set("directionSections.0.steps.0.text", "");

    const result = buildRecipeFromEditorFormData({
      formData,
      baseDraft: validRecipeFixture,
      now: "2026-05-28T08:00:00.000Z",
    });

    expect(result).toMatchObject({
      ok: false,
      errors: expect.arrayContaining(["Add a recipe title.", "Add direction text."]),
    });
  });
});

function createRecipeFormData() {
  const formData = new FormData();

  formData.set("title", "Test Cake");
  formData.set("description", "A testable cake.");
  formData.set("imageUrl", "");
  formData.set("tagsText", "dessert, test");
  formData.set("prepMinutes", "10");
  formData.set("cookMinutes", "20");
  formData.set("totalMinutes", "30");
  formData.set("yieldQuantity", "8");
  formData.set("yieldUnit", "slices");
  formData.set("yieldNotes", "");
  formData.set("notesText", "Cool before serving.");
  formData.set("sourceName", "Test kitchen");
  formData.set("sourceUrl", "");
  formData.set("ingredientSections.0.id", "batter");
  formData.set("ingredientSections.0.title", "Batter");
  formData.set("ingredientSections.0.items.0.id", "flour");
  formData.set("ingredientSections.0.items.0.raw", "2 cups flour");
  formData.set("ingredientSections.0.items.0.quantity", "2");
  formData.set("ingredientSections.0.items.0.unit", "cups");
  formData.set("ingredientSections.0.items.0.item", "flour");
  formData.set("ingredientSections.0.items.0.preparation", "");
  formData.set("directionSections.0.id", "bake");
  formData.set("directionSections.0.title", "Bake");
  formData.set("directionSections.0.steps.0.id", "mix");
  formData.set("directionSections.0.steps.0.text", "Mix the batter.");
  formData.set("directionSections.0.steps.0.timerMinutes", "5");
  formData.set("directionSections.0.steps.0.ingredientRefsText", "flour");

  return formData;
}
