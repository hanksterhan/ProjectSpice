import { describe, expect, it } from "vitest";

import { validRecipeDraftFixture } from "~/modules/recipe-domain";

import {
  buildRecipeFromAiDraft,
  buildUpdatedRecipeFromAiDraft,
  parseAiDraftJson,
  serializeAiDraft,
} from "../ai-draft";
import { validRecipeFixture } from "~/modules/recipe-domain";

describe("AI draft helpers", () => {
  it("serializes and parses AI drafts through the canonical draft schema", () => {
    expect(parseAiDraftJson(serializeAiDraft(validRecipeDraftFixture))).toEqual(
      validRecipeDraftFixture,
    );
  });

  it("builds a saved recipe from an AI draft without mutating the draft", () => {
    const draft = structuredClone(validRecipeDraftFixture);
    const recipe = buildRecipeFromAiDraft({
      draftRecipe: draft,
      now: "2026-05-29T08:00:00.000Z",
      createId: () => "ai-draft-recipe",
    });

    expect(recipe).toMatchObject({
      id: "ai-draft-recipe",
      title: validRecipeDraftFixture.title,
      version: 1,
      createdAt: "2026-05-29T08:00:00.000Z",
      updatedAt: "2026-05-29T08:00:00.000Z",
      source: {
        type: "ai",
      },
    });
    expect(draft).toEqual(validRecipeDraftFixture);
  });

  it("builds an updated recipe from an AI draft while preserving identity", () => {
    const existingRecipe = structuredClone(validRecipeFixture);
    const draft = {
      ...structuredClone(validRecipeDraftFixture),
      title: "Sesame Chicken Bowls with Bright Herbs",
    };

    const recipe = buildUpdatedRecipeFromAiDraft({
      draftRecipe: draft,
      existingRecipe,
      now: "2026-05-29T09:00:00.000Z",
    });

    expect(recipe).toMatchObject({
      id: existingRecipe.id,
      title: "Sesame Chicken Bowls with Bright Herbs",
      version: existingRecipe.version + 1,
      createdAt: existingRecipe.createdAt,
      updatedAt: "2026-05-29T09:00:00.000Z",
    });
    expect(existingRecipe).toEqual(validRecipeFixture);
  });
});
