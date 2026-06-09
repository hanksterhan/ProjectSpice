import { describe, expect, it } from "vitest";

import { recipeSchema } from "../recipe.schema";
import { seedRecipes } from "../seed-recipes.fixtures";

describe("seedRecipes", () => {
  it("provides the local no-login recipe library seed set", () => {
    expect(seedRecipes).toHaveLength(833);
  });

  it("keeps every seed recipe in the canonical schema", () => {
    for (const recipe of seedRecipes) {
      expect(recipeSchema.safeParse(recipe).success).toBe(true);
      expect(recipe.source?.type).toBe("imported");
    }
  });

  it("uses only well-formed local static image URLs when seed recipes have images", () => {
    const imageBackedRecipes = seedRecipes.filter((recipe) => recipe.imageUrl);

    expect(imageBackedRecipes).toHaveLength(782);

    for (const recipe of imageBackedRecipes) {
      expect(recipe.imageUrl).toMatch(/^https:\/\/spice\.h6nk\.dev\//);
    }
  });

  it("preserves varied recipe content for library and viewer work", () => {
    expect(new Set(seedRecipes.map((recipe) => recipe.id)).size).toBe(833);
    expect(seedRecipes.some((recipe) => recipe.ingredients.length > 1)).toBe(true);
    expect(seedRecipes.some((recipe) => recipe.directions[0].steps.length >= 10)).toBe(
      true,
    );
    expect(seedRecipes.some((recipe) => recipe.tags.includes("chilled dessert"))).toBe(
      true,
    );
    expect(seedRecipes.some((recipe) => recipe.source?.name?.startsWith("Joshua Weissman - "))).toBe(true);
    expect(seedRecipes.some((recipe) => recipe.times?.totalMinutes)).toBe(true);
  });
});
