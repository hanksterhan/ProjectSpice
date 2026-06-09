import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

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

  it("uses extracted static images instead of committed Paprika photo payloads", () => {
    for (const recipe of chilledDessertPaprikaRecipes) {
      expect(Object.keys(recipe)).not.toContain("photo_data");
      expect(Object.keys(recipe)).not.toContain("photo");
      expect(Object.keys(recipe)).not.toContain("photos");
      expect(recipe.imageUrl).toMatch(
        /^https:\/\/spice\.h6nk\.dev\/recipe-images\/chilled-desserts\/.+\.jpg$/,
      );
    }
  });

  it("keeps a static image asset for every chilled dessert recipe", () => {
    for (const recipe of chilledDessertPaprikaRecipes) {
      const imageName = recipe.imageUrl?.split("/").at(-1);

      expect(imageName).toBeTruthy();
      expect(
        existsSync(
          join(
            process.cwd(),
            "public/recipe-images/chilled-desserts",
            imageName ?? "",
          ),
        ),
      ).toBe(true);
    }
  });

  it("preserves the crisp Paprika square image assets", () => {
    for (const recipe of chilledDessertPaprikaRecipes) {
      const imageName = recipe.imageUrl?.split("/").at(-1);
      const imagePath = join(
        process.cwd(),
        "public/recipe-images/chilled-desserts",
        imageName ?? "",
      );
      const { height, width } = readJpegSize(readFileSync(imagePath));

      expect(width).toBe(280);
      expect(height).toBe(280);
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

function readJpegSize(buffer: Buffer): { height: number; width: number } {
  let offset = 2;

  while (offset < buffer.length) {
    if (buffer[offset] !== 0xff) {
      offset += 1;
      continue;
    }

    while (buffer[offset] === 0xff) {
      offset += 1;
    }

    const marker = buffer[offset];
    offset += 1;

    const length = buffer.readUInt16BE(offset);
    if (
      (marker >= 0xc0 && marker <= 0xc3) ||
      (marker >= 0xc5 && marker <= 0xc7) ||
      (marker >= 0xc9 && marker <= 0xcb) ||
      (marker >= 0xcd && marker <= 0xcf)
    ) {
      return {
        height: buffer.readUInt16BE(offset + 3),
        width: buffer.readUInt16BE(offset + 5),
      };
    }

    offset += length;
  }

  throw new Error("Unable to read JPEG dimensions");
}
