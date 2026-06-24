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
const saladLabPath = resolve(
  "zips/The Salad Lab_ Whisk, Toss, Enjoy! _ Recipes for Making -- Darlene Schrijver.epub",
);

describe("extractCookbookEpub", () => {
  it("extracts Babish recipes with caption-linked and inline images", () => {
    const epub = readFileSync(babishPath);
    const extraction = extractCookbookEpub(epub);

    expect(extraction.metadata.title).toBe("Binging with Babish");
    expect(extraction.recipes.length).toBeGreaterThan(80);
    expect(
      extraction.recipes.flatMap((recipe) => recipe.images).some(
        (image) => image.role === "nearby",
      ),
    ).toBe(false);
    const primaryImages = extraction.recipes
      .map((recipe) => recipe.images[0]?.epubPath)
      .filter((imagePath): imagePath is string => imagePath !== undefined);
    expect(new Set(primaryImages).size).toBe(primaryImages.length);

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

    const meatballs = findRecipe(extraction.recipes, "Meatballs");
    expect(meatballs?.images).toHaveLength(0);
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

  it("extracts Salad Lab recipes from Calibre split markup", () => {
    const epub = readFileSync(saladLabPath);
    const extraction = extractCookbookEpub(epub);

    expect(extraction.metadata.title).toBe(
      "The Salad Lab: Recipes for Making Fabulous Salads Every Day",
    );
    expect(extraction.recipes).toHaveLength(109);
    expect(extraction.techniques).toHaveLength(0);

    const arugula = findRecipe(extraction.recipes, "Arugula Salad");
    expect(arugula?.draftRecipe.yield?.notes).toBe(
      "SERVES 2 TO 3 AS A MEAL OR 4 TO 6 AS A SIDE",
    );
    expect(arugula?.draftRecipe.ingredients.map((section) => section.title)).toEqual([
      "Start Out",
      "Whisk",
      "Toss",
    ]);
    expect(arugula?.draftRecipe.ingredients[0].items[0].raw).toBe("Ice water");
    expect(arugula?.draftRecipe.directions[0].steps).toHaveLength(4);
    expect(arugula?.draftRecipe.directions[0].steps[0].text).toContain(
      "Soak for 10 minutes",
    );
    expect(arugula?.images[0]).toMatchObject({
      epubPath: "images/00058.jpg",
      role: "inline",
    });

    const panzanella = findRecipe(extraction.recipes, "Panzanella");
    expect(panzanella?.images[0]).toMatchObject({
      epubPath: "images/00065.jpg",
      role: "inline",
    });
    expect(panzanella?.images.some((image) => image.epubPath === "images/00100.jpg")).toBe(
      false,
    );

    const frenchPotatoSalad = findRecipe(extraction.recipes, "French-Style Potato Salad");
    expect(frenchPotatoSalad?.images[0]).toMatchObject({
      epubPath: "images/00100.jpg",
      role: "inline",
    });

    const fattoush = findRecipe(extraction.recipes, "Fattoush");
    expect(fattoush?.images[0]).toMatchObject({
      epubPath: "images/00091.jpg",
      role: "inline",
    });

    const caesarDressing = findRecipe(extraction.recipes, "Caesar Dressing");
    expect(caesarDressing?.draftRecipe.ingredients.map((section) => section.title)).toEqual([
      "Start Out (Coddled Eggs)",
      "Whisk",
    ]);
    expect(caesarDressing?.images).toHaveLength(0);

    const roastedGarlic = findRecipe(extraction.recipes, "Roasted Garlic Purée");
    expect(roastedGarlic?.draftRecipe.ingredients[0].title).toBe("Ingredients");
    expect(roastedGarlic?.draftRecipe.ingredients[0].items[0].raw).toBe(
      "2 large garlic bulbs",
    );
    expect(roastedGarlic?.draftRecipe.directions[0].steps[0].text).toContain(
      "Preheat the oven",
    );

    const grilledChicken = findRecipe(extraction.recipes, "Grilled Chicken Breast");
    expect(grilledChicken?.draftRecipe.directions[0].steps).toHaveLength(4);
    expect(
      grilledChicken?.draftRecipe.directions[0].steps.some((step) =>
        step.text.includes("Lemon Basil Pasta Salad"),
      ),
    ).toBe(false);
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

  it("extracts Morimoto-style split headings, boxed recipes, and figure page images", () => {
    const extraction = extractCookbookContentFromDocuments({
      metadata: { title: "Mastering the Art of Japanese Home Cooking" },
      documents: [
        {
          path: "OEBPS/text/9780062344397_Chapter_2_sec3.xhtml",
          spineIndex: 0,
          html: `
            <html><body>
              <p class="h3a" id="sec3"><span epub:type="pagebreak" title="33"/>HAKUMAI</p>
              <p class="h3b">PERFECT WHITE RICE</p>
              <p class="image"><span epub:type="pagebreak" title="32"/><img src="../images/f0032-01.jpg" alt="image"/></p>
              <p class="noindenth"><i>Short-grain rice becomes glossy and plump.</i></p>
              <p class="hangm">MAKES 6 CUPS</p>
              <p class="hang1">2 cups short-grain white rice</p>
              <p class="noindenta1a">Rinse the rice until the water runs clear.</p>
              <p class="noindenta1">Cook the rice with the same volume of water.</p>
              <p class="noindenta1">Fluff the rice and serve.</p>
              <div class="box">
                <p class="h3"><span class="blue">FURIKAKE WITH SHRIMP SHELLS AND POTATO CHIPS</span></p>
                <p class="noindentbt"><span class="blue">A crunchy seasoning for rice.</span></p>
                <p class="hangm"><span class="blue">MAKES ABOUT 1 CUP</span></p>
                <p class="hangb1"><span class="blue">2 cups shrimp shells</span></p>
                <p class="hangb"><span class="blue">1 sheet nori</span></p>
                <p class="noindentb1"><span class="blue">Toast the shells until dry.</span></p>
                <p class="noindentb1"><span class="blue">Grind with nori and season to taste.</span></p>
              </div>
            </body></html>
          `,
        },
        {
          path: "OEBPS/text/9780062344397_Chapter_8_sec53.xhtml",
          spineIndex: 1,
          html: `
            <html><body>
              <p class="h3tb" id="sec53"><span epub:type="pagebreak" title="189"/>HOMEMADE UDON NOODLES</p>
              <p class="image"><span epub:type="pagebreak" title="188"/><img src="../images/f0188-01.jpg" alt="image"/></p>
              <p class="noindenta"><i>Homemade udon is chewy and springy.</i></p>
              <p class="hangm">MAKES 2 POUNDS</p>
              <p class="hang1">600 grams all-purpose flour</p>
              <p class="hang">1 tablespoon kosher salt</p>
              <p class="hang">1 1/4 cups water</p>
              <p class="noindenta2">MAKE THE DOUGH</p>
              <p class="noindenta1">Combine the flour and salt.</p>
              <p class="noindenta1">Knead until smooth, about 5 minutes.</p>
              <p class="noindenta1">Slice into noodles and cook right away.</p>
            </body></html>
          `,
        },
      ],
      images: [
        {
          epubPath: "OEBPS/images/f0032-01.jpg",
          mediaType: "image/jpeg",
          byteLength: 250_000,
          pageNumber: 32,
        },
        {
          epubPath: "OEBPS/images/f0188-01.jpg",
          mediaType: "image/jpeg",
          byteLength: 250_000,
          pageNumber: 188,
        },
      ],
    });

    expect(extraction.recipes.map((recipe) => recipe.draftRecipe.title)).toEqual([
      "HAKUMAI: PERFECT WHITE RICE",
      "FURIKAKE WITH SHRIMP SHELLS AND POTATO CHIPS",
      "HOMEMADE UDON NOODLES",
    ]);
    expect(findRecipe(extraction.recipes, "HAKUMAI: PERFECT WHITE RICE")).toMatchObject({
      pageNumber: 33,
      images: [expect.objectContaining({ epubPath: "OEBPS/images/f0032-01.jpg", pageNumber: 32 })],
    });
    expect(
      findRecipe(extraction.recipes, "FURIKAKE WITH SHRIMP SHELLS AND POTATO CHIPS")
        ?.draftRecipe.ingredients[0].items,
    ).toHaveLength(2);
    expect(
      findRecipe(extraction.recipes, "HOMEMADE UDON NOODLES")?.draftRecipe.directions[0]
        .steps,
    ).toHaveLength(3);
  });
});

function findRecipe(recipes: ExtractedCookbookRecipe[], title: string) {
  return recipes.find(
    (recipe) => recipe.draftRecipe.title.toLowerCase() === title.toLowerCase(),
  );
}
