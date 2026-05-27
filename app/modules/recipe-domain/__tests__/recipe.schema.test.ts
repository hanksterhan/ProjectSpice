import { describe, expect, it } from "vitest";

import {
  recipeDraftSchema,
  recipeSchema,
  validRecipeDraftFixture,
  validRecipeFixture,
  validRecipeWithoutImageFixture,
} from "../index";

describe("recipeSchema", () => {
  it("accepts a valid canonical recipe", () => {
    expect(recipeSchema.parse(validRecipeFixture)).toMatchObject({
      id: "weeknight-sesame-chicken-bowls",
      title: "Weeknight Sesame Chicken Bowls",
      imageUrl: "https://images.example.com/weeknight-sesame-chicken-bowls.jpg",
    });
  });

  it("accepts a valid recipe without an optional image URL", () => {
    expect(recipeSchema.parse(validRecipeWithoutImageFixture)).not.toHaveProperty(
      "imageUrl",
    );
  });

  it("rejects an invalid image URL", () => {
    const result = recipeSchema.safeParse({
      ...validRecipeFixture,
      imageUrl: "not-a-url",
    });

    expect(result.success).toBe(false);
  });

  it("rejects missing required recipe fields", () => {
    const { title: _title, ...recipeWithoutTitle } = validRecipeFixture;

    const result = recipeSchema.safeParse(recipeWithoutTitle);

    expect(result.success).toBe(false);
  });

  it("rejects empty ingredient sections", () => {
    const result = recipeSchema.safeParse({
      ...validRecipeFixture,
      ingredients: [
        {
          id: "empty-section",
          title: "Empty section",
          items: [],
        },
      ],
    });

    expect(result.success).toBe(false);
  });

  it("rejects ingredient items without readable raw text", () => {
    const result = recipeSchema.safeParse({
      ...validRecipeFixture,
      ingredients: [
        {
          ...validRecipeFixture.ingredients[0],
          items: [
            {
              ...validRecipeFixture.ingredients[0].items[0],
              raw: "",
            },
          ],
        },
      ],
    });

    expect(result.success).toBe(false);
  });

  it("rejects direction steps without positive order values", () => {
    const result = recipeSchema.safeParse({
      ...validRecipeFixture,
      directions: [
        {
          ...validRecipeFixture.directions[0],
          steps: [
            {
              ...validRecipeFixture.directions[0].steps[0],
              order: 0,
            },
          ],
        },
      ],
    });

    expect(result.success).toBe(false);
  });

  it("rejects direction sections without steps", () => {
    const result = recipeSchema.safeParse({
      ...validRecipeFixture,
      directions: [
        {
          id: "empty-directions",
          title: "Empty directions",
          steps: [],
        },
      ],
    });

    expect(result.success).toBe(false);
  });
});

describe("recipeDraftSchema", () => {
  it("accepts valid recipe drafts before persistence fields are assigned", () => {
    expect(recipeDraftSchema.parse(validRecipeDraftFixture)).toMatchObject({
      title: "Lemony White Bean Toasts",
      source: {
        type: "ai",
      },
    });
  });
});
