import { describe, it, expect } from "vitest";
import {
  parseIngredientLine,
  normalizeUnicodeFractions,
  fixBrokenAsciiFractions,
} from "../ingredient-parser";

// ---------------------------------------------------------------------------
// Helper – approximate equality for floats
// ---------------------------------------------------------------------------
function approx(actual: number | null, expected: number, tolerance = 0.005): boolean {
  if (actual === null) return false;
  return Math.abs(actual - expected) <= tolerance;
}

// ---------------------------------------------------------------------------
// SECTION: Helper function unit tests (4 cases)
// ---------------------------------------------------------------------------

describe("normalizeUnicodeFractions", () => {
  it("converts standalone ½ to 0.5", () => {
    expect(normalizeUnicodeFractions("½")).toBe("0.5");
  });

  it("converts standalone ¼ to 0.25", () => {
    expect(normalizeUnicodeFractions("¼")).toBe("0.25");
  });

  it("converts compound 1½ to 1.5", () => {
    expect(normalizeUnicodeFractions("1½")).toBe("1.5");
  });

  it("converts compound 2¾ to 2.75", () => {
    expect(normalizeUnicodeFractions("2¾")).toBe("2.75");
  });

  it("converts ⅓ to approx 0.333", () => {
    const result = normalizeUnicodeFractions("⅓");
    expect(parseFloat(result)).toBeCloseTo(1 / 3, 3);
  });

  it("converts ⅔ to approx 0.667", () => {
    const result = normalizeUnicodeFractions("⅔");
    expect(parseFloat(result)).toBeCloseTo(2 / 3, 3);
  });
});

describe("fixBrokenAsciiFractions", () => {
  it("fixes 11/2 to 1 1/2", () => {
    expect(fixBrokenAsciiFractions("11/2")).toBe("1 1/2");
  });

  it("leaves plain text unchanged", () => {
    expect(fixBrokenAsciiFractions("2 cups")).toBe("2 cups");
  });

  it("fixes 21/2 to 2 1/2", () => {
    expect(fixBrokenAsciiFractions("21/2")).toBe("2 1/2");
  });

  it("fixes 31/4 to 3 1/4", () => {
    expect(fixBrokenAsciiFractions("31/4")).toBe("3 1/4");
  });

  it("fixes 11/4 to 1 1/4", () => {
    expect(fixBrokenAsciiFractions("11/4")).toBe("1 1/4");
  });
});

// ---------------------------------------------------------------------------
// SECTION: Unicode fractions (8 cases)
// ---------------------------------------------------------------------------

