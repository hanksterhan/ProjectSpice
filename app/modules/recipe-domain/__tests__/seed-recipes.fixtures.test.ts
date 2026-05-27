import { describe, expect, it } from "vitest";

import { recipeSchema } from "../recipe.schema";
import { seedRecipes } from "../seed-recipes.fixtures";

describe("seedRecipes", () => {
  it("provides 6-10 realistic no-login recipe seeds", () => {
    expect(seedRecipes.length).toBeGreaterThanOrEqual(6);
    expect(seedRecipes.length).toBeLessThanOrEqual(10);
    expect(seedRecipes).toHaveLength(8);
  });

  it("keeps every seed recipe in the canonical schema with mock image URLs", () => {
    for (const recipe of seedRecipes) {
      expect(recipeSchema.safeParse(recipe).success).toBe(true);
      expect(recipe.imageUrl).toMatch(/^https:\/\/spice\.h6nk\.dev\/mock-images\//);
      expect(recipe.source?.type).toBe("imported");
    }
  });

  it("preserves varied recipe content for library and viewer work", () => {
    expect(new Set(seedRecipes.map((recipe) => recipe.title)).size).toBe(8);
    expect(seedRecipes.some((recipe) => recipe.ingredients.length > 1)).toBe(true);
    expect(seedRecipes.some((recipe) => recipe.directions[0].steps.length >= 10)).toBe(
      true,
    );
    expect(seedRecipes.every((recipe) => recipe.tags.includes("chilled dessert"))).toBe(
      true,
    );
    expect(seedRecipes.every((recipe) => recipe.times?.totalMinutes)).toBe(true);
  });
});
