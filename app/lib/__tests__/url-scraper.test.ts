import { describe, it, expect } from "vitest";
import { scrapeHtml, detectPaywall } from "../url-scraper";
import { parseDuration } from "../time-parser";

// ---------------------------------------------------------------------------
// ISO 8601 duration parsing (added to parseDuration)
// ---------------------------------------------------------------------------

describe("parseDuration — ISO 8601", () => {
  it("PT45M → 45", () => expect(parseDuration("PT45M")).toBe(45));
  it("PT2H → 120", () => expect(parseDuration("PT2H")).toBe(120));
  it("PT2H30M → 150", () => expect(parseDuration("PT2H30M")).toBe(150));
  it("PT1H15M → 75", () => expect(parseDuration("PT1H15M")).toBe(75));
  it("P1DT2H → null (day-scale)", () => expect(parseDuration("P1DT2H")).toBeNull());
  it("PT0S → null (zero duration)", () => expect(parseDuration("PT0S")).toBeNull());
  it("case-insensitive pt30m", () => expect(parseDuration("pt30m")).toBe(30));
});

// ---------------------------------------------------------------------------
// JSON-LD extraction
// ---------------------------------------------------------------------------

const JSONLD_BASIC = `
<html>
<head>
<script type="application/ld+json">
{
  "@context": "https://schema.org",
  "@type": "Recipe",
  "name": "Chocolate Chip Cookies",
  "description": "Classic chewy cookies",
  "prepTime": "PT15M",
  "cookTime": "PT12M",
  "totalTime": "PT27M",
  "recipeYield": "36 cookies",
  "recipeIngredient": [
    "2 cups all-purpose flour",
    "1 tsp baking soda",
    "2 large eggs"
  ],
  "recipeInstructions": [
    { "@type": "HowToStep", "text": "Preheat oven to 375°F." },
    { "@type": "HowToStep", "text": "Mix dry ingredients." },
    { "@type": "HowToStep", "text": "Bake for 12 minutes." }
  ],
  "image": "https://example.com/cookies.jpg",
  "recipeCategory": "Dessert",
  "recipeCuisine": "American"
}
</script>
</head>
<body><p>Some page content</p></body>
</html>`;

describe("scrapeHtml — JSON-LD basic", () => {
  const result = scrapeHtml(JSONLD_BASIC, "https://example.com/recipe");

  it("returns ok: true", () => expect(result.ok).toBe(true));
  it("confidence is json-ld", () => {
    if (!result.ok) throw new Error("not ok");
    expect(result.recipe.confidence).toBe("json-ld");
  });
  it("extracts title", () => {
    if (!result.ok) throw new Error("not ok");
    expect(result.recipe.title).toBe("Chocolate Chip Cookies");
  });
  it("extracts description", () => {
    if (!result.ok) throw new Error("not ok");
    expect(result.recipe.description).toBe("Classic chewy cookies");
  });
  it("extracts prepTimeRaw (ISO 8601)", () => {
    if (!result.ok) throw new Error("not ok");
    expect(result.recipe.prepTimeRaw).toBe("PT15M");
  });
  it("extracts cookTimeRaw (ISO 8601)", () => {
    if (!result.ok) throw new Error("not ok");
    expect(result.recipe.cookTimeRaw).toBe("PT12M");
  });
  it("extracts totalTimeRaw (ISO 8601)", () => {
    if (!result.ok) throw new Error("not ok");
    expect(result.recipe.totalTimeRaw).toBe("PT27M");
  });
  it("extracts servingsRaw", () => {
    if (!result.ok) throw new Error("not ok");
    expect(result.recipe.servingsRaw).toBe("36 cookies");
  });
  it("extracts 3 ingredients", () => {
    if (!result.ok) throw new Error("not ok");
    expect(result.recipe.ingredients).toHaveLength(3);
    expect(result.recipe.ingredients[0]).toBe("2 cups all-purpose flour");
  });
  it("extracts directions as joined steps", () => {
    if (!result.ok) throw new Error("not ok");
    expect(result.recipe.directionsText).toContain("Preheat oven");
    expect(result.recipe.directionsText).toContain("Bake for 12 minutes");
  });
  it("extracts imageUrl", () => {
    if (!result.ok) throw new Error("not ok");
    expect(result.recipe.imageUrl).toBe("https://example.com/cookies.jpg");
  });
  it("extracts tags from category + cuisine", () => {
    if (!result.ok) throw new Error("not ok");
    expect(result.recipe.tags).toContain("Dessert");
    expect(result.recipe.tags).toContain("American");
  });
});

// ---------------------------------------------------------------------------
// JSON-LD — @graph variant
// ---------------------------------------------------------------------------

const JSONLD_GRAPH = `
<script type="application/ld+json">
{
  "@context": "https://schema.org",
  "@graph": [
    { "@type": "WebPage", "name": "My blog" },
    {
      "@type": "Recipe",
      "name": "Pasta Carbonara",
      "recipeIngredient": ["200g pasta", "3 egg yolks", "100g guanciale"],
      "recipeInstructions": "Cook pasta. Fry guanciale. Mix eggs."
    }
  ]
}
</script>`;

describe("scrapeHtml — JSON-LD @graph", () => {
  const result = scrapeHtml(JSONLD_GRAPH, "https://blog.example.com/carbonara");
  it("finds Recipe inside @graph", () => {
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.recipe.title).toBe("Pasta Carbonara");
    expect(result.recipe.ingredients).toHaveLength(3);
  });
  it("handles string instructions", () => {
    if (!result.ok) return;
    expect(result.recipe.directionsText).toContain("Cook pasta");
  });
});

// ---------------------------------------------------------------------------
// JSON-LD — array image
// ---------------------------------------------------------------------------

