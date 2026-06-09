import { chilledDessertPaprikaRecipes } from "./paprika-chilled-desserts.fixtures";
import { joshuaWeissmanPaprikaRecipes } from "./joshua-weissman.fixtures";
import { recipeSchema } from "./recipe.schema";
import type { IngredientSection, Recipe } from "./recipe.types";

const seedRecipeImageUrls = {
  "classic-sundae-bombe": "https://spice.h6nk.dev/mock-images/classic-sundae-bombe.jpg",
  "coffee-stracciatella-semifreddo":
    "https://spice.h6nk.dev/mock-images/coffee-stracciatella-semifreddo.jpg",
  "french-75-jelly-with-grapefruit":
    "https://spice.h6nk.dev/mock-images/french-75-jelly-with-grapefruit.jpg",
  "mango-yogurt-mousse": "https://spice.h6nk.dev/mock-images/mango-yogurt-mousse.jpg",
  "no-bake-grapefruit-bars":
    "https://spice.h6nk.dev/mock-images/no-bake-grapefruit-bars.jpg",
  "no-bake-strawberry-ricotta-cheesecake":
    "https://spice.h6nk.dev/mock-images/no-bake-strawberry-ricotta-cheesecake.jpg",
  "pineapple-coconut-rum-sundaes":
    "https://spice.h6nk.dev/mock-images/pineapple-coconut-rum-sundaes.jpg",
  "tiramisu-y-icebox-cake":
    "https://spice.h6nk.dev/mock-images/tiramisu-y-icebox-cake.jpg",
} satisfies Record<string, string>;

const seedRecipeIds = Object.keys(seedRecipeImageUrls) as Array<
  keyof typeof seedRecipeImageUrls
>;
const paprikaRecipes: readonly Recipe[] = chilledDessertPaprikaRecipes;

const chilledDessertSeedRecipes = seedRecipeIds.map((id, index) => {
  const recipe = paprikaRecipes.find((candidate) => candidate.id === id);

  if (!recipe) {
    throw new Error(`Missing seed recipe source fixture: ${id}`);
  }

  return recipeSchema.parse({
    ...recipe,
    imageUrl: seedRecipeImageUrls[id],
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
