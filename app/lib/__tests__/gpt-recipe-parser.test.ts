import { describe, it, expect } from "vitest";
import { parseGptRecipe } from "../gpt-recipe-parser";

// ─── Fixtures ─────────────────────────────────────────────────────────────────

const FULL_TEMPLATE = `
---
PROJECTSPICE_RECIPE_V1
---

# Classic Spaghetti Carbonara

**Servings:** 4
**Prep Time:** 15 min
**Cook Time:** 20 min
**Tags:** Italian, Pasta, Quick
**Source:** https://example.com/carbonara

## Ingredients

- 400g spaghetti
- 200g pancetta, diced
- 4 large eggs
- 100g Parmesan cheese, grated
- 2 cloves garlic, minced
- salt and pepper to taste

## Directions

1. Boil pasta in salted water until al dente.
2. Fry pancetta and garlic until crispy.
3. Whisk eggs and Parmesan together.
4. Drain pasta, toss with pancetta, then egg mixture off heat.
5. Season with salt and pepper.

## Notes (optional)

Use guanciale instead of pancetta for a more authentic flavor.
`.trim();

// ─── Tests ────────────────────────────────────────────────────────────────────

describe("parseGptRecipe", () => {
  it("parses a complete valid template correctly", () => {
    const result = parseGptRecipe(FULL_TEMPLATE);
    expect(result).not.toBeNull();
    expect(result!.title).toBe("Classic Spaghetti Carbonara");
    expect(result!.servings).toBe(4);
    expect(result!.servingsUnit).toBeNull();
    expect(result!.prepTimeMin).toBe(15);
    expect(result!.cookTimeMin).toBe(20);
    expect(result!.tags).toEqual(["Italian", "Pasta", "Quick"]);
    expect(result!.sourceUrl).toBe("https://example.com/carbonara");
    expect(result!.ingredients).toHaveLength(6);
    expect(result!.ingredients[0]).toBe("400g spaghetti");
    expect(result!.directions).toContain("Boil pasta");
    expect(result!.notes).toContain("guanciale");
  });

  it("parses successfully without the PROJECTSPICE_RECIPE_V1 marker when structure is present", () => {
    const noMarker = FULL_TEMPLATE.replace(/---\nPROJECTSPICE_RECIPE_V1\n---\n\n/, "");
    const result = parseGptRecipe(noMarker);
    expect(result).not.toBeNull();
    expect(result!.title).toBe("Classic Spaghetti Carbonara");
    expect(result!.ingredients).toHaveLength(6);
  });

  it("handles Tags = 'none' and returns empty array", () => {
    const text = FULL_TEMPLATE.replace(
      "**Tags:** Italian, Pasta, Quick",
      "**Tags:** none"
    );
    const result = parseGptRecipe(text);
    expect(result).not.toBeNull();
    expect(result!.tags).toEqual([]);
  });

  it("handles Source = 'original' and returns null sourceUrl", () => {
    const text = FULL_TEMPLATE.replace(
      "**Source:** https://example.com/carbonara",
      "**Source:** original"
    );
    const result = parseGptRecipe(text);
    expect(result).not.toBeNull();
    expect(result!.sourceUrl).toBeNull();
  });

  it("handles missing Notes section", () => {
    const text = FULL_TEMPLATE.replace(/\n\n## Notes \(optional\)\n[\s\S]*$/, "");
    const result = parseGptRecipe(text);
    expect(result).not.toBeNull();
    expect(result!.notes).toBeNull();
  });

  it("parses prep/cook time: '1 hr 30 min'", () => {
    const text = FULL_TEMPLATE
      .replace("**Prep Time:** 15 min", "**Prep Time:** 1 hr 30 min")
      .replace("**Cook Time:** 20 min", "**Cook Time:** 1 hr 30 min");
    const result = parseGptRecipe(text);
    expect(result).not.toBeNull();
    expect(result!.prepTimeMin).toBe(90);
    expect(result!.cookTimeMin).toBe(90);
  });

  it("parses prep/cook time: '45 minutes'", () => {
    const text = FULL_TEMPLATE
      .replace("**Prep Time:** 15 min", "**Prep Time:** 45 minutes")
      .replace("**Cook Time:** 20 min", "**Cook Time:** 45 minutes");
    const result = parseGptRecipe(text);
    expect(result).not.toBeNull();
    expect(result!.prepTimeMin).toBe(45);
    expect(result!.cookTimeMin).toBe(45);
  });

  it("parses prep/cook time: '2 hours'", () => {
    const text = FULL_TEMPLATE
      .replace("**Prep Time:** 15 min", "**Prep Time:** 2 hours")
      .replace("**Cook Time:** 20 min", "**Cook Time:** 2 hours");
    const result = parseGptRecipe(text);
    expect(result).not.toBeNull();
    expect(result!.prepTimeMin).toBe(120);
    expect(result!.cookTimeMin).toBe(120);
  });

  it("extracts multiple tags separated by commas", () => {
    const text = FULL_TEMPLATE.replace(
      "**Tags:** Italian, Pasta, Quick",
      "**Tags:** Weeknight, Comfort Food, Family Favorite, Vegetarian"
    );
    const result = parseGptRecipe(text);
    expect(result).not.toBeNull();
    expect(result!.tags).toEqual(["Weeknight", "Comfort Food", "Family Favorite", "Vegetarian"]);
  });

  it("returns null for completely unstructured text", () => {
    const result = parseGptRecipe("Some random text with no recipe structure.");
    expect(result).toBeNull();
  });

  it("returns null for empty string", () => {
    const result = parseGptRecipe("");
    expect(result).toBeNull();
  });

  it("handles extra whitespace around bold markers", () => {
    const text = FULL_TEMPLATE
      .replace("**Servings:** 4", "** Servings : ** 4")
      .replace("**Prep Time:** 15 min", "**  Prep Time  :** 15 min");
    // The parser should be forgiving — if it can't match, it should not crash
    const result = parseGptRecipe(text);
    expect(result).not.toBeNull();
    // These specific oddly-spaced fields may or may not parse — just verify no throw
  });

  it("handles directions as free-form paragraphs (not numbered list)", () => {
    const text = FULL_TEMPLATE.replace(
      /## Directions\n\n[\s\S]*?\n\n## Notes/,
      `## Directions\n\nBoil the pasta. Meanwhile, fry the pancetta. Combine everything off heat.\n\n## Notes`
    );
    const result = parseGptRecipe(text);
    expect(result).not.toBeNull();
    expect(result!.directions).toContain("Boil the pasta");
    expect(result!.directions).toContain("fry the pancetta");
  });

  it("handles directions with numbered list steps", () => {
    const result = parseGptRecipe(FULL_TEMPLATE);
    expect(result).not.toBeNull();
    expect(result!.directions).toMatch(/1\./);
    expect(result!.directions).toMatch(/5\./);
  });

  it("passes through ingredient group headers (non-bullet lines) as-is", () => {
    const text = FULL_TEMPLATE.replace(
      "## Ingredients\n\n- 400g spaghetti",
      "## Ingredients\n\nFor the pasta:\n- 400g spaghetti"
    );
    const result = parseGptRecipe(text);
    expect(result).not.toBeNull();
    // Group header should be included
    expect(result!.ingredients).toContain("For the pasta:");
    expect(result!.ingredients).toContain("400g spaghetti");
  });

  it("handles * bullet style for ingredients", () => {
    const text = FULL_TEMPLATE.replace(
      "- 400g spaghetti\n- 200g pancetta, diced",
      "* 400g spaghetti\n* 200g pancetta, diced"
    );
    const result = parseGptRecipe(text);
    expect(result).not.toBeNull();
    expect(result!.ingredients[0]).toBe("400g spaghetti");
    expect(result!.ingredients[1]).toBe("200g pancetta, diced");
  });

  it("handles missing optional fields gracefully", () => {
    const minimal = `---
PROJECTSPICE_RECIPE_V1
---

# Simple Toast

## Ingredients

- 2 slices bread
- butter

## Directions

Toast bread. Spread butter.
`;
    const result = parseGptRecipe(minimal);
    expect(result).not.toBeNull();
    expect(result!.title).toBe("Simple Toast");
    expect(result!.servings).toBeNull();
    expect(result!.prepTimeMin).toBeNull();
    expect(result!.cookTimeMin).toBeNull();
    expect(result!.tags).toEqual([]);
    expect(result!.sourceUrl).toBeNull();
    expect(result!.notes).toBeNull();
    expect(result!.ingredients).toContain("2 slices bread");
    expect(result!.directions).toContain("Toast bread");
  });

  it("strips 'none' from tags case-insensitively", () => {
    const text = FULL_TEMPLATE.replace("**Tags:** Italian, Pasta, Quick", "**Tags:** None");
    const result = parseGptRecipe(text);
    expect(result).not.toBeNull();
    expect(result!.tags).toEqual([]);
  });
});
