import { describe, expect, it } from "vitest";

import { seedRecipes } from "~/modules/recipe-domain";
import {
  getRecipeDetailPath,
  getSeedRecipeById,
} from "~/modules/recipe-viewer/recipe-detail";

describe("recipe detail helpers", () => {
  it("finds a Paprika-derived seed recipe by id", () => {
    expect(getSeedRecipeById("classic-sundae-bombe")?.title).toBe(
      "Classic Sundae Bombe",
    );
  });

  it("returns undefined for an unknown seed recipe", () => {
    expect(getSeedRecipeById("not-a-recipe")).toBeUndefined();
  });

  it("builds stable detail paths for library links", () => {
    expect(getRecipeDetailPath(seedRecipes[0])).toBe("/recipes/classic-sundae-bombe");
  });
});
