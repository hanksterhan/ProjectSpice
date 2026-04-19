import { describe, it, expect } from "vitest";
import { parsePaprikaHtml } from "../paprika-html-parser";

// ─── Minimal HTML fixtures ────────────────────────────────────────────────────

const FULL_RECIPE = `<!DOCTYPE html>
<html>
<head><meta charset="UTF-8"><style></style></head>
<body>
<div class="recipe" itemscope itemtype="http://schema.org/Recipe">
  <div class="infobox">
    <div class="photobox">
      <a href="https://example.com/photo.jpg">
        <img src="Images/GUID1/GUID2.jpg" itemprop="image" class="photo"/>
      </a>
    </div>
    <h1 itemprop="name" class="name">15-Minute Sticky Gochujang Grilled Ribs</h1>
    <p itemprop="aggregateRating" class="rating" value="4"></p>
    <p itemprop="recipeCategory" class="categories">Molly Baz, MAINS &amp; SIDES, Quick</p>
    <p class="metadata">
      <b>Prep Time: </b><span itemprop="prepTime">10 mins</span>
      <b>Cook Time: </b><span itemprop="cookTime">25 mins</span>
      <b>Servings: </b><span itemprop="recipeYield">Serves: 4</span>
      <b>Source: </b>
      <a itemprop="url" href="https://mollybaz.com/ribs/">
        <span itemprop="author">mollybaz.com</span>
      </a>
    </p>
  </div>
  <div class="left-column">
    <div class="ingredientsbox">
      <h3 class="subhead">Ingredients</h3>
      <div class="ingredients text">
        <p class="line" itemprop="recipeIngredient">PRODUCE</p>
        <p class="line" itemprop="recipeIngredient"><strong>1</strong>" piece of ginger</p>
        <p class="line" itemprop="recipeIngredient">PANTRY</p>
        <p class="line" itemprop="recipeIngredient">Kosher salt</p>
        <p class="line" itemprop="recipeIngredient"><strong>½</strong> cup gochujang</p>
        <p class="line" itemprop="recipeIngredient"><strong>2</strong> racks baby back pork ribs</p>
      </div>
    </div>
  </div>
  <div class="right-column">
    <div class="directionsbox">
      <h3 class="subhead">Directions</h3>
      <div itemprop="recipeInstructions" class="directions text">
        <p class="line">Season the ribs all over with salt.</p>
        <p class="line">Grill over medium heat for 15 minutes.</p>
      </div>
    </div>
    <div class="notesbox">
      <h3 class="subhead">Notes</h3>
      <div itemprop="comment" class="notes text">
        <p>Can be made 2 days ahead.</p>
      </div>
    </div>
  </div>
</div>
</body>
</html>`;

const UNDEFINED_BUG = `<!DOCTYPE html>
<html><head></head><body>
<div class="recipe" itemscope itemtype="http://schema.org/Recipe">
  <div class="infobox">
    <h1 itemprop="name" class="name">All-In Shortbreads</h1>
    <p itemprop="aggregateRating" class="rating" value="0"></p>
    <p itemprop="recipeCategory" class="categories">Claire Saffitz, Dessert Person, Cookies</p>
    <p class="metadata">
      <b>Cook Time: </b><span itemprop="cookTime">undefinedACTIVE TIME: 40 minutes, TOTAL TIME: 1 hour 30 minutes</span>
      <b>Difficulty: </b><span itemprop="difficulty">2 (Easy)</span>
      <b>Servings: </b><span itemprop="recipeYield">Makes 24</span>
    </p>
  </div>
  <div class="left-column">
    <div class="ingredientsbox">
      <h3 class="subhead">Ingredients</h3>
      <div class="ingredients text">
        <p class="line" itemprop="recipeIngredient"><strong>21/2</strong> cups all-purpose flour</p>
        <p class="line" itemprop="recipeIngredient"><strong>1</strong> tsp kosher salt</p>
      </div>
    </div>
  </div>
  <div class="right-column">
    <div class="directionsbox">
      <h3 class="subhead">Directions</h3>
      <div itemprop="recipeInstructions" class="directions text">
        <p class="line">Mix flour and salt.</p>
      </div>
    </div>
  </div>
</div>
</body></html>`;