const JSONLD_ARRAY_IMAGE = `
<script type="application/ld+json">
{
  "@type": "Recipe",
  "name": "Soup",
  "recipeIngredient": ["2 cups broth"],
  "recipeInstructions": [{ "@type": "HowToStep", "text": "Heat and serve." }],
  "image": [
    { "@type": "ImageObject", "url": "https://example.com/soup-1x1.jpg" },
    { "@type": "ImageObject", "url": "https://example.com/soup-16x9.jpg" }
  ]
}
</script>`;

describe("scrapeHtml — JSON-LD ImageObject array", () => {
  it("extracts first ImageObject url", () => {
    const result = scrapeHtml(JSONLD_ARRAY_IMAGE, "https://example.com/soup");
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.recipe.imageUrl).toBe("https://example.com/soup-1x1.jpg");
  });
});

// ---------------------------------------------------------------------------
// JSON-LD — HowToSection instructions
// ---------------------------------------------------------------------------

const JSONLD_HOW_TO_SECTION = `
<script type="application/ld+json">
{
  "@type": "Recipe",
  "name": "Layered Cake",
  "recipeIngredient": ["2 cups flour"],
  "recipeInstructions": [
    {
      "@type": "HowToSection",
      "name": "Cake",
      "itemListElement": [
        { "@type": "HowToStep", "text": "Mix batter." },
        { "@type": "HowToStep", "text": "Bake 30 min." }
      ]
    }
  ]
}
</script>`;

describe("scrapeHtml — JSON-LD HowToSection", () => {
  it("flattens HowToSection steps", () => {
    const result = scrapeHtml(JSONLD_HOW_TO_SECTION, "https://example.com/cake");
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.recipe.directionsText).toContain("Mix batter");
    expect(result.recipe.directionsText).toContain("Bake 30 min");
  });
});

// ---------------------------------------------------------------------------
// Microdata heuristic extraction (Tier 2)
// ---------------------------------------------------------------------------

const MICRODATA_HTML = `
<html>
<body itemscope itemtype="https://schema.org/Recipe">
  <h1 itemprop="name">Banana Bread</h1>
  <p itemprop="description">Moist and delicious.</p>
  <meta itemprop="prepTime" content="PT10M" />
  <meta itemprop="cookTime" content="PT60M" />
  <meta itemprop="recipeYield" content="1 loaf" />
  <ul>
    <li itemprop="recipeIngredient">3 ripe bananas</li>
    <li itemprop="recipeIngredient">1/3 cup melted butter</li>
    <li itemprop="recipeIngredient">1 cup sugar</li>
  </ul>
  <div itemprop="recipeInstructions">Mash bananas. Mix in butter and sugar. Bake 60 min.</div>
  <span itemprop="recipeCategory">Bread</span>
</body>
</html>`;

describe("scrapeHtml — microdata heuristic", () => {
  const result = scrapeHtml(MICRODATA_HTML, "https://example.com/banana-bread");

  it("returns ok: true with heuristic confidence", () => {
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.recipe.confidence).toBe("heuristic");
  });
  it("extracts title from itemprop=name", () => {
    if (!result.ok) return;
    expect(result.recipe.title).toBe("Banana Bread");
  });
  it("extracts ingredients", () => {
    if (!result.ok) return;
    expect(result.recipe.ingredients).toHaveLength(3);
  });
  it("extracts ISO 8601 prepTimeRaw", () => {
    if (!result.ok) return;
    expect(result.recipe.prepTimeRaw).toBe("PT10M");
  });
  it("extracts servingsRaw", () => {
    if (!result.ok) return;
    expect(result.recipe.servingsRaw).toBe("1 loaf");
  });
  it("extracts category tag", () => {
    if (!result.ok) return;
    expect(result.recipe.tags).toContain("Bread");
  });
});

// ---------------------------------------------------------------------------
// Paywall detection
// ---------------------------------------------------------------------------

describe("detectPaywall", () => {
  it("401 → paywalled", () => expect(detectPaywall(401, "https://example.com", "")).toBe(true));
  it("403 → paywalled", () => expect(detectPaywall(403, "https://example.com", "")).toBe(true));
  it("200 with login URL → paywalled", () =>
    expect(detectPaywall(200, "https://example.com/login?redirect=/recipe", "")).toBe(true));
  it("200 with subscribe redirect → paywalled", () =>
    expect(detectPaywall(200, "https://example.com/subscribe", "")).toBe(true));
  it("200 with password input + no recipe marker → paywalled", () =>
    expect(detectPaywall(200, "https://example.com/recipe", '<input type="password" />')).toBe(true));
  it("200 with password input + recipe marker → not paywalled", () =>
    expect(
      detectPaywall(200, "https://example.com/recipe", '<input type="password" /><script>{"@type":"Recipe"}</script>')
    ).toBe(false));
  it("200 with normal recipe page → not paywalled", () =>
    expect(detectPaywall(200, "https://example.com/cookies", '<div itemprop="recipeIngredient">flour</div>')).toBe(false));
});

// ---------------------------------------------------------------------------
// Error case: no recipe data
// ---------------------------------------------------------------------------

describe("scrapeHtml — no recipe found", () => {
  it("returns ok: false when page has no recipe markup", () => {
    const result = scrapeHtml("<html><body><p>Hello world</p></body></html>", "https://example.com");
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.paywalled).toBe(false);
    if (result.paywalled) return;
    expect(result.error).toBeTruthy();
  });

  it("returns ok: false for malformed JSON-LD", () => {
    const html = `<script type="application/ld+json">{ invalid json }</script>`;
    const result = scrapeHtml(html, "https://example.com");
    expect(result.ok).toBe(false);
  });
});
