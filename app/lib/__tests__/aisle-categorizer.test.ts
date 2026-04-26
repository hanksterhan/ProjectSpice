import { describe, it, expect } from "vitest";
import { categorizeAisle, AISLE_ORDER } from "../aisle-categorizer";

describe("categorizeAisle", () => {
  it("assigns Produce for common vegetables", () => {
    expect(categorizeAisle("garlic")).toBe("Produce");
    expect(categorizeAisle("yellow onion")).toBe("Produce");
    expect(categorizeAisle("baby spinach")).toBe("Produce");
    expect(categorizeAisle("cherry tomatoes")).toBe("Produce");
  });

  it("assigns Produce for fresh fruit", () => {
    expect(categorizeAisle("lemon")).toBe("Produce");
    expect(categorizeAisle("ripe avocado")).toBe("Produce");
    expect(categorizeAisle("strawberries")).toBe("Produce");
    expect(categorizeAisle("mango")).toBe("Produce");
  });

  it("assigns Produce for fresh herbs", () => {
    expect(categorizeAisle("fresh basil")).toBe("Produce");
    expect(categorizeAisle("fresh cilantro")).toBe("Produce");
    expect(categorizeAisle("fresh thyme")).toBe("Produce");
  });

  it("assigns Dairy & Eggs for dairy products", () => {
    expect(categorizeAisle("whole milk")).toBe("Dairy & Eggs");
    expect(categorizeAisle("unsalted butter")).toBe("Dairy & Eggs");
    expect(categorizeAisle("heavy cream")).toBe("Dairy & Eggs");
    expect(categorizeAisle("sour cream")).toBe("Dairy & Eggs");
  });

  it("assigns Dairy & Eggs for cheese and eggs", () => {
    expect(categorizeAisle("parmesan cheese")).toBe("Dairy & Eggs");
    expect(categorizeAisle("feta")).toBe("Dairy & Eggs");
    expect(categorizeAisle("large eggs")).toBe("Dairy & Eggs");
    expect(categorizeAisle("cream cheese")).toBe("Dairy & Eggs");
  });

  it("assigns Meat & Poultry for chicken", () => {
    expect(categorizeAisle("boneless chicken breast")).toBe("Meat & Poultry");
    expect(categorizeAisle("ground beef")).toBe("Meat & Poultry");
    expect(categorizeAisle("bacon strips")).toBe("Meat & Poultry");
    expect(categorizeAisle("pork tenderloin")).toBe("Meat & Poultry");
  });

  it("assigns Seafood for fish and shellfish", () => {
    expect(categorizeAisle("fresh salmon fillet")).toBe("Seafood");
    expect(categorizeAisle("large shrimp")).toBe("Seafood");
    expect(categorizeAisle("sea scallops")).toBe("Seafood");
    expect(categorizeAisle("canned tuna")).toBe("Seafood");
  });

  it("assigns Bakery for bread products", () => {
    expect(categorizeAisle("sourdough bread")).toBe("Bakery");
    expect(categorizeAisle("pita bread")).toBe("Bakery");
    expect(categorizeAisle("panko breadcrumbs")).toBe("Bakery");
  });

  it("assigns Canned & Jarred for canned goods", () => {
    expect(categorizeAisle("tomato paste")).toBe("Canned & Jarred");
    expect(categorizeAisle("coconut milk")).toBe("Canned & Jarred");
    expect(categorizeAisle("chickpeas")).toBe("Canned & Jarred");
    expect(categorizeAisle("chicken broth")).toBe("Canned & Jarred");
    expect(categorizeAisle("soy sauce")).toBe("Canned & Jarred");
  });

  it("assigns Oils for cooking oils", () => {
    expect(categorizeAisle("extra virgin olive oil")).toBe("Oils");
    expect(categorizeAisle("sesame oil")).toBe("Oils");
    expect(categorizeAisle("coconut oil")).toBe("Oils");
  });

  it("assigns Spices & Seasonings for dried spices", () => {
    expect(categorizeAisle("cumin")).toBe("Spices & Seasonings");
    expect(categorizeAisle("smoked paprika")).toBe("Spices & Seasonings");
    expect(categorizeAisle("garlic powder")).toBe("Spices & Seasonings");
    expect(categorizeAisle("dried oregano")).toBe("Spices & Seasonings");
    expect(categorizeAisle("kosher salt")).toBe("Spices & Seasonings");
  });

  it("assigns Frozen for frozen products", () => {
    expect(categorizeAisle("frozen peas")).toBe("Frozen");
    expect(categorizeAisle("ice cream")).toBe("Frozen");
    expect(categorizeAisle("frozen berries")).toBe("Frozen");
  });

  it("assigns Pantry for baking staples", () => {
    expect(categorizeAisle("all-purpose flour")).toBe("Pantry");
    expect(categorizeAisle("baking powder")).toBe("Pantry");
    expect(categorizeAisle("granulated sugar")).toBe("Pantry");
    expect(categorizeAisle("brown sugar")).toBe("Pantry");
  });

  it("assigns Pantry for pasta and rice", () => {
    expect(categorizeAisle("spaghetti")).toBe("Pantry");
    expect(categorizeAisle("basmati rice")).toBe("Pantry");
    expect(categorizeAisle("quinoa")).toBe("Pantry");
  });

  it("assigns Pantry for nuts and dried fruit", () => {
    expect(categorizeAisle("walnuts")).toBe("Pantry");
    expect(categorizeAisle("raisins")).toBe("Pantry");
    expect(categorizeAisle("dried cranberries")).toBe("Pantry");
  });

  it("falls back to Other for unknown items", () => {
    expect(categorizeAisle("xylophone strings")).toBe("Other");
    expect(categorizeAisle("widget parts")).toBe("Other");
    expect(categorizeAisle("mystery ingredient")).toBe("Other");
  });

  it("is case-insensitive", () => {
    expect(categorizeAisle("GARLIC")).toBe("Produce");
    expect(categorizeAisle("Chicken Breast")).toBe("Meat & Poultry");
    expect(categorizeAisle("Olive Oil")).toBe("Oils");
  });

  it("matches substrings within longer names", () => {
    expect(categorizeAisle("2 large eggs, beaten")).toBe("Dairy & Eggs");
    expect(categorizeAisle("1 cup whole milk, warmed")).toBe("Dairy & Eggs");
    expect(categorizeAisle("3 cloves garlic, minced")).toBe("Produce");
  });
});

describe("AISLE_ORDER", () => {
  it("starts with Produce and ends with Other", () => {
    expect(AISLE_ORDER[0]).toBe("Produce");
    expect(AISLE_ORDER[AISLE_ORDER.length - 1]).toBe("Other");
  });

  it("contains all expected aisles", () => {
    const required = [
      "Produce", "Dairy & Eggs", "Meat & Poultry", "Seafood",
      "Bakery", "Canned & Jarred", "Oils", "Spices & Seasonings",
      "Frozen", "Pantry", "Other",
    ];
    for (const aisle of required) {
      expect(AISLE_ORDER).toContain(aisle);
    }
  });
});
