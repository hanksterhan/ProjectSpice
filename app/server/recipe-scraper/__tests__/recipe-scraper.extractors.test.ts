import { describe, expect, it } from "vitest";

import { extractRecipeDraftFromHtml } from "../recipe-scraper.extractors";

describe("extractRecipeDraftFromHtml", () => {
  it("extracts a recipe draft from JSON-LD Recipe data", () => {
    const result = extractRecipeDraftFromHtml({
      sourceUrl: "https://example.com/lemon-loaf",
      html: `
        <html>
          <head>
            <meta property="og:site_name" content="Example Kitchen">
            <script type="application/ld+json">
              {
                "@context": "https://schema.org",
                "@type": "Recipe",
                "name": "Copycat Lemon Loaf",
                "description": "A bright lemon loaf with icing.",
                "image": ["https://example.com/lemon.jpg"],
                "prepTime": "PT10M",
                "cookTime": "PT45M",
                "totalTime": "PT55M",
                "recipeYield": "8 slices",
                "keywords": "cake, lemon",
                "recipeCategory": "Dessert",
                "recipeIngredient": [
                  "1 cup granulated sugar",
                  "2 tablespoons lemon zest",
                  "2 large eggs"
                ],
                "recipeInstructions": [
                  { "@type": "HowToStep", "text": "Heat oven to 350 degrees F." },
                  { "@type": "HowToStep", "text": "Bake until done, about 45 minutes." }
                ]
              }
            </script>
          </head>
        </html>
      `,
    });

    expect(result.draftRecipe).toMatchObject({
      title: "Copycat Lemon Loaf",
      description: "A bright lemon loaf with icing.",
      imageUrl: "https://example.com/lemon.jpg",
      yield: {
        quantity: 8,
        unit: "slices",
        notes: "8 slices",
      },
      times: {
        prepMinutes: 10,
        cookMinutes: 45,
        totalMinutes: 55,
      },
      source: {
        type: "scraped",
        name: "Example Kitchen",
        url: "https://example.com/lemon-loaf",
      },
    });
    expect(result.draftRecipe.ingredients[0]?.items).toHaveLength(3);
    expect(result.draftRecipe.directions[0]?.steps[1]).toMatchObject({
      order: 2,
      timerMinutes: 45,
    });
    expect(result.draftRecipe.tags).toEqual(["cake", "lemon", "dessert"]);
    expect(result.warnings).toEqual([]);
  });

  it("extracts a recipe from a JSON-LD graph", () => {
    const result = extractRecipeDraftFromHtml({
      sourceUrl: "https://example.com/chili-crab",
      html: `
        <script type="application/ld+json">
          {
            "@graph": [
              { "@type": "WebPage", "name": "Page" },
              {
                "@type": ["Recipe"],
                "name": "Singaporean Chili Crab",
                "recipeYield": ["2 servings"],
                "recipeIngredient": ["2 whole crabs", "1 large egg, beaten"],
                "recipeInstructions": {
                  "@type": "HowToSection",
                  "itemListElement": [
                    { "@type": "HowToStep", "text": "Cook aromatics for 1 minute." },
                    { "@type": "HowToStep", "text": "Add crab and simmer for 6 minutes." }
                  ]
                }
              }
            ]
          }
        </script>
      `,
    });

    expect(result.draftRecipe.title).toBe("Singaporean Chili Crab");
    expect(result.draftRecipe.yield?.quantity).toBe(2);
    expect(result.draftRecipe.ingredients[0]?.items[0]?.raw).toBe("2 whole crabs");
    expect(result.draftRecipe.directions[0]?.steps).toHaveLength(2);
  });

  it("splits ingredient headings into sections", () => {
    const result = extractRecipeDraftFromHtml({
      sourceUrl: "https://example.com/lamb-soup",
      html: `
        <script type="application/ld+json">
          {
            "@type": "Recipe",
            "name": "Shredded Lamb Noodle Soup",
            "recipeIngredient": [
              "For the Broth:",
              "2 pounds lamb shoulder",
              "8 cups water",
              "For the Topping:",
              "1/2 cup chopped cilantro",
              "2 scallions, thinly sliced"
            ],
            "recipeInstructions": [
              "Simmer the lamb until tender.",
              "Top bowls with cilantro and scallions."
            ]
          }
        </script>
      `,
    });

    expect(result.draftRecipe.ingredients).toHaveLength(2);
    expect(result.draftRecipe.ingredients[0]).toMatchObject({
      title: "For the Broth",
      items: [
        { raw: "2 pounds lamb shoulder" },
        { raw: "8 cups water" },
      ],
    });
    expect(result.draftRecipe.ingredients[1]).toMatchObject({
      title: "For the Topping",
      items: [
        { raw: "1/2 cup chopped cilantro" },
        { raw: "2 scallions, thinly sliced" },
      ],
    });
  });

  it("prefers visible ingredient groups when JSON-LD ingredients are flattened", () => {
    const result = extractRecipeDraftFromHtml({
      sourceUrl: "https://example.com/lamb-soup",
      html: `
        <script type="application/ld+json">
          {
            "@type": "Recipe",
            "name": "Hot and Numbing Shredded Lamb Noodle Soup",
            "recipeIngredient": [
              "3 1/2 to 4 pounds lamb shanks",
              "2 tablespoons kosher salt",
              "3/4 cup canola oil",
              "6 servings hand-pulled noodles"
            ],
            "recipeInstructions": ["Simmer broth.", "Serve with noodles."]
          }
        </script>
        <h2>Ingredients</h2>
        <p>For the Broth:</p>
        <ul>
          <li>3 1/2 to 4 pounds lamb shanks</li>
          <li>2 tablespoons kosher salt</li>
        </ul>
        <p>For the Topping:</p>
        <ul>
          <li>3/4 cup canola oil</li>
          <li>4 cloves garlic, minced</li>
        </ul>
        <p>For Serving:</p>
        <ul>
          <li>6 servings hand-pulled noodles</li>
        </ul>
        <h2>Directions</h2>
      `,
    });

    expect(result.draftRecipe.ingredients.map((section) => section.title)).toEqual([
      "For the Broth",
      "For the Topping",
      "For Serving",
    ]);
    expect(result.draftRecipe.ingredients[1]?.items).toEqual([
      expect.objectContaining({ raw: "3/4 cup canola oil" }),
      expect.objectContaining({ raw: "4 cloves garlic, minced" }),
    ]);
  });
});
