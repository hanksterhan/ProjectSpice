import type { Recipe, RecipeDraft } from "~/modules/recipe-domain";

import type { RecipeEditorFormValues } from "./recipe-editor.schema";

export function getRecipeEditorDefaults(
  recipe: Recipe | RecipeDraft,
): RecipeEditorFormValues {
  return {
    title: recipe.title,
    description: recipe.description ?? "",
    imageUrl: recipe.imageUrl ?? "",
    tagsText: recipe.tags.join(", "),
    favorite: recipe.favorite ?? false,
    rating: recipe.rating?.toString() ?? "",
    prepMinutes: recipe.times?.prepMinutes?.toString() ?? "",
    cookMinutes: recipe.times?.cookMinutes?.toString() ?? "",
    totalMinutes: recipe.times?.totalMinutes?.toString() ?? "",
    yieldQuantity: recipe.yield?.quantity?.toString() ?? "",
    yieldUnit: recipe.yield?.unit ?? "",
    yieldNotes: recipe.yield?.notes ?? "",
    notesText: recipe.notes?.join("\n") ?? "",
    sourceType: recipe.source?.type ?? "manual",
    sourceName: recipe.source?.name ?? "",
    sourceUrl: recipe.source?.url ?? "",
    ingredientSections: recipe.ingredients.map((section) => ({
      id: section.id,
      title: section.title ?? "",
      itemsText: section.items.map((item) => item.raw).join("\n"),
      items: section.items.map((item) => ({
        id: item.id,
        raw: item.raw,
        quantity: item.quantity?.toString() ?? "",
        unit: item.unit ?? "",
        item: item.item,
        preparation: item.preparation ?? "",
        optional: item.optional ?? false,
      })),
    })),
    directionSections: recipe.directions.map((section) => ({
      id: section.id,
      title: section.title ?? "",
      stepsText: section.steps
        .slice()
        .sort((firstStep, secondStep) => firstStep.order - secondStep.order)
        .map((step) => step.text)
        .join("\n\n"),
      steps: section.steps
        .slice()
        .sort((firstStep, secondStep) => firstStep.order - secondStep.order)
        .map((step) => ({
          id: step.id,
          text: step.text,
          timerMinutes: step.timerMinutes?.toString() ?? "",
          ingredientRefsText: step.ingredientRefs?.join(", ") ?? "",
        })),
    })),
  };
}

export function getRecipeEditorBaseDraft(recipe: Recipe | RecipeDraft): RecipeDraft {
  return {
    title: recipe.title,
    description: recipe.description,
    yield: recipe.yield,
    times: recipe.times,
    imageUrl: recipe.imageUrl,
    ingredients: recipe.ingredients,
    directions: recipe.directions,
    notes: recipe.notes,
    source: recipe.source ?? { type: "manual" },
    tags: recipe.tags,
    favorite: recipe.favorite,
    rating: recipe.rating,
    cookedDates: recipe.cookedDates,
  };
}
