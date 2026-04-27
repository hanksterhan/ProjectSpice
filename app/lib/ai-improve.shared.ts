// Client-safe AI improvement contracts and display helpers.

export interface RecipeInput {
  id: string;
  title: string;
  description: string | null;
  directionsText: string | null;
  notes: string | null;
  contentHash: string | null;
  ingredients: IngredientLine[];
}

export interface IngredientLine {
  sortOrder: number;
  groupName: string | null;
  quantityRaw: string | null;
  unitRaw: string | null;
  name: string;
  notes: string | null;
  isGroupHeader: boolean;
}

export interface ImprovedRecipe {
  title: string;
  description: string;
  ingredients: string[];
  directions: string;
  notes: string;
}

export interface RecipeDiff {
  title: { changed: boolean; original: string; improved: string };
  description: { changed: boolean; original: string; improved: string };
  ingredients: { changed: boolean; original: string[]; improved: string[] };
  directions: { changed: boolean; original: string; improved: string };
  notes: { changed: boolean; original: string; improved: string };
}

export function ingredientLineToText(ingredient: IngredientLine): string {
  return [
    ingredient.quantityRaw,
    ingredient.unitRaw,
    ingredient.name,
    ingredient.notes,
  ]
    .filter(Boolean)
    .join(" ");
}

export function recipeIngredientLines(recipe: RecipeInput): string[] {
  return recipe.ingredients
    .filter((ingredient) => !ingredient.isGroupHeader)
    .map(ingredientLineToText);
}

export function computeDiff(
  original: RecipeInput,
  improved: ImprovedRecipe
): RecipeDiff {
  const originalIngredients = recipeIngredientLines(original);

  return {
    title: {
      changed: original.title !== improved.title,
      original: original.title,
      improved: improved.title,
    },
    description: {
      changed: (original.description ?? "") !== improved.description,
      original: original.description ?? "",
      improved: improved.description,
    },
    ingredients: {
      changed:
        JSON.stringify(originalIngredients) !==
        JSON.stringify(improved.ingredients),
      original: originalIngredients,
      improved: improved.ingredients,
    },
    directions: {
      changed: (original.directionsText ?? "") !== improved.directions,
      original: original.directionsText ?? "",
      improved: improved.directions,
    },
    notes: {
      changed: (original.notes ?? "") !== improved.notes,
      original: original.notes ?? "",
      improved: improved.notes,
    },
  };
}
