import { describe, expect, it } from "vitest";
import {
  aiLensPrompt,
  aiLensSummary,
  applyAiLensSearchParams,
  parseAiLensSearchParams,
  type AiLensState,
} from "../ai-lens.shared";

describe("AI Lens state", () => {
  it("parses URL-backed lens state and clamps strength", () => {
    const params = new URLSearchParams("lens=lighter,unknown,faster&strength=140");

    expect(parseAiLensSearchParams(params)).toEqual({
      lenses: ["lighter", "faster"],
      strength: 1,
    });
  });

  it("serializes active lens state and clears inactive state", () => {
    const params = new URLSearchParams("q=pasta");

    applyAiLensSearchParams(params, { lenses: ["pantry"], strength: 0.42 });
    expect(params.toString()).toBe("q=pasta&lens=pantry&strength=42");

    applyAiLensSearchParams(params, { lenses: [], strength: 0.42 });
    expect(params.toString()).toBe("q=pasta");
  });

  it("summarizes and prompts without mutating recipe fields", () => {
    const state: AiLensState = { lenses: ["spicy", "kids"], strength: 0.6 };

    expect(aiLensSummary(state)).toBe("Heat + Kids · 60%");
    expect(aiLensPrompt(state)).toContain("balanced heat");
    expect(aiLensPrompt(state)).toContain("family cooking");
  });
});
