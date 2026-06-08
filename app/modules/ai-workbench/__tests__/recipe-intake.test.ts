import { describe, expect, it } from "vitest";

import { validRecipeDraftFixture } from "~/modules/recipe-domain";

import {
  normalizeRecipeIntakeJsonText,
  parseProjectSpiceRecipeIntakeJson,
  projectSpiceRecipeSystemPrompt,
} from "../project-spice-recipe-intake";

describe("Project Spice recipe intake", () => {
  it("documents the system prompt and output envelope", () => {
    expect(projectSpiceRecipeSystemPrompt).toContain("Return only JSON");
    expect(projectSpiceRecipeSystemPrompt).toContain("draftRecipe");
    expect(projectSpiceRecipeSystemPrompt).toContain("changeSummary");
    expect(projectSpiceRecipeSystemPrompt).toContain("id, version, createdAt, and updatedAt");
    expect(projectSpiceRecipeSystemPrompt).toContain("Every direction step must include an order value");
    expect(projectSpiceRecipeSystemPrompt).toContain("partial quantity used in each relevant step");
  });

  it("parses a ChatGPT or Claude recipe envelope", () => {
    const parsed = parseProjectSpiceRecipeIntakeJson(
      JSON.stringify({
        draftRecipe: validRecipeDraftFixture,
        changeSummary: ["Created a structured recipe draft."],
      }),
    );

    expect(parsed).toEqual({
      ok: true,
      draftRecipe: validRecipeDraftFixture,
      changeSummary: ["Created a structured recipe draft."],
    });
  });

  it("normalizes common ChatGPT paste formatting", () => {
    expect(normalizeRecipeIntakeJsonText("```json\n{“draftRecipe”:{}}\n```")).toBe(
      "{\"draftRecipe\":{}}",
    );
  });

  it("accepts a curly-quoted ChatGPT recipe envelope", () => {
    const json = JSON.stringify({
      draftRecipe: validRecipeDraftFixture,
      changeSummary: ["Created a structured recipe draft."],
    }).replace(/"/g, "”");
    const parsed = parseProjectSpiceRecipeIntakeJson(`\`\`\`json\n${json}\n\`\`\``);

    expect(parsed).toEqual({
      ok: true,
      draftRecipe: validRecipeDraftFixture,
      changeSummary: ["Created a structured recipe draft."],
    });
  });

  it("accepts a bare draft recipe object", () => {
    const parsed = parseProjectSpiceRecipeIntakeJson(
      JSON.stringify(validRecipeDraftFixture),
    );

    expect(parsed).toMatchObject({
      ok: true,
      draftRecipe: validRecipeDraftFixture,
    });
  });

  it("returns useful validation errors for invalid recipe JSON", () => {
    const parsed = parseProjectSpiceRecipeIntakeJson(
      JSON.stringify({
        draftRecipe: {
          ...validRecipeDraftFixture,
          ingredients: [],
        },
        changeSummary: ["Removed ingredients."],
      }),
    );

    expect(parsed.ok).toBe(false);
    if (!parsed.ok) {
      expect(parsed.errors.join(" ")).toContain("ingredients");
    }
  });
});
