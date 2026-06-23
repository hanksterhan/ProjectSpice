import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

import {
  extractCookbookContentFromDocuments,
  extractCookbookEpub,
  extractCookbookEpubImageAsset,
} from "../cookbook-epub.extractor";
import type { ExtractedCookbookRecipe } from "../cookbook-epub.types";

const babishPath = resolve(
  "zips/Binging with Babish _ 100 recipes recreated from your -- Rea, Andrew;Sung, Evan.epub",
);
const healthyDrinksPath = resolve(
  "zips/The complete guide to healthy drinks _ powerhouse -- America's Test Kitchen (Firm) -- New York, 2022 -- America's Test Kitchen.epub",
);

describe("extractCookbookEpub", () => {
  it("extracts Babish recipes with caption-linked and inline images", () => {
    const epub = readFileSync(babishPath);
    const extraction = extractCookbookEpub(epub);

    expect(extraction.metadata.title).toBe("Binging with Babish");
    expect(extraction.recipes.length).toBeGreaterThan(80);

    const philly = findRecipe(extraction.recipes, "Philly Cheesesteak Sandwiches");
    expect(philly?.draftRecipe.yield?.notes).toBe("Makes 2");
    expect(philly?.draftRecipe.ingredients[0].items).toHaveLength(8);
    expect(philly?.draftRecipe.directions[0].steps).toHaveLength(3);
    expect(philly?.images.some((image) => image.epubPath.endsWith("p036.jpg"))).toBe(
      true,
    );

    const pizzaSauce = findRecipe(extraction.recipes, "Pizza Sauce");
    expect(pizzaSauce?.images.some((image) => image.epubPath.endsWith("p034.jpg"))).toBe(
      true,
    );
  });

  it("extracts healthy drinks recipes and technique sections", () => {
    const epub = readFileSync(healthyDrinksPath);
    const extraction = extractCookbookEpub(epub);

    expect(extraction.metadata.title).toBe("The Complete Guide to Healthy Drinks");
    expect(extraction.recipes.length).toBeGreaterThan(95);
    expect(extraction.techniques.length).toBeGreaterThan(12);
    expect(
      extraction.techniques.some((technique) => technique.title === "blenders"),
    ).toBe(false);

    const fruitSmoothie = findRecipe(extraction.recipes, "simple fruit smoothie");
    expect(fruitSmoothie?.draftRecipe.ingredients[0].items[0].raw).toContain(
      "frozen blueberries",
    );
    expect(fruitSmoothie?.draftRecipe.directions[0].steps[0].text).toContain(
      "add all ingredients to blender",
    );
    expect(
      fruitSmoothie?.images.some((image) =>
        image.epubPath.includes("Reference_Page_021_Image_0001.jpg"),
      ),
    ).toBe(true);

    const milkKefir = findRecipe(extraction.recipes, "milk kefir");
    expect(milkKefir?.images[0]).toMatchObject({
      epubPath: expect.stringContaining("Reference_Page_227_Image_0001.jpg"),
      pageNumber: 227,
    });
    expect(milkKefir?.draftRecipe.variations?.map((variation) => variation.title)).toEqual([
      "milk kefir with vanilla",
      "milk kefir with maple and cinnamon",
      "milk kefir with fruit preserves",
    ]);
    expect(findRecipe(extraction.recipes, "milk kefir with vanilla")).toBeUndefined();
    expect(milkKefir?.images.some((image) => image.epubPath.includes("Page_214"))).toBe(
      false,
    );

    const tepache = findRecipe(extraction.recipes, "tepache");
    expect(tepache?.images[0]).toMatchObject({
      epubPath: expect.stringContaining("Reference_Page_224_Image_0001.jpg"),
      pageNumber: 224,
    });

    const kombucha = findRecipe(extraction.recipes, "kombucha");
    expect(kombucha?.images[0]).toMatchObject({
      epubPath: expect.stringContaining("Reference_Page_229_Image_"),
      pageNumber: 229,
    });
    expect(kombucha?.images.some((image) => image.epubPath.includes("Page_vi"))).toBe(
      false,
    );
    expect(
      kombucha?.draftRecipe.variations?.some(
        (variation) => variation.title === "sparkling mixed berry kombucha",
      ),
    ).toBe(true);
    expect(findRecipe(extraction.recipes, "sparkling mixed berry kombucha")).toBeUndefined();

    const blendingTechnique = extraction.techniques.find((technique) =>
      technique.title.toLowerCase().includes("best blending techniques"),
    );
    expect(blendingTechnique?.body.join(" ")).toContain("ORDER IS VERY IMPORTANT");
    expect(
      extraction.techniques.some((technique) => technique.title === "best practices"),
    ).toBe(false);
    expect(
      extraction.techniques.some(
        (technique) => technique.title === "kombucha best practices",
      ),
    ).toBe(true);
    expect(
      extraction.techniques.some((technique) => technique.title === "tea brewing"),
    ).toBe(true);
    expect(
      extraction.techniques.some(
        (technique) => technique.title === "making your first batch of kombucha",
      ),
    ).toBe(true);

    const teaTemperatures = extraction.techniques.find((technique) =>
      technique.title.toLowerCase().includes("tea, times"),
    );
    const teaTable = teaTemperatures?.blocks.find((block) => block.type === "table");
    expect(teaTemperatures?.type).toBe("table");
    expect(teaTable).toMatchObject({
      type: "table",
      headers: ["TEA TYPE", "TEMPERATURE", "STEEP TIME", "NOTES"],
    });
    expect(
      teaTable?.rows.some((row) => row[0]?.includes("Earl Grey tea")),
    ).toBe(true);
  });

  it("can extract image bytes by EPUB path", () => {
    const epub = readFileSync(babishPath);
    const asset = extractCookbookEpubImageAsset(epub, "OPS/image/p036.jpg");

    expect(asset.mediaType).toBe("image/jpeg");
    expect(asset.data.byteLength).toBeGreaterThan(100_000);
  });
});

describe("extractCookbookContentFromDocuments", () => {
  it("detects generic cookbook recipe markup outside the sample EPUBs", () => {
    const extraction = extractCookbookContentFromDocuments({
      metadata: { title: "Tiny Test Cookbook" },
      documents: [
        {
          path: "book/chapter.xhtml",
          spineIndex: 0,
          html: `
            <html><body>
              <h2 id="cream-biscuits">Cream Biscuits</h2>
              <p class="yield">Makes 8 biscuits</p>
              <ul>
                <li>2 cups all-purpose flour</li>
                <li>1 tablespoon baking powder</li>
                <li>1 1/2 cups heavy cream</li>
              </ul>
              <p class="method">Stir dry ingredients together. Add cream and fold until a shaggy dough forms.</p>
              <p class="method">Pat out, cut into rounds, and bake until golden, about 15 minutes.</p>
              <h2>How to Whip Cream</h2>
              <p>Chill the bowl and whisk before whipping cream for better volume.</p>
            </body></html>
          `,
        },
      ],
      images: [],
    });

    expect(extraction.recipes).toHaveLength(1);
    expect(extraction.recipes[0].draftRecipe.title).toBe("Cream Biscuits");
    expect(extraction.recipes[0].draftRecipe.ingredients[0].items).toHaveLength(3);
    expect(extraction.techniques[0].title).toBe("How to Whip Cream");
  });
});

function findRecipe(recipes: ExtractedCookbookRecipe[], title: string) {
  return recipes.find(
    (recipe) => recipe.draftRecipe.title.toLowerCase() === title.toLowerCase(),
  );
}
