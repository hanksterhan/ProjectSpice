import { describe, expect, it } from "vitest";
import { ZodError } from "zod";

import { validRecipeDraftFixture } from "~/modules/recipe-domain";

import {
  builtInRecipeLenses,
  findRecipeLensDefinitionInText,
  formatRecipeLensPromptGuidance,
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

  it("defines guardrails for nutrition-adjacent lenses", () => {
    expect(
      builtInRecipeLenses.find((lens) => lens.key === "lower-cal"),
    ).toMatchObject({
      successCriteria: expect.arrayContaining([
        expect.stringContaining("20% estimated calorie reduction"),
      ]),
      caution: expect.stringContaining("Do not claim exact calories"),
    });
    expect(
      builtInRecipeLenses.find((lens) => lens.key === "glucose-conscious"),
    ).toMatchObject({
      successCriteria: expect.arrayContaining([
        expect.stringContaining("40% added-sugar reduction"),
      ]),
      caution: expect.stringContaining("Do not describe the result as safe"),
    });
  });

  it("detects built-in lenses from user-facing prompt language", () => {
    expect(
      findRecipeLensDefinitionInText("Make this calorie-conscious"),
    )?.toMatchObject({ key: "lower-cal" });
    expect(
      findRecipeLensDefinitionInText("Make this better for blood sugar"),
    )?.toMatchObject({ key: "glucose-conscious" });
  });

  it("formats prompt guidance for known recipe lenses", () => {
    expect(formatRecipeLensPromptGuidance("glucose-conscious version")).toContain(
      "Aim for at least a 40% added-sugar reduction",
    );
    expect(formatRecipeLensPromptGuidance("make this spicier")).toBeNull();
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
