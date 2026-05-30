import { describe, expect, it } from "vitest";
import { ZodError } from "zod";

import {
  validRecipeDraftFixture,
  validRecipeFixture,
} from "~/modules/recipe-domain";

import {
  buildGenerateRecipePrompt,
  buildTransformRecipePrompt,
  parseRecipeAiProviderDraft,
  recipeAiResponseFormat,
} from "../recipe-ai.contracts";

describe("recipe AI prompt contracts", () => {
  it("builds a generate prompt with required structured JSON instructions", () => {
    const contract = buildGenerateRecipePrompt({
      prompt: "Make a weeknight vegetarian pasta with lemon.",
      preferences: ["No mushrooms", "Serves 4"],
    });
    const userContent = contract.messages.at(-1)?.content ?? "";

    expect(contract.operation).toBe("generate");
    expect(contract.responseFormat).toBe(recipeAiResponseFormat);
    expect(userContent).toContain("Return only a JSON object");
    expect(userContent).toContain("draftRecipe");
    expect(userContent).toContain("changeSummary");
    expect(userContent).toContain("Do not include id, version, createdAt, or updatedAt");
    expect(userContent).toContain("No mushrooms");
  });

  it("builds a generate revision prompt with current draft and conversation context", () => {
    const contract = buildGenerateRecipePrompt({
      prompt: "Make the lemon brighter.",
      currentDraft: validRecipeDraftFixture,
      conversation: [
        { role: "user", content: "Make a lemon dessert." },
        { role: "assistant", content: "Prepared a lemon dessert draft." },
      ],
    });
    const userContent = contract.messages.at(-1)?.content ?? "";

    expect(contract.operation).toBe("generate");
    expect(userContent).toContain("Revise the current unsaved recipe draft");
    expect(userContent).toContain("Only change the parts needed");
    expect(userContent).toContain("user: Make a lemon dessert.");
    expect(userContent).toContain(validRecipeDraftFixture.title);
  });

  it("builds a transform prompt that includes the source recipe and preservation guidance", () => {
    const contract = buildTransformRecipePrompt({
      recipe: validRecipeFixture,
      prompt: "Make this dairy-free and reduce the total time.",
    });
    const userContent = contract.messages.at(-1)?.content ?? "";

    expect(contract.operation).toBe("transform");
    expect(userContent).toContain("Preserve the recipe's intent");
    expect(userContent).toContain(validRecipeFixture.title);
    expect(userContent).toContain("\"version\": 1");
    expect(userContent).toContain("source.type = \"ai\"");
  });

  it("builds a transform revision prompt around the current unsaved draft", () => {
    const contract = buildTransformRecipePrompt({
      recipe: validRecipeFixture,
      prompt: "Keep the changes but add clearer timing.",
      currentDraft: validRecipeDraftFixture,
    });
    const userContent = contract.messages.at(-1)?.content ?? "";

    expect(contract.operation).toBe("transform");
    expect(userContent).toContain("current unsaved transformed draft");
    expect(userContent).toContain("Current transformed draft JSON");
    expect(userContent).toContain(validRecipeDraftFixture.title);
    expect(userContent).toContain(validRecipeFixture.title);
  });
});

describe("parseRecipeAiProviderDraft", () => {
  it("accepts a valid provider draft envelope", () => {
    expect(
      parseRecipeAiProviderDraft({
        draftRecipe: validRecipeDraftFixture,
        changeSummary: ["Generated a new recipe draft."],
      }),
    ).toEqual({
      draftRecipe: validRecipeDraftFixture,
      changeSummary: ["Generated a new recipe draft."],
    });
  });

  it("accepts null placeholders used by strict structured outputs", () => {
    const parsed = parseRecipeAiProviderDraft({
        draftRecipe: {
          ...validRecipeDraftFixture,
          description: null,
          imageUrl: null,
          yield: {
            quantity: null,
            unit: null,
            notes: null,
          },
          ingredients: [
            {
              id: "toast-ingredients",
              title: null,
              items: [
                {
                  id: "white-beans",
                  raw: "1 can cannellini beans, drained",
                  quantity: 1,
                  unit: "can",
                  item: "cannellini beans",
                  preparation: null,
                  optional: null,
                },
              ],
            },
          ],
          directions: [
            {
              id: "assemble",
              title: null,
              steps: [
                {
                  id: "warm-beans",
                  order: 1,
                  text: "Warm the beans with olive oil, lemon zest, and salt.",
                  timerMinutes: null,
                  ingredientRefs: null,
                },
              ],
            },
          ],
          source: {
            type: "ai",
            name: null,
            url: null,
          },
          notes: ["Keep warm.", null],
        },
        changeSummary: ["Prepared a structured recipe draft.", null],
      });

    expect(parsed).toMatchObject({
      draftRecipe: {
        title: validRecipeDraftFixture.title,
        ingredients: [
          {
            id: "toast-ingredients",
            items: [
              {
                id: "white-beans",
              },
            ],
          },
        ],
      },
    });
    expect(
      parsed.draftRecipe.ingredients[0]?.items[0],
    ).not.toHaveProperty("preparation");
    expect(parsed.changeSummary).toEqual(["Prepared a structured recipe draft."]);
    expect(parsed.draftRecipe.notes).toEqual(["Keep warm."]);
  });

  it("rejects provider output that does not match the draft schema", () => {
    expect(() =>
      parseRecipeAiProviderDraft({
        draftRecipe: {
          ...validRecipeDraftFixture,
          directions: [],
        },
        changeSummary: ["Removed directions."],
      }),
    ).toThrow(ZodError);
  });

  it("rejects provider output without a user-facing change summary", () => {
    expect(() =>
      parseRecipeAiProviderDraft({
        draftRecipe: validRecipeDraftFixture,
        changeSummary: [],
      }),
    ).toThrow(ZodError);
  });
});
