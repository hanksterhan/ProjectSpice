import { recipeDraftSchema } from "./recipe.schema";
import type {
  DirectionSection,
  DirectionStep,
  IngredientSection,
  RecipeDraft,
} from "./recipe.types";

export function moveRecipeSection<T extends IngredientSection | DirectionSection>(
  sections: readonly T[],
  fromIndex: number,
  toIndex: number,
): T[] {
  if (
    fromIndex < 0 ||
    toIndex < 0 ||
    fromIndex >= sections.length ||
    toIndex >= sections.length ||
    fromIndex === toIndex
  ) {
    return [...sections];
  }

  const nextSections = [...sections];
  const [section] = nextSections.splice(fromIndex, 1);
  nextSections.splice(toIndex, 0, section);

  return nextSections;
}

export function normalizeDirectionSteps(
  steps: readonly DirectionStep[],
): DirectionStep[] {
  return [...steps]
    .sort((firstStep, secondStep) => firstStep.order - secondStep.order)
    .map((step, index) => ({
      ...step,
      order: index + 1,
    }));
}

export function normalizeDirectionSections(
  sections: readonly DirectionSection[],
): DirectionSection[] {
  return sections.map((section) => ({
    ...section,
    steps: normalizeDirectionSteps(section.steps),
  }));
}

export function createEmptyRecipeDraft(
  overrides: Partial<RecipeDraft> = {},
): RecipeDraft {
  return recipeDraftSchema.parse({
    title: "Untitled Recipe",
    ingredients: [
      {
        id: "ingredients",
        items: [
          {
            id: "ingredient-1",
            raw: "Ingredient",
            item: "Ingredient",
          },
        ],
      },
    ],
    directions: [
      {
        id: "directions",
        steps: [
          {
            id: "step-1",
            order: 1,
            text: "Add a step.",
          },
        ],
      },
    ],
    tags: [],
    source: {
      type: "manual",
    },
    ...overrides,
  });
}
