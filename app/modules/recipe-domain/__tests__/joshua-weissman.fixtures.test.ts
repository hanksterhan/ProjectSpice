import { existsSync, readFileSync } from "node:fs";
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

  it("uses large Paprika photo assets instead of 280px thumbnails", () => {
    for (const recipe of joshuaWeissmanPaprikaRecipes) {
      const imageName = recipe.imageUrl?.split("/").at(-1);
      const imagePath = join(
        process.cwd(),
        "public/recipe-images/joshua-weissman",
        imageName ?? "",
      );
      const { height, width } = readJpegSize(readFileSync(imagePath));

      expect(width).toBeGreaterThan(280);
      expect(height).toBeGreaterThan(280);
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

    if (marker === 0xd8 || marker === 0xd9) {
      continue;
    }

    const segmentLength = buffer.readUInt16BE(offset);

    if (marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc) {
      return {
        height: buffer.readUInt16BE(offset + 3),
        width: buffer.readUInt16BE(offset + 5),
      };
    }

    offset += segmentLength;
  }

  throw new Error("Could not read JPEG dimensions");
}
