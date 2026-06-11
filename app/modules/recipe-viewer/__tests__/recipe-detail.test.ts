import { describe, expect, it } from "vitest";

import { seedRecipes } from "~/modules/recipe-domain/seed-recipes.fixtures";
import {
  getRecipeDetailPath,
  getRecipeEditPath,
} from "~/modules/recipe-viewer/recipe-detail";

describe("recipe detail helpers", () => {
  it("builds stable detail paths for library links", () => {
    expect(getRecipeDetailPath(seedRecipes[0])).toBe("/recipes/classic-sundae-bombe");
  });

  it("builds absolute edit paths for shell actions", () => {
    expect(getRecipeEditPath({ id: "bhar-shawarma-djej-chicken" })).toBe(
      "/recipes/bhar-shawarma-djej-chicken/edit",
    );
  });
});