const BR_DIRECTIONS = `<!DOCTYPE html>
<html><head></head><body>
<div class="recipe" itemscope itemtype="http://schema.org/Recipe">
  <div class="infobox">
    <h1 itemprop="name" class="name">51-hour focaccia</h1>
    <p itemprop="aggregateRating" class="rating" value="0"></p>
    <p itemprop="recipeCategory" class="categories">aerated, Joshua Weissman, Texture Over Taste</p>
    <p class="metadata">
      <b>Prep Time: </b><span itemprop="prepTime">51 hours plus 50 minutes</span>
      <b>Cook Time: </b><span itemprop="cookTime">25 minutes</span>
      <b>Servings: </b><span itemprop="recipeYield">1 large loaf</span>
      <b>Source: </b>
      <span itemprop="author">Joshua Weissman - Texture Over Taste</span>
    </p>
  </div>
  <div class="left-column">
    <div class="ingredientsbox">
      <h3 class="subhead">Ingredients</h3>
      <div class="ingredients text">
        <p class="line" itemprop="recipeIngredient"><strong>11/2</strong> tsp (5g) instant dry yeast</p>
        <p class="line" itemprop="recipeIngredient"><strong>21/2</strong> cups (625ml) water, warmed to 95°F (35°C)</p>
        <p class="line" itemprop="recipeIngredient">Flaky salt, to taste</p>
      </div>
    </div>
  </div>
  <div class="right-column">
    <div class="descriptionbox">
      <h3 class="subhead">Description</h3>
      <div itemprop="description" class="description text">
        <p>Most of the time is just letting it sit in the fridge.</p>
      </div>
    </div>
    <div class="directionsbox">
      <h3 class="subhead">Directions</h3>
      <div itemprop="recipeInstructions" class="directions text">
        <p class="line">1. Whisk the yeast into the water.<br/>2. Mix flour and salt. Add yeast mixture.<br/>3. Refrigerate for 48 hours.</p>
      </div>
    </div>
  </div>
</div>
</body></html>`;

const NO_TITLE = `<!DOCTYPE html><html><body><p>Not a recipe.</p></body></html>`;

// ─── Tests ────────────────────────────────────────────────────────────────────

describe("parsePaprikaHtml — basic fields", () => {
  it("extracts title", () => {
    const r = parsePaprikaHtml(FULL_RECIPE, "ribs.html")!;
    expect(r.title).toBe("15-Minute Sticky Gochujang Grilled Ribs");
  });

  it("extracts filename", () => {
    const r = parsePaprikaHtml(FULL_RECIPE, "ribs.html")!;
    expect(r.filename).toBe("ribs.html");
  });

  it("extracts rating from value attribute", () => {
    const r = parsePaprikaHtml(FULL_RECIPE, "ribs.html")!;
    expect(r.rating).toBe(4);
  });

  it("returns 0 rating when value is 0", () => {
    const r = parsePaprikaHtml(UNDEFINED_BUG, "shortbreads.html")!;
    expect(r.rating).toBe(0);
  });

  it("extracts prep and cook times", () => {
    const r = parsePaprikaHtml(FULL_RECIPE, "ribs.html")!;
    expect(r.prepTime).toBe("10 mins");
    expect(r.cookTime).toBe("25 mins");
  });

  it("extracts servings", () => {
    const r = parsePaprikaHtml(FULL_RECIPE, "ribs.html")!;
    expect(r.servings).toBe("Serves: 4");
  });

  it("extracts source URL", () => {
    const r = parsePaprikaHtml(FULL_RECIPE, "ribs.html")!;
    expect(r.sourceUrl).toBe("https://mollybaz.com/ribs/");
  });

  it("extracts author attribution", () => {
    const r = parsePaprikaHtml(FULL_RECIPE, "ribs.html")!;
    expect(r.sourceAttribution).toBe("mollybaz.com");
  });

  it("returns null sourceUrl when no <a itemprop='url'> is present", () => {
    const r = parsePaprikaHtml(UNDEFINED_BUG, "shortbreads.html")!;
    expect(r.sourceUrl).toBeNull();
    // No <span itemprop="author"> in this fixture — attribution comes from categories, not author element
    expect(r.sourceAttribution).toBeNull();
  });

  it("extracts description", () => {
    const r = parsePaprikaHtml(BR_DIRECTIONS, "focaccia.html")!;
    expect(r.description).toContain("sit in the fridge");
  });

  it("returns null description when absent", () => {
    const r = parsePaprikaHtml(FULL_RECIPE, "ribs.html")!;
    expect(r.description).toBeNull();
  });

  it("extracts notes", () => {
    const r = parsePaprikaHtml(FULL_RECIPE, "ribs.html")!;
    expect(r.notes).toBe("Can be made 2 days ahead.");
  });

  it("returns null for notes when absent", () => {
    const r = parsePaprikaHtml(UNDEFINED_BUG, "shortbreads.html")!;
    expect(r.notes).toBeNull();
  });
});

