import { existsSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import {
  joshuaWeissmanPaprikaRecipes,
  skippedJoshuaWeissmanPaprikaRecipeTitles,
} from "../joshua-weissman.fixtures";
import { recipeSchema } from "../recipe.schema";

describe("joshuaWeissmanPaprikaRecipes", () => {
  it("converts photo-backed Paprika recipes into canonical Project Spice recipes", () => {
    expect(joshuaWeissmanPaprikaRecipes).toHaveLength(190);
    expect(skippedJoshuaWeissmanPaprikaRecipeTitles).toEqual([
      "dashi",
      "pho broth",
    ]);

    for (const recipe of joshuaWeissmanPaprikaRecipes) {
      expect(recipeSchema.safeParse(recipe).success).toBe(true);
      expect(recipe.ingredients[0].items.length).toBeGreaterThan(0);
      expect(recipe.directions[0].steps.length).toBeGreaterThan(0);
      expect(recipe.source.type).toBe("imported");
      expect(recipe.source.name).toMatch(/^Joshua Weissman - /);
      expect(recipe.tags).toEqual([]);
      expect(recipe.imageUrl).toMatch(
        /^https:\/\/spice\.h6nk\.dev\/recipe-images\/joshua-weissman\/.+\.jpg$/,
      );
    }
  });

  it("keeps a static image asset for every migrated recipe", () => {
    for (const recipe of joshuaWeissmanPaprikaRecipes) {
      const imageName = recipe.imageUrl?.split("/").at(-1);

      expect(imageName).toBeTruthy();
      expect(
        existsSync(
          join(
            process.cwd(),
            "public/recipe-images/joshua-weissman",
            imageName ?? "",
          ),
        ),
      ).toBe(true);
    }
  });

  it("preserves expected Joshua Weissman cookbook coverage", () => {
    expect(
      joshuaWeissmanPaprikaRecipes.filter((recipe) =>
        recipe.source.name === "Joshua Weissman - An Unapologetic Cookbook",
      ),
    ).toHaveLength(112);
    expect(
      joshuaWeissmanPaprikaRecipes.filter((recipe) =>
        recipe.source.name === "Joshua Weissman - Texture Over Taste",
      ),
    ).toHaveLength(78);
  });
});
