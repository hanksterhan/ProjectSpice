import { describe, expect, it } from "vitest";

import { createEmptyRecipeDraft } from "~/modules/recipe-domain";

import {
  parseRecipeEditorNotes,
  parseRecipeEditorTags,
  parseRecipeEditorIngredientRefs,
  recipeEditorFormSchema,
  validateRecipeEditorDraft,
} from "../index";

describe("recipe editor schema", () => {
  it("parses tags and notes into canonical arrays", () => {
    expect(parseRecipeEditorTags("dessert, make-ahead, chilled")).toEqual([
      "dessert",
      "make-ahead",
      "chilled",
    ]);
    expect(parseRecipeEditorNotes("Chill overnight.\n\nServe cold.")).toEqual([
      "Chill overnight.",
      "Serve cold.",
    ]);
    expect(parseRecipeEditorIngredientRefs("crumbs, salt, ")).toEqual([
      "crumbs",
      "salt",
    ]);
  });

  it("validates metadata and merges it into a recipe draft", () => {
    const values = recipeEditorFormSchema.parse({
      title: " Lemon Icebox Pie ",
      description: "Bright and chilled.",
      imageUrl: "https://images.example.com/lemon-pie.jpg",
      tagsText: "dessert, citrus",
      favorite: true,
      rating: "9.3",
      prepMinutes: "20",
      cookMinutes: "",
      totalMinutes: "260",
      yieldQuantity: "8",
      yieldUnit: "slices",
      yieldNotes: "Makes one 9-inch pie",
      notesText: "Use fresh lemon juice.",
      sourceName: "Project Spice",
      sourceUrl: "https://spice.h6nk.dev",
      ingredientSections: [
        {
          id: "crust",
          title: "Crust",
          items: [
            {
              id: "crumbs",
              raw: "1 1/2 cups graham cracker crumbs",
              quantity: "1.5",
              unit: "cups",
              item: "graham cracker crumbs",
              preparation: "",
              optional: false,
            },
            {
              id: "salt",
              raw: "Pinch salt, optional",
              quantity: "",
              unit: "",
              item: "salt",
              preparation: "",
              optional: true,
            },
          ],
        },
      ],
      directionSections: [
        {
          id: "assembly",
          title: "Assembly",
          steps: [
            {
              id: "chill",
              text: "Chill until set.",
              timerMinutes: "240",
              ingredientRefsText: "crumbs, salt",
            },
            {
              id: "serve",
              text: "Slice and serve cold.",
              timerMinutes: "",
              ingredientRefsText: "",
            },
          ],
        },
      ],
    });

    const draft = validateRecipeEditorDraft(values, createEmptyRecipeDraft());

    expect(draft.title).toBe("Lemon Icebox Pie");
    expect(draft.favorite).toBe(true);
    expect(draft.rating).toBe(9.3);
    expect(draft.tags).toEqual(["dessert", "citrus"]);
    expect(draft.times).toEqual({ prepMinutes: 20, totalMinutes: 260 });
    expect(draft.yield).toEqual({
      quantity: 8,
      unit: "slices",
      notes: "Makes one 9-inch pie",
    });
    expect(draft.notes).toEqual(["Use fresh lemon juice."]);
    expect(draft.imageUrl).toBe("https://images.example.com/lemon-pie.jpg");
    expect(draft.ingredients).toEqual([
      {
        id: "crust",
        title: "Crust",
        items: [
          {
            id: "crumbs",
            raw: "1 1/2 cups graham cracker crumbs",
            quantity: 1.5,
            unit: "cups",
            item: "graham cracker crumbs",
          },
          {
            id: "salt",
            raw: "Pinch salt, optional",
            item: "salt",
            optional: true,
          },
        ],
      },
    ]);
    expect(draft.directions).toEqual([
      {
        id: "assembly",
        title: "Assembly",
        steps: [
          {
            id: "chill",
            order: 1,
            text: "Chill until set.",
            timerMinutes: 240,
            ingredientRefs: ["crumbs", "salt"],
          },
          {
            id: "serve",
            order: 2,
            text: "Slice and serve cold.",
          },
        ],
      },
    ]);
  });

  it("rejects invalid URLs, negative timing values, invalid ingredients, and invalid directions", () => {
    const result = recipeEditorFormSchema.safeParse({
      title: "Pie",
      description: "",
      imageUrl: "not-a-url",
      tagsText: "",
      favorite: false,
      rating: "8.25",
      prepMinutes: "-1",
      cookMinutes: "",
      totalMinutes: "",
      yieldQuantity: "",
      yieldUnit: "",
      yieldNotes: "",
      notesText: "",
      sourceName: "",
      sourceUrl: "",
      ingredientSections: [
        {
          id: "ingredients",
          title: "",
          items: [
            {
              id: "bad-item",
              raw: "",
              quantity: "-2",
              unit: "",
              item: "",
              preparation: "",
              optional: false,
            },
          ],
        },
      ],
      directionSections: [
        {
          id: "directions",
          title: "",
          steps: [
            {
              id: "bad-step",
              text: "",
              timerMinutes: "-5",
              ingredientRefsText: "",
            },
          ],
        },
      ],
    });

    expect(result.success).toBe(false);
  });
});