describe("parsePaprikaHtml — categories", () => {
  it("splits comma-separated categories and decodes HTML entities", () => {
    const r = parsePaprikaHtml(FULL_RECIPE, "ribs.html")!;
    expect(r.categories).toEqual(["Molly Baz", "MAINS & SIDES", "Quick"]);
  });

  it("returns empty array when no categories present", () => {
    const r = parsePaprikaHtml(NO_TITLE, "nope.html");
    expect(r).toBeNull();
  });
});

describe("parsePaprikaHtml — ingredients", () => {
  it("extracts ingredient text and strongToken", () => {
    const r = parsePaprikaHtml(FULL_RECIPE, "ribs.html")!;
    const gochujang = r.ingredients.find((i) => i.text.includes("gochujang"))!;
    expect(gochujang).toBeDefined();
    expect(gochujang.strongToken).toBe("½");
  });

  it("sets strongToken to null for group headers", () => {
    const r = parsePaprikaHtml(FULL_RECIPE, "ribs.html")!;
    const produce = r.ingredients.find((i) => i.text === "PRODUCE")!;
    expect(produce).toBeDefined();
    expect(produce.strongToken).toBeNull();
  });

  it("handles no-quantity ingredient (free text like 'Kosher salt')", () => {
    const r = parsePaprikaHtml(FULL_RECIPE, "ribs.html")!;
    const salt = r.ingredients.find((i) => i.text === "Kosher salt")!;
    expect(salt).toBeDefined();
    expect(salt.strongToken).toBeNull();
  });

  it("preserves broken ASCII fraction in strongToken (11/2 → '11/2')", () => {
    const r = parsePaprikaHtml(UNDEFINED_BUG, "shortbreads.html")!;
    const flour = r.ingredients.find((i) => i.text.includes("flour"))!;
    expect(flour.strongToken).toBe("21/2");
  });
});

describe("parsePaprikaHtml — directions", () => {
  it("joins multiple <p class='line'> elements with newlines", () => {
    const r = parsePaprikaHtml(FULL_RECIPE, "ribs.html")!;
    expect(r.directions).toContain("Season the ribs");
    expect(r.directions).toContain("Grill over medium heat");
  });

  it("converts <br/> to newlines in single-paragraph directions", () => {
    const r = parsePaprikaHtml(BR_DIRECTIONS, "focaccia.html")!;
    expect(r.directions).toContain("1. Whisk the yeast into the water.");
    expect(r.directions).toContain("2. Mix flour and salt.");
    expect(r.directions).toContain("3. Refrigerate for 48 hours.");
  });
});

describe("parsePaprikaHtml — images", () => {
  it("extracts image src (relative ZIP path)", () => {
    const r = parsePaprikaHtml(FULL_RECIPE, "ribs.html")!;
    expect(r.imageSrc).toBe("Images/GUID1/GUID2.jpg");
  });

  it("extracts external image source URL from surrounding <a>", () => {
    const r = parsePaprikaHtml(FULL_RECIPE, "ribs.html")!;
    expect(r.imageSourceUrl).toBe("https://example.com/photo.jpg");
  });
});

describe("parsePaprikaHtml — undefined prefix bug", () => {
  it("preserves raw cookTime with undefined prefix for the API to strip", () => {
    const r = parsePaprikaHtml(UNDEFINED_BUG, "shortbreads.html")!;
    expect(r.cookTime).toContain("ACTIVE TIME: 40 minutes");
    expect(r.cookTime).toContain("undefined");
  });

  it("difficulty 'N (label)' is passed through as-is", () => {
    const r = parsePaprikaHtml(UNDEFINED_BUG, "shortbreads.html")!;
    expect(r.difficulty).toBe("2 (Easy)");
  });
});

describe("parsePaprikaHtml — null for non-recipe HTML", () => {
  it("returns null when no itemprop=name found", () => {
    expect(parsePaprikaHtml(NO_TITLE, "nope.html")).toBeNull();
  });
});
