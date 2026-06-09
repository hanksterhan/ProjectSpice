import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import {
  extractedMyPaprikaImageTitles,
  myPaprikaRecipes,
  skippedMyPaprikaDuplicateRecipeTitles,
  skippedMyPaprikaImageTitles,
  skippedMyPaprikaInvalidRecipeTitles,
} from "../paprika-my-recipes.fixtures";
import { recipeSchema } from "../recipe.schema";

describe("myPaprikaRecipes", () => {
  it("converts non-duplicate Paprika recipes into canonical Project Spice recipes", () => {
    expect(myPaprikaRecipes).toHaveLength(635);
    expect(skippedMyPaprikaDuplicateRecipeTitles).toHaveLength(204);
    expect(skippedMyPaprikaInvalidRecipeTitles).toEqual([]);

    for (const recipe of myPaprikaRecipes) {
      expect(recipeSchema.safeParse(recipe).success).toBe(true);
      expect(recipe.ingredients[0].items.length).toBeGreaterThan(0);
      expect(recipe.directions[0].steps.length).toBeGreaterThan(0);
      expect(recipe.source?.type).toBe("imported");
    }
  });

  it("keeps duplicate exports out of the personal fixture", () => {
    expect(myPaprikaRecipes.map((recipe) => recipe.id)).not.toContain(
      "51-hour-focaccia",
    );
    expect(myPaprikaRecipes.map((recipe) => recipe.id)).not.toContain(
      "classic-sundae-bombe",
    );
  });

  it("does not invent Paprika labels for personal recipes without an export source", () => {
    const sourceLessImportedRecipes = myPaprikaRecipes.filter(
      (recipe) =>
        recipe.source?.type === "imported" &&
        !recipe.source.name &&
        !recipe.source.url,
    );

    expect(sourceLessImportedRecipes).toHaveLength(14);
    expect(myPaprikaRecipes.some((recipe) => recipe.source?.name === "Paprika")).toBe(
      false,
    );
    expect(
      myPaprikaRecipes.some((recipe) =>
        (recipe.tags as readonly string[]).includes("Paprika"),
      ),
    ).toBe(false);
  });

  it("uses available Paprika photos even when they are low resolution", () => {
    const imageBackedRecipes = myPaprikaRecipes.filter(
      (recipe) => "imageUrl" in recipe,
    );

    expect(imageBackedRecipes).toHaveLength(584);
    expect(extractedMyPaprikaImageTitles).toHaveLength(584);
    expect(skippedMyPaprikaImageTitles).toHaveLength(51);

    for (const recipe of imageBackedRecipes) {
      const imageName = recipe.imageUrl?.split("/").at(-1);
      const imagePath = join(
        process.cwd(),
        "public/recipe-images/my-recipes",
        imageName ?? "",
      );

      expect(recipe.imageUrl).toMatch(
        /^https:\/\/spice\.h6nk\.dev\/recipe-images\/my-recipes\/.+\.jpg$/,
      );
      expect(existsSync(imagePath)).toBe(true);
      expect(readJpegSize(readFileSync(imagePath))).toEqual(
        expect.objectContaining({
          height: expect.any(Number),
          width: expect.any(Number),
        }),
      );
    }
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

    if (
      marker >= 0xc0 &&
      marker <= 0xcf &&
      marker !== 0xc4 &&
      marker !== 0xc8 &&
      marker !== 0xcc
    ) {
      return {
        height: buffer.readUInt16BE(offset + 3),
        width: buffer.readUInt16BE(offset + 5),
      };
    }

    offset += segmentLength;
  }

  throw new Error("Could not read JPEG dimensions");
}
