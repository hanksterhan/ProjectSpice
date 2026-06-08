import {
  createRecipeSlug,
  recipeDraftSchema,
  recipeSchema,
  type Recipe,
  type RecipeDraft,
} from "~/modules/recipe-domain";

export function serializeAiDraft(recipe: RecipeDraft): string {
  return JSON.stringify(recipe);
}

export function parseAiDraftJson(value: string): RecipeDraft {
  return recipeDraftSchema.parse(JSON.parse(value));
}

export function buildRecipeFromAiDraft({
  draftRecipe,
  now,
  createId = createRecipeId,
}: {
  draftRecipe: RecipeDraft;
  now: string;
  createId?: (title: string) => string;
}): Recipe {
  return recipeSchema.parse({
    ...recipeDraftSchema.parse(draftRecipe),
    id: createId(draftRecipe.title),
    source: {
      type: "ai",
      name: draftRecipe.source?.name ?? "ProjectSpice AI",
      url: draftRecipe.source?.url,
    },
    version: 1,
    createdAt: now,
    updatedAt: now,
  });
}

export function buildUpdatedRecipeFromAiDraft({
  draftRecipe,
  existingRecipe,
  now,
}: {
  draftRecipe: RecipeDraft;
  existingRecipe: Recipe;
  now: string;
}): Recipe {
  const parsedDraft = recipeDraftSchema.parse(draftRecipe);

  return recipeSchema.parse({
    ...parsedDraft,
    id: existingRecipe.id,
    favorite: parsedDraft.favorite ?? existingRecipe.favorite,
    rating: parsedDraft.rating ?? existingRecipe.rating,
    cookedDates: parsedDraft.cookedDates ?? existingRecipe.cookedDates,
    version: existingRecipe.version + 1,
    createdAt: existingRecipe.createdAt,
    updatedAt: now,
  });
}

function createRecipeId(title: string): string {
  const slug = createRecipeSlug(title) || "ai-recipe";
  const suffix = globalThis.crypto?.randomUUID?.().slice(0, 8) ?? Date.now().toString(36);

  return `${slug}-${suffix}`;
}
