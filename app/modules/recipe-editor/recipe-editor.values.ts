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
    prepMinutes: recipe.times?.prepMinutes?.toString() ?? "",
    cookMinutes: recipe.times?.cookMinutes?.toString() ?? "",
    totalMinutes: recipe.times?.totalMinutes?.toString() ?? "",
    yieldQuantity: recipe.yield?.quantity?.toString() ?? "",
    yieldUnit: recipe.yield?.unit ?? "",
    yieldNotes: recipe.yield?.notes ?? "",
    notesText: recipe.notes?.join("\n") ?? "",
    sourceName: recipe.source?.name ?? "",
    sourceUrl: recipe.source?.url ?? "",
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
  };
}
