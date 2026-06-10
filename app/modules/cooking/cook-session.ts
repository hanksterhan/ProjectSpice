import type { DirectionStep, Recipe } from "~/modules/recipe-domain";

export type CookSessionRecipeState = {
  recipeId: string;
  recipeVersion: number;
  activeStepId?: string;
  completedStepIds: string[];
  checkedIngredientIds: string[];
};

export type CookSessionState = {
  activeRecipeId: string;
  recipes: Record<string, CookSessionRecipeState>;
};

export type CookSessionStep = {
  id: string;
  recipeId: string;
  recipeTitle: string;
  sectionId: string;
  sectionTitle?: string;
  step: DirectionStep;
  stepIndex: number;
  totalSteps: number;
};

export type CookRecipeProgress = {
  completedSteps: number;
  totalSteps: number;
};

const storageKeyPrefix = "project-spice:cook-session";

export function parseCookRecipeIds(url: string | URL): string[] {
  const parsedUrl = typeof url === "string" ? new URL(url) : url;
  const ids = parsedUrl.searchParams
    .getAll("recipe")
    .concat(parsedUrl.searchParams.getAll("recipeIds"))
    .map((id) => id.trim())
    .filter(Boolean);

  return [...new Set(ids)];
}

export function getCookSessionHref(recipeIds: readonly string[]): string {
  const searchParams = new URLSearchParams();

  for (const recipeId of [...new Set(recipeIds)].filter(Boolean)) {
    searchParams.append("recipe", recipeId);
  }

  const query = searchParams.toString();

  return query ? `/cook?${query}` : "/cook";
}

export function createCookSessionStorageKey(recipes: readonly Recipe[]): string {
  const recipeVersions = recipes
    .map((recipe) => `${recipe.id}@${recipe.version}`)
    .sort()
    .join(",");

  return `${storageKeyPrefix}:${recipeVersions}`;
}

export function createInitialCookSessionState(recipes: readonly Recipe[]): CookSessionState {
  const firstRecipe = recipes[0];

  return {
    activeRecipeId: firstRecipe?.id ?? "",
    recipes: Object.fromEntries(
      recipes.map((recipe) => {
        const firstStep = flattenCookSessionSteps([recipe])[0];

        return [
          recipe.id,
          {
            recipeId: recipe.id,
            recipeVersion: recipe.version,
            activeStepId: firstStep?.id,
            completedStepIds: [],
            checkedIngredientIds: [],
          } satisfies CookSessionRecipeState,
        ];
      }),
    ),
  };
}

export function normalizeCookSessionState(
  recipes: readonly Recipe[],
  state: CookSessionState | undefined,
): CookSessionState {
  const initialState = createInitialCookSessionState(recipes);

  if (!state) {
    return initialState;
  }

  const recipeIds = new Set(recipes.map((recipe) => recipe.id));
  const nextRecipes: CookSessionState["recipes"] = {};

  for (const recipe of recipes) {
    const savedRecipeState = state.recipes[recipe.id];
    const recipeStepIds = new Set(
      flattenCookSessionSteps([recipe]).map((step) => step.id),
    );
    const ingredientIds = new Set(
      recipe.ingredients.flatMap((section) => section.items.map((item) => item.id)),
    );
    const initialRecipeState = initialState.recipes[recipe.id];

    nextRecipes[recipe.id] = {
      recipeId: recipe.id,
      recipeVersion: recipe.version,
      activeStepId: recipeStepIds.has(savedRecipeState?.activeStepId ?? "")
        ? savedRecipeState?.activeStepId
        : initialRecipeState?.activeStepId,
      completedStepIds:
        savedRecipeState?.completedStepIds.filter((stepId) => recipeStepIds.has(stepId)) ??
        [],
      checkedIngredientIds:
        savedRecipeState?.checkedIngredientIds.filter((ingredientId) =>
          ingredientIds.has(ingredientId),
        ) ?? [],
    };
  }

  return {
    activeRecipeId: recipeIds.has(state.activeRecipeId)
      ? state.activeRecipeId
      : initialState.activeRecipeId,
    recipes: nextRecipes,
  };
}

export function flattenCookSessionSteps(recipes: readonly Recipe[]): CookSessionStep[] {
  return recipes.flatMap((recipe) => {
    const steps = recipe.directions.flatMap((section) => section.steps);
    const totalSteps = steps.length;
    let stepIndex = 0;

    return recipe.directions.flatMap((section) =>
      section.steps.map((step) => {
        stepIndex += 1;

        return {
          id: createCookSessionStepId(recipe.id, section.id, step.id, stepIndex),
          recipeId: recipe.id,
          recipeTitle: recipe.title,
          sectionId: section.id,
          sectionTitle: section.title,
          step,
          stepIndex,
          totalSteps,
        };
      }),
    );
  });
}

export function getActiveCookStep(
  recipe: Recipe,
  recipeState: CookSessionRecipeState | undefined,
): CookSessionStep | undefined {
  const steps = flattenCookSessionSteps([recipe]);

  if (steps.length === 0) {
    return undefined;
  }

  const activeStep = steps.find((step) => step.id === recipeState?.activeStepId);

  if (activeStep) {
    return activeStep;
  }

  return getNextIncompleteCookStep(recipe, recipeState) ?? steps[0];
}

export function getNextIncompleteCookStep(
  recipe: Recipe,
  recipeState: CookSessionRecipeState | undefined,
): CookSessionStep | undefined {
  const completedStepIds = new Set(recipeState?.completedStepIds ?? []);

  return flattenCookSessionSteps([recipe]).find(
    (step) => !completedStepIds.has(step.id),
  );
}

export function getCookRecipeProgress(
  recipe: Recipe,
  recipeState: CookSessionRecipeState | undefined,
): CookRecipeProgress {
  const stepIds = new Set(flattenCookSessionSteps([recipe]).map((step) => step.id));

  return {
    completedSteps:
      recipeState?.completedStepIds.filter((stepId) => stepIds.has(stepId)).length ?? 0,
    totalSteps: stepIds.size,
  };
}

export function createCookSessionStepId(
  recipeId: string,
  sectionId: string,
  stepId: string,
  stepIndex: number,
): string {
  return `${recipeId}:${sectionId}:${stepIndex}:${stepId}`;
}
