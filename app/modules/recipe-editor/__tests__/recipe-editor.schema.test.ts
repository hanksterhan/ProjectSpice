import { describe, expect, it } from "vitest";

import { createEmptyRecipeDraft } from "~/modules/recipe-domain";

import {
  parseRecipeEditorNotes,
  parseRecipeEditorTags,
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
  });

  it("validates metadata and merges it into a recipe draft", () => {
    const values = recipeEditorFormSchema.parse({
      title: " Lemon Icebox Pie ",
      description: "Bright and chilled.",
      imageUrl: "https://images.example.com/lemon-pie.jpg",
      tagsText: "dessert, citrus",
      prepMinutes: "20",
      cookMinutes: "",
      totalMinutes: "260",
      yieldQuantity: "8",
      yieldUnit: "slices",
      yieldNotes: "Makes one 9-inch pie",
      notesText: "Use fresh lemon juice.",
      sourceName: "Project Spice",
      sourceUrl: "https://spice.h6nk.dev",
    });

    const draft = validateRecipeEditorDraft(values, createEmptyRecipeDraft());

    expect(draft.title).toBe("Lemon Icebox Pie");
    expect(draft.tags).toEqual(["dessert", "citrus"]);
    expect(draft.times).toEqual({ prepMinutes: 20, totalMinutes: 260 });
    expect(draft.yield).toEqual({
      quantity: 8,
      unit: "slices",
      notes: "Makes one 9-inch pie",
    });
    expect(draft.notes).toEqual(["Use fresh lemon juice."]);
    expect(draft.imageUrl).toBe("https://images.example.com/lemon-pie.jpg");
  });

  it("rejects invalid URLs and negative timing values", () => {
    const result = recipeEditorFormSchema.safeParse({
      title: "Pie",
      description: "",
      imageUrl: "not-a-url",
      tagsText: "",
      prepMinutes: "-1",
      cookMinutes: "",
      totalMinutes: "",
      yieldQuantity: "",
      yieldUnit: "",
      yieldNotes: "",
      notesText: "",
      sourceName: "",
      sourceUrl: "",
    });

    expect(result.success).toBe(false);
  });
});
