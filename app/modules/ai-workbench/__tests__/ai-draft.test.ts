import { describe, expect, it } from "vitest";

import { validRecipeDraftFixture } from "~/modules/recipe-domain";

import {
  buildRecipeFromAiDraft,
  parseAiDraftJson,
  serializeAiDraft,
} from "../ai-draft";

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
});
