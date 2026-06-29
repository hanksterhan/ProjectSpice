import { describe, expect, it } from "vitest";

import { seedRecipes } from "~/modules/recipe-domain/seed-recipes.fixtures";
import { parseRecipeLibraryQuery } from "~/modules/library/recipe-library";
import {
  getRecipeBrowseDetailPath,
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

  it("preserves browse filters on detail paths", () => {
    const query = parseRecipeLibraryQuery(
      "https://spice.local/?q=lime&tag=chilled&sort=title&dir=desc&view=list",
    );

    expect(getRecipeBrowseDetailPath(seedRecipes[0], query)).toBe(
      "/recipes/classic-sundae-bombe?q=lime&tag=chilled&sort=title&dir=desc&view=list",
    );
  });

  it("preserves active recipe lenses on browse paths", () => {
    const query = parseRecipeLibraryQuery("https://spice.local/?favorite=1");

    expect(getRecipeBrowseDetailPath(seedRecipes[0], query, "weeknight")).toBe(
      "/recipes/classic-sundae-bombe?favorite=1&lens=weeknight",
    );
  });
});
