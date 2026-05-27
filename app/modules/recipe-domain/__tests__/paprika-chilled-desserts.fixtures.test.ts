import { describe, expect, it } from "vitest";

import { chilledDessertPaprikaRecipes } from "../paprika-chilled-desserts.fixtures";
import { recipeSchema } from "../recipe.schema";

describe("chilledDessertPaprikaRecipes", () => {
  it("converts all Paprika recipes into canonical Project Spice recipes", () => {
    expect(chilledDessertPaprikaRecipes).toHaveLength(16);

    for (const recipe of chilledDessertPaprikaRecipes) {
      expect(recipeSchema.safeParse(recipe).success).toBe(true);
      expect(recipe.ingredients[0].items.length).toBeGreaterThan(0);
      expect(recipe.directions[0].steps.length).toBeGreaterThan(0);
      expect(recipe.source.type).toBe("imported");
    }
  });

  it("preserves the expected chilled dessert titles", () => {
    expect(chilledDessertPaprikaRecipes.map((recipe) => recipe.title)).toEqual([
      "Classic Sundae Bombe",
      "Coffee Stracciatella Semifreddo",
      "French 75 Jelly with Grapefruit",
      "Goat Milk Panna Cotta with Guava Sauce",
      "Grape Semifreddo",
      "Mango-Yogurt Mousse",
      "Marbled Mint Chocolate Mousse",
      "Melon Parfaits",
      "No-Bake Grapefruit Bars",
      "No-Bake Lime-Coconut Custards with Coconut Crumble",
      "No-Bake Strawberry Ricotta Cheesecake",
      "Persimmon Panna Cotta",
      "Pineapple & Coconut-Rum Sundaes",
      "Roasted Red Plum & Biscoff Icebox Cake",
      "Salty Brownie Ice Cream Sandwiches",
      "Tiramisu-y Icebox Cake",
    ]);
  });

  it("excludes Paprika photo payloads from committed canonical fixtures", () => {
    for (const recipe of chilledDessertPaprikaRecipes) {
      expect(Object.keys(recipe)).not.toContain("photo_data");
      expect(Object.keys(recipe)).not.toContain("photo");
      expect(Object.keys(recipe)).not.toContain("photos");
      expect(recipe).not.toHaveProperty("imageUrl");
    }
  });

  it("maps Paprika active and total time text into numeric minutes when present", () => {
    const mangoMousse = chilledDessertPaprikaRecipes.find(
      (recipe) => recipe.id === "mango-yogurt-mousse",
    );

    expect(mangoMousse?.times).toEqual({
      prepMinutes: 45,
      totalMinutes: 285,
    });
  });
});
