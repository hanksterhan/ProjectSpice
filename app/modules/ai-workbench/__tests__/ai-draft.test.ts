import { describe, expect, it } from "vitest";

import { validRecipeDraftFixture } from "~/modules/recipe-domain";

import {
  buildRecipeFromAiDraft,
  buildUpdatedRecipeFromAiDraft,
  parseAiDraftJson,
  serializeAiDraft,
} from "../ai-draft";
import {
  appendAiChatTurn,
  parseAiChatHistoryJson,
  serializeAiChatHistory,
} from "../ai-chat";
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
    const existingRecipe = {
      ...structuredClone(validRecipeFixture),
      favorite: true,
      rating: 9.1,
      cookedDates: ["2026-06-07"],
    };
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
      favorite: true,
      rating: 9.1,
      cookedDates: ["2026-06-07"],
    });
    expect(existingRecipe).toMatchObject({
      id: validRecipeFixture.id,
      cookedDates: ["2026-06-07"],
    });
  });
});

describe("AI chat helpers", () => {
  it("appends a user request and assistant change summary", () => {
    expect(
      appendAiChatTurn({
        history: [],
        prompt: "Make it brighter.",
        changeSummary: ["Added more lemon."],
      }),
    ).toEqual([
      { role: "user", content: "Make it brighter." },
      { role: "assistant", content: "Updated the draft with 1 change." },
    ]);
  });

  it("serializes and parses bounded chat history", () => {
    const history = [
      { role: "user" as const, content: "Make a tart." },
      { role: "assistant" as const, content: "Prepared a tart draft." },
    ];

    expect(parseAiChatHistoryJson(serializeAiChatHistory(history))).toEqual(
      history,
    );
  });
});
