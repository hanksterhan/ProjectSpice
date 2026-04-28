import { describe, expect, it } from "vitest";
import { buildImportTagNames, suggestImportTags } from "../import-tag-suggestions";

describe("suggestImportTags", () => {
  it("suggests matching tags from the existing vocabulary", () => {
    const suggestions = suggestImportTags({
      title: "Chicken Tacos",
      ingredients: ["1 lb chicken thighs", "corn tortillas", "lime"],
      directions: "Grill the chicken and serve in warm tortillas.",
      existingTags: ["Chicken", "Mexican", "Dessert"],
    });

    expect(suggestions).toEqual(["Chicken"]);
  });

  it("matches multi-word tags when all tag tokens are present", () => {
    const suggestions = suggestImportTags({
      title: "Creamy Weeknight Pasta",
      ingredients: ["spaghetti", "cream", "parmesan"],
      directions: "A fast dinner for busy nights.",
      existingTags: ["Weeknight Dinner", "Baking"],
    });

    expect(suggestions).toEqual(["Weeknight Dinner"]);
  });

  it("does not invent tags outside the existing vocabulary", () => {
    const suggestions = suggestImportTags({
      title: "Chocolate Cake",
      ingredients: ["cocoa powder", "flour"],
      directions: "Bake until set.",
      existingTags: ["Salad", "Soup"],
    });

    expect(suggestions).toEqual([]);
  });
});

describe("buildImportTagNames", () => {
  it("keeps source tags first and appends existing-vocabulary suggestions", () => {
    const tags = buildImportTagNames({
      title: "Garlic Chicken Pasta",
      ingredients: ["chicken breast", "penne", "garlic"],
      directions: "Toss pasta with chicken.",
      sourceTags: ["Italian"],
      existingTags: ["Chicken", "Pasta", "Dessert"],
    });

    expect(tags).toEqual(["Italian", "Chicken", "Pasta"]);
  });

  it("reuses existing tag casing for same-name source tags", () => {
    const tags = buildImportTagNames({
      title: "Pasta",
      sourceTags: ["italian", "PASTA"],
      existingTags: ["Italian", "Pasta"],
    });

    expect(tags).toEqual(["Italian", "Pasta"]);
  });

  it("deduplicates source tags and suggestions", () => {
    const tags = buildImportTagNames({
      title: "Chicken Dinner",
      ingredients: ["chicken"],
      sourceTags: ["Chicken", "chicken"],
      existingTags: ["Chicken"],
    });

    expect(tags).toEqual(["Chicken"]);
  });
});
