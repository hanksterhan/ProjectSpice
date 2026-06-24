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
const halfBakedHarvestEveryDayPath = resolve(
  "zips/Half Baked Harvest Every Day_ Recipes for Balanced, -- Gerard, Tieghan.epub",
);
const halfBakedHarvestSuperSimplePath = resolve(
  "zips/Half Baked Harvest Super Simple_ More Than 125 Recipes for -- Tieghan Gerard.epub",
);
const mollyMoonPath = resolve("zips/Molly Moon's Homemade Ice Cream.epub");

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

  it("extracts Half Baked Harvest Every Day split title pages and small inline photos", () => {
    const epub = readFileSync(halfBakedHarvestEveryDayPath);
    const extraction = extractCookbookEpub(epub);

    expect(extraction.metadata.title).toBe(
      "Half Baked Harvest Every Day: Recipes for Balanced, Flexible, Feel-Good Meals",
    );
    expect(extraction.metadata.creator).toBe("Tieghan Gerard");
    expect(extraction.recipes).toHaveLength(123);

    const frenchToast = findRecipe(
      extraction.recipes,
      "sheet pan french toast with whipped lemon ricotta and juicy berries",
    );
    expect(frenchToast?.draftRecipe.ingredients[0].items).toHaveLength(15);
    expect(frenchToast?.draftRecipe.directions[0].steps).toHaveLength(5);
    expect(frenchToast?.draftRecipe.times).toEqual({
      prepMinutes: 10,
      cookMinutes: 20,
      totalMinutes: 30,
    });
    expect(frenchToast?.images[0]).toMatchObject({
      epubPath: "images/00018.jpg",
      role: "inline",
    });

    const sweetPotatoes = findRecipe(
      extraction.recipes,
      "maple-sesame smashed sweet potatoes",
    );
    expect(sweetPotatoes?.images[0]).toMatchObject({
      epubPath: "images/00141.jpg",
      role: "inline",
    });

    const salmon = findRecipe(
      extraction.recipes,
      "sesame soy miso-glazed salmon with seasoned coconut rice",
    );
    expect(salmon?.images[0]).toMatchObject({
      epubPath: "images/00091.jpg",
      role: "inline",
    });

    const pizzaDough = findRecipe(extraction.recipes, "pizza dough");
    expect(pizzaDough?.images).toHaveLength(0);

    const chocolateCake = findRecipe(extraction.recipes, "chocolate olive oil cake");
    expect(chocolateCake?.draftRecipe.directions[0].steps).toHaveLength(6);
    expect(chocolateCake?.draftRecipe.times).toEqual({
      prepMinutes: 15,
      cookMinutes: 40,
      totalMinutes: 55,
    });
    expect(chocolateCake?.images[0]).toMatchObject({
      epubPath: "images/00145.jpg",
      role: "inline",
    });
  });

  it("extracts Half Baked Harvest Super Simple recipes without decorative icons", () => {
    const epub = readFileSync(halfBakedHarvestSuperSimplePath);
    const extraction = extractCookbookEpub(epub);

    expect(extraction.metadata.title).toBe("Half Baked Harvest Super Simple");
    expect(extraction.metadata.creator).toBe("Tieghan Gerard");
    expect(extraction.recipes).toHaveLength(124);
    expect(extraction.techniques).toHaveLength(0);

    const frenchToast = findRecipe(
      extraction.recipes,
      "BAKED CINNAMON-BUTTER BRIOCHE FRENCH TOAST",
    );
    expect(frenchToast?.draftRecipe.times).toEqual({
      prepMinutes: 15,
      cookMinutes: 50,
      totalMinutes: 60,
    });
    expect(frenchToast?.images).toEqual([
      expect.objectContaining({
        epubPath: "OEBPS/images/465_GERA_9780525577072_art_r1.jpg",
        role: "inline",
      }),
    ]);
    expect(
      frenchToast?.images.some((image) => image.epubPath.endsWith("12.jpg")),
    ).toBe(false);

    const pressureCookerEggs = findRecipe(
      extraction.recipes,
      "PERFECT PRESSURE COOKER EGGS",
    );
    expect(pressureCookerEggs?.draftRecipe.ingredients[0].items[0].raw).toBe(
      "4 TO 6 LARGE EGGS",
    );
    expect(pressureCookerEggs?.draftRecipe.directions[0].steps).toHaveLength(4);
    expect(pressureCookerEggs?.draftRecipe.times).toEqual({ cookMinutes: 4 });
    expect(pressureCookerEggs?.images).toHaveLength(0);

    const walnutChicken = findRecipe(extraction.recipes, "WALNUT-CRUSTED CHICKEN");
    expect(walnutChicken?.images[0]).toMatchObject({
      epubPath: "OEBPS/images/201_GERA_9780525577072_art_r1.jpg",
      role: "inline",
    });
    expect(
      walnutChicken?.images.some((image) => image.epubPath.endsWith("121.jpg")),
    ).toBe(false);

    const potStickers = findRecipe(extraction.recipes, "HOT-AND-SPICY POT STICKERS");
    expect(potStickers?.images.map((image) => image.epubPath)).toEqual([
      "OEBPS/images/209_GERA_9780525577072_art_r1.jpg",
      "OEBPS/images/99.jpg",
    ]);

    const spaghettiSquash = findRecipe(extraction.recipes, "SPAGHETTI SQUASH ALFREDO");
    expect(spaghettiSquash?.images.map((image) => image.epubPath)).toEqual([
      "OEBPS/images/263_GERA_9780525577072_art_r1.jpg",
    ]);

    const strawberryCake = findRecipe(extraction.recipes, "STRAWBERRY NAKED CAKE");
    expect(strawberryCake?.images.map((image) => image.epubPath)).toEqual([
      "OEBPS/images/184.jpg",
    ]);

    const blackoutCake = findRecipe(extraction.recipes, "BLACKOUT CHOCOLATE CAKE");
    expect(blackoutCake?.images.map((image) => image.epubPath)).toEqual([
      "OEBPS/images/414_GERA_9780525577072_art_r1.jpg",
    ]);

    const appleTarts = findRecipe(extraction.recipes, "EASIEST CINNAMON-APPLE TARTS");
    expect(appleTarts?.images.map((image) => image.epubPath)).toEqual([
      "OEBPS/images/448_GERA_9780525577072_art_r1.jpg",
    ]);

    const allImagePaths = extraction.recipes.flatMap((recipe) =>
      recipe.images.map((image) => image.epubPath),
    );
    expect(allImagePaths).not.toContain(
      "OEBPS/images/414_GERA_9780525577072_art_r11.jpg",
    );
    expect(allImagePaths).not.toContain("OEBPS/images/sp.jpg");
    expect(allImagePaths).not.toContain("OEBPS/images/clock.jpg");
    expect(allImagePaths).not.toContain("OEBPS/images/pan.jpg");
    expect(allImagePaths).not.toContain("OEBPS/images/pot.jpg");
  });

  it("extracts Molly Moon seasonal recipe chapters and recipe-list extras", () => {
    const epub = readFileSync(mollyMoonPath);
    const extraction = extractCookbookEpub(epub);

    expect(extraction.metadata.title).toBe("Molly Moon's Homemade Ice Cream");
    expect(extraction.metadata.creator).toBe("Molly Moon-Neitzel");
    expect(extraction.recipes).toHaveLength(64);

    const honeyLavender = findRecipe(extraction.recipes, "honey lavender ice cream");
    expect(honeyLavender?.draftRecipe.yield?.notes).toBe("MAKES 1 TO 1½ QUARTS");
    expect(honeyLavender?.draftRecipe.ingredients[0].items).toHaveLength(6);
    expect(honeyLavender?.draftRecipe.directions[0].steps).toHaveLength(3);
    expect(honeyLavender?.images).toEqual([
      expect.objectContaining({
        epubPath: "OEBPS/images/Neit_9781570617973_epub_012_r1.jpg",
        role: "inline",
      }),
    ]);

    const carrotCake = findRecipe(extraction.recipes, "carrot cake ice cream");
    expect(carrotCake?.draftRecipe.description).toContain("carrot cake");
    expect(carrotCake?.draftRecipe.directions[0].steps[0].text).toContain(
      "Put the cream",
    );
    expect(carrotCake?.draftRecipe.directions[0].steps[0].text).not.toContain(
      "Spring flavors",
    );

    const balsamicStrawberry = findRecipe(
      extraction.recipes,
      "make it balsamic strawberry ice cream",
    );
    expect(balsamicStrawberry?.draftRecipe.ingredients[0].items).toHaveLength(2);
    expect(balsamicStrawberry?.draftRecipe.directions[0].steps).toHaveLength(2);
    expect(balsamicStrawberry?.images[0]).toMatchObject({
      epubPath: "OEBPS/images/Neit_9781570617973_epub_025_r1.jpg",
      role: "inline",
    });

    const cornSyrup = findRecipe(extraction.recipes, "corn syrup substitute");
    expect(cornSyrup?.draftRecipe.ingredients[0].items).toHaveLength(4);
    expect(cornSyrup?.draftRecipe.directions[0].steps).toHaveLength(2);
    expect(cornSyrup?.images).toHaveLength(0);

    expect(findRecipe(extraction.recipes, "recipe list")).toBeUndefined();
    expect(findRecipe(extraction.recipes, "How to Make an Ice Cream Cake")).toBeUndefined();
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
        {
          path: "OEBPS/text/9780062344397_Chapter_2_sec13.xhtml",
          spineIndex: 2,
          html: `
            <html><body>
              <p class="h4p" id="sec13"><a href="nav.xhtml#rsec13"><i>Vegetable Temaki</i></a></p>
              <p class="imaget"><span epub:type="pagebreak" title="57"/><img src="../images/f0057-01.jpg" alt="image"/></p>
              <p class="imaget"><img src="../images/f0057-02.jpg" alt="image"/></p>
              <p class="imaget"><img src="../images/f0057-03.jpg" alt="image"/></p>
              <p class="imaget"><img src="../images/f0057-04.jpg" alt="image"/></p>
              <p class="image"><img src="../images/f0057-05.jpg" alt="image"/></p>
              <p class="hangmp5">MAKES 8 HAND ROLLS</p>
              <p class="hang1a">4 nori seaweed sheets, halved lengthwise</p>
              <p class="hang">About 2 cups cooked, vinegared short-grain white rice</p>
              <p class="hang">About 1 1/2 teaspoons wasabi paste</p>
              <p class="hang">8 fresh shiso leaves</p>
              <p class="noindenta1a">To make each hand roll, hold a piece of nori shiny side down.</p>
              <p class="noindenta1">Roll the nori around the filling to form a cone or cylinder.</p>
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
        {
          epubPath: "OEBPS/images/f0057-01.jpg",
          mediaType: "image/jpeg",
          byteLength: 120_000,
          pageNumber: 57,
        },
        {
          epubPath: "OEBPS/images/f0057-02.jpg",
          mediaType: "image/jpeg",
          byteLength: 130_000,
          pageNumber: 57,
        },
        {
          epubPath: "OEBPS/images/f0057-03.jpg",
          mediaType: "image/jpeg",
          byteLength: 140_000,
          pageNumber: 57,
        },
        {
          epubPath: "OEBPS/images/f0057-04.jpg",
          mediaType: "image/jpeg",
          byteLength: 220_000,
          pageNumber: 57,
        },
        {
          epubPath: "OEBPS/images/f0057-05.jpg",
          mediaType: "image/jpeg",
          byteLength: 110_000,
          pageNumber: 57,
        },
      ],
    });

    expect(extraction.recipes.map((recipe) => recipe.draftRecipe.title)).toEqual([
      "HAKUMAI: PERFECT WHITE RICE",
      "FURIKAKE WITH SHRIMP SHELLS AND POTATO CHIPS",
      "HOMEMADE UDON NOODLES",
      "Vegetable Temaki",
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
    expect(findRecipe(extraction.recipes, "Vegetable Temaki")?.images.map((image) => image.epubPath)).toEqual([
      "OEBPS/images/f0057-01.jpg",
      "OEBPS/images/f0057-02.jpg",
      "OEBPS/images/f0057-03.jpg",
      "OEBPS/images/f0057-04.jpg",
      "OEBPS/images/f0057-05.jpg",
    ]);
  });
});

function findRecipe(recipes: ExtractedCookbookRecipe[], title: string) {
  return recipes.find(
    (recipe) => recipe.draftRecipe.title.toLowerCase() === title.toLowerCase(),
  );
}