describe("parseIngredientLine – unicode fractions", () => {
  it("½ tsp salt → quantity_decimal ≈ 0.5", () => {
    const r = parseIngredientLine("½ tsp salt", null);
    expect(approx(r.quantity_decimal, 0.5)).toBe(true);
    expect(r.unit_canonical).toBe("tsp");
  });

  it("¼ cup butter → quantity_decimal ≈ 0.25", () => {
    const r = parseIngredientLine("¼ cup butter", null);
    expect(approx(r.quantity_decimal, 0.25)).toBe(true);
    expect(r.unit_canonical).toBe("cup");
  });

  it("¾ cup sugar → quantity_decimal ≈ 0.75", () => {
    const r = parseIngredientLine("¾ cup sugar", null);
    expect(approx(r.quantity_decimal, 0.75)).toBe(true);
  });

  it("⅓ cup milk → quantity_decimal ≈ 0.333", () => {
    const r = parseIngredientLine("⅓ cup milk", null);
    expect(approx(r.quantity_decimal, 1 / 3, 0.005)).toBe(true);
  });

  it("⅔ cup flour → quantity_decimal ≈ 0.667", () => {
    const r = parseIngredientLine("⅔ cup flour", null);
    expect(approx(r.quantity_decimal, 2 / 3, 0.005)).toBe(true);
  });

  it("1½ cups flour → quantity_decimal ≈ 1.5", () => {
    const r = parseIngredientLine("1½ cups flour", null);
    expect(approx(r.quantity_decimal, 1.5)).toBe(true);
  });

  it("2¼ cups milk → quantity_decimal ≈ 2.25", () => {
    const r = parseIngredientLine("2¼ cups milk", null);
    expect(approx(r.quantity_decimal, 2.25)).toBe(true);
  });

  it("1 ½ cups broth → quantity_decimal ≈ 1.5", () => {
    // Space between whole and fraction — after normalization becomes "1 0.5 cups broth"
    // The parser should still sum them to ~1.5
    const r = parseIngredientLine("1 ½ cups broth", null);
    expect(approx(r.quantity_decimal, 1.5)).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// SECTION: Broken ASCII fractions (5 cases)
// ---------------------------------------------------------------------------

describe("parseIngredientLine – broken ASCII fractions", () => {
  it("11/2 cups flour → quantity_decimal ≈ 1.5", () => {
    const r = parseIngredientLine("11/2 cups flour", null);
    expect(approx(r.quantity_decimal, 1.5)).toBe(true);
    expect(r.unit_canonical).toBe("cup");
  });

  it("21/2 tsp vanilla → quantity_decimal ≈ 2.5", () => {
    const r = parseIngredientLine("21/2 tsp vanilla", null);
    expect(approx(r.quantity_decimal, 2.5)).toBe(true);
  });

  it("31/4 cups broth → quantity_decimal ≈ 3.25", () => {
    const r = parseIngredientLine("31/4 cups broth", null);
    expect(approx(r.quantity_decimal, 3.25)).toBe(true);
  });

  it("11/4 tsp salt → quantity_decimal ≈ 1.25", () => {
    const r = parseIngredientLine("11/4 tsp salt", null);
    expect(approx(r.quantity_decimal, 1.25)).toBe(true);
  });

  it("11/3 cups sugar → quantity_decimal ≈ 1.333", () => {
    const r = parseIngredientLine("11/3 cups sugar", null);
    expect(approx(r.quantity_decimal, 4 / 3, 0.005)).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// SECTION: Weight-in-parens (6 cases)
// ---------------------------------------------------------------------------

describe("parseIngredientLine – weight in parens", () => {
  it("(14.5 oz / 411g) — prefers g → weight_g ≈ 411", () => {
    const r = parseIngredientLine(
      "1 can (14.5 oz / 411g) diced tomatoes, drained",
      null
    );
    expect(approx(r.weight_g, 411, 1)).toBe(true);
    expect(r.name).toMatch(/diced tomatoes/i);
  });

  it("(1 oz) capers → weight_g ≈ 28.35", () => {
    const r = parseIngredientLine("2 tablespoons (1 oz) capers", null);
    expect(r.weight_g).not.toBeNull();
    expect(approx(r.weight_g, 28.3495, 0.1)).toBe(true);
  });

  it("(250g) firm tofu → weight_g ≈ 250", () => {
    const r = parseIngredientLine("1 block (250g) firm tofu", null);
    expect(approx(r.weight_g, 250, 1)).toBe(true);
  });

  it("weight NOT in parens → weight_g = null", () => {
    const r = parseIngredientLine("6.1 oz / 173g dark chocolate", null);
    expect(r.weight_g).toBeNull();
  });

  it("(6.1 oz / 173g) dark chocolate → weight_g ≈ 173", () => {
    const r = parseIngredientLine("(6.1 oz / 173g) dark chocolate", null);
    expect(approx(r.weight_g, 173, 1)).toBe(true);
  });

  it("(1 lb) ground beef → weight_g ≈ 453.59", () => {
    const r = parseIngredientLine("1 package (1 lb) ground beef", null);
    expect(approx(r.weight_g, 453.592, 0.5)).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// SECTION: Footnote markers (4 cases)
// ---------------------------------------------------------------------------

describe("parseIngredientLine – footnote markers", () => {
  it("olive oil ① → footnote_ref='①', name has no ①", () => {
    const r = parseIngredientLine("2 tbsp olive oil ①", null);
    expect(r.footnote_ref).toBe("①");
    expect(r.name).not.toContain("①");
  });

  it("garlic ②③ → footnote_ref='②③'", () => {
    const r = parseIngredientLine("3 cloves garlic ②③", null);
    expect(r.footnote_ref).toBe("②③");
  });

  it("flour ⑤ → footnote_ref='⑤'", () => {
    const r = parseIngredientLine("1 cup flour ⑤", null);
    expect(r.footnote_ref).toBe("⑤");
  });

  it("salt and pepper → footnote_ref=null", () => {
    const r = parseIngredientLine("salt and pepper", null);
    expect(r.footnote_ref).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// SECTION: Group headers (8 cases)
// ---------------------------------------------------------------------------

describe("parseIngredientLine – group headers", () => {
  it("strongToken='PRODUCE' → is_group_header=true", () => {
    const r = parseIngredientLine("PRODUCE", "PRODUCE");
    expect(r.is_group_header).toBe(true);
    expect(r.name).toBe("PRODUCE");
  });

  it("strongToken='FOR THE SAUCE' → is_group_header=true", () => {
    const r = parseIngredientLine("FOR THE SAUCE", "FOR THE SAUCE");
    expect(r.is_group_header).toBe(true);
  });

  it("strongToken='Dressing' → is_group_header=true", () => {
    const r = parseIngredientLine("Dressing", "Dressing");
    expect(r.is_group_header).toBe(true);
  });

  it("strongToken='SALAD' → is_group_header=true", () => {
    const r = parseIngredientLine("SALAD", "SALAD");
    expect(r.is_group_header).toBe(true);
  });

  it("strongToken='1/2' → is_group_header=false (quantity)", () => {
    const r = parseIngredientLine("1/2 cup sugar", "1/2");
    expect(r.is_group_header).toBe(false);
  });

  it("strongToken='½' → is_group_header=false (unicode fraction)", () => {
    const r = parseIngredientLine("½ tsp salt", "½");
    expect(r.is_group_header).toBe(false);
  });

  it("strongToken='2' → is_group_header=false (digit)", () => {
    const r = parseIngredientLine("2 cups flour", "2");
    expect(r.is_group_header).toBe(false);
  });

  it("strongToken=null → is_group_header=false", () => {
    const r = parseIngredientLine("2 cups flour", null);
    expect(r.is_group_header).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// SECTION: Standard ingredient lines (10 cases)
// ---------------------------------------------------------------------------

describe("parseIngredientLine – standard ingredient lines", () => {
  it("2 cups all-purpose flour", () => {
    const r = parseIngredientLine("2 cups all-purpose flour", null);
    expect(r.quantity_decimal).toBe(2);
    expect(r.unit_canonical).toBe("cup");
    expect(r.name).toMatch(/all-purpose flour/i);
  });

  it("1 tsp kosher salt", () => {
    const r = parseIngredientLine("1 tsp kosher salt", null);
    expect(r.quantity_decimal).toBe(1);
    expect(r.unit_canonical).toBe("tsp");
    expect(r.name).toMatch(/salt/i);
  });

  it("3 tablespoons olive oil", () => {
    const r = parseIngredientLine("3 tablespoons olive oil", null);
    expect(r.quantity_decimal).toBe(3);
    expect(r.unit_canonical).toBe("tbsp");
  });

  it("1 lb boneless chicken thighs", () => {
    const r = parseIngredientLine("1 lb boneless chicken thighs", null);
    expect(r.quantity_decimal).toBe(1);
    expect(r.unit_canonical).toBe("lb");
  });

  it("4 oz cream cheese, softened", () => {
    const r = parseIngredientLine("4 oz cream cheese, softened", null);
    expect(r.unit_canonical).toBe("oz");
  });

  it("200g unsalted butter", () => {
    const r = parseIngredientLine("200g unsalted butter", null);
    expect(r.unit_canonical).toBe("g");
    expect(r.quantity_decimal).toBe(200);
  });

  it("500ml whole milk", () => {
    const r = parseIngredientLine("500ml whole milk", null);
    expect(r.unit_canonical).toBe("ml");
    expect(r.quantity_decimal).toBe(500);
  });

  it("salt and pepper to taste → quantity_decimal=null", () => {
    const r = parseIngredientLine("salt and pepper to taste", null);
    expect(r.quantity_decimal).toBeNull();
  });

  it("2 large eggs", () => {
    const r = parseIngredientLine("2 large eggs", null);
    expect(r.quantity_decimal).toBe(2);
  });

  it("1 bunch fresh parsley → unit_canonical='bunch'", () => {
    const r = parseIngredientLine("1 bunch fresh parsley", null);
    expect(r.unit_canonical).toBe("bunch");
  });
});

// ---------------------------------------------------------------------------
// SECTION: Paprika real-world edge cases (10 cases)
// ---------------------------------------------------------------------------

describe("parseIngredientLine – Paprika real-world edge cases", () => {
  it("11/2 pounds boneless, skinless chicken thighs", () => {
    const r = parseIngredientLine(
      "11/2 pounds boneless, skinless chicken thighs",
      null
    );
    expect(approx(r.quantity_decimal, 1.5)).toBe(true);
    expect(r.unit_canonical).toBe("lb");
  });

  it("2 tablespoons (28g) unsalted butter → weight_g≈28, unit_canonical='tbsp'", () => {
    const r = parseIngredientLine(
      "2 tablespoons (28g) unsalted butter",
      null
    );
    expect(approx(r.weight_g, 28, 1)).toBe(true);
    expect(r.unit_canonical).toBe("tbsp");
  });

  it("1 can (14 oz) coconut milk → unit_canonical='can', weight_g≈396.89", () => {
    const r = parseIngredientLine("1 can (14 oz) coconut milk", null);
    expect(r.unit_canonical).toBe("can");
    expect(approx(r.weight_g, 14 * 28.3495, 1)).toBe(true);
  });

  it("3 cloves garlic, minced ① → footnote_ref='①'", () => {
    const r = parseIngredientLine("3 cloves garlic, minced ①", null);
    expect(r.footnote_ref).toBe("①");
    expect(r.name).not.toContain("①");
  });

  it("1½ teaspoons ground cumin → quantity_decimal≈1.5, unit_canonical='tsp'", () => {
    const r = parseIngredientLine("1½ teaspoons ground cumin", null);
    expect(approx(r.quantity_decimal, 1.5)).toBe(true);
    expect(r.unit_canonical).toBe("tsp");
  });

  it("¼ cup freshly squeezed lemon juice → quantity_decimal≈0.25", () => {
    const r = parseIngredientLine(
      "¼ cup freshly squeezed lemon juice",
      null
    );
    expect(approx(r.quantity_decimal, 0.25)).toBe(true);
  });

  it("21/2 cups chicken stock → quantity_decimal≈2.5", () => {
    const r = parseIngredientLine("21/2 cups chicken stock", null);
    expect(approx(r.quantity_decimal, 2.5)).toBe(true);
  });

  it("6 large eggs, beaten → quantity_decimal=6", () => {
    const r = parseIngredientLine("6 large eggs, beaten", null);
    expect(r.quantity_decimal).toBe(6);
  });

  it("1 cup (240ml) heavy cream → weight_g=null, unit_canonical='cup'", () => {
    // ml is not a weight — weight_g should be null
    const r = parseIngredientLine("1 cup (240ml) heavy cream", null);
    expect(r.weight_g).toBeNull();
    expect(r.unit_canonical).toBe("cup");
  });

  it("pinch of cayenne pepper → unit_canonical='pinch'", () => {
    const r = parseIngredientLine("pinch of cayenne pepper", null);
    expect(r.unit_canonical).toBe("pinch");
  });
});
