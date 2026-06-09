import { chilledDessertPaprikaRecipes } from "./paprika-chilled-desserts.fixtures";
import { myPaprikaRecipes } from "./paprika-my-recipes.fixtures";
import { joshuaWeissmanPaprikaRecipes } from "./joshua-weissman.fixtures";
import { recipeSchema } from "./recipe.schema";
import type { IngredientSection, Recipe } from "./recipe.types";

const seedRecipeIds = [
  "classic-sundae-bombe",
  "coffee-stracciatella-semifreddo",
  "french-75-jelly-with-grapefruit",
  "mango-yogurt-mousse",
  "no-bake-grapefruit-bars",
  "no-bake-strawberry-ricotta-cheesecake",
  "pineapple-coconut-rum-sundaes",
  "tiramisu-y-icebox-cake",
] as const;
const paprikaRecipes: readonly Recipe[] = chilledDessertPaprikaRecipes;

const chilledDessertSeedRecipes = seedRecipeIds.map((id, index) => {
  const recipe = paprikaRecipes.find((candidate) => candidate.id === id);

  if (!recipe) {
    throw new Error(`Missing seed recipe source fixture: ${id}`);
  }

  return recipeSchema.parse({
    ...recipe,
    ingredients: withReadableIngredientSections(recipe, index),
    directions: recipe.directions.map((section) => ({
      ...section,
      title: section.title ?? "Directions",
    })),
    tags: [...new Set([...recipe.tags, "seed", "chilled dessert"])],
  });
}) satisfies Recipe[];

export const seedRecipes = [
  ...chilledDessertSeedRecipes,
  ...joshuaWeissmanPaprikaRecipes.map((recipe) => recipeSchema.parse(recipe)),
  ...myPaprikaRecipes.map((recipe) => recipeSchema.parse(recipe)),
] satisfies Recipe[];

function withReadableIngredientSections(
  recipe: Recipe,
  index: number,
): IngredientSection[] {
  const [section] = recipe.ingredients;

  if (!section || section.items.length < 8 || index % 2 === 1) {
    return recipe.ingredients.map((ingredientSection) => ({
      ...ingredientSection,
      title: ingredientSection.title ?? "Ingredients",
    }));
  }

  const splitIndex = Math.ceil(section.items.length / 2);

  return [
    {
      ...section,
      id: `${section.id}-base`,
      title: "Base",
      items: section.items.slice(0, splitIndex),
    },
    {
      ...section,
      id: `${section.id}-finish`,
      title: "Finish",
      items: section.items.slice(splitIndex),
    },
  ];
}
