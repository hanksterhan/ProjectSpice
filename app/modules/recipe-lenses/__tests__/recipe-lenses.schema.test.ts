import { describe, expect, it } from "vitest";
import { ZodError } from "zod";

import { validRecipeDraftFixture } from "~/modules/recipe-domain";

import {
  builtInRecipeLenses,
  recipeLensKeySchema,
  recipeLensSchema,
} from "../recipe-lenses.schema";

describe("recipe lenses schema", () => {
  it("defines stable built-in recipe lenses", () => {
    expect(builtInRecipeLenses.map((lens) => [lens.key, lens.label])).toEqual([
      ["lower-cal", "Lower-Cal"],
      ["glucose-conscious", "Glucose Conscious"],
      ["quick", "Quick"],
      ["max-flavor", "Max Flavor"],
    ]);
  });

  it("validates saved lenses with recipe drafts", () => {
    expect(
      recipeLensSchema.parse({
        id: "weeknight-sesame-chicken-bowls:lower-cal",
        recipeId: "weeknight-sesame-chicken-bowls",
        lensKey: "lower-cal",
        notes: "Keeps the sauce punchy while reducing added oil.",
        recipeDraft: validRecipeDraftFixture,
        createdAt: "2026-06-18T08:00:00.000Z",
        updatedAt: "2026-06-18T08:00:00.000Z",
      }),
    ).toMatchObject({
      lensKey: "lower-cal",
      recipeDraft: validRecipeDraftFixture,
    });
  });

  it("rejects unknown lens keys", () => {
    expect(() => recipeLensKeySchema.parse("dad-mode")).toThrow(ZodError);
  });
});
