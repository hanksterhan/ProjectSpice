import { describe, expect, it } from "vitest";

import { getRecipeAiService } from "../recipe-ai.runtime";

describe("recipe AI runtime persistence", () => {
  it("does not fall back to memory audit storage outside development", () => {
    expect(() =>
      getRecipeAiService({
        cloudflare: {
          ctx: {},
          env: {
            ENVIRONMENT: "production",
            RECIPE_AI_PROVIDER: "mock",
          },
        },
      }),
    ).toThrow(
      "Recipe AI audit persistence is not configured. Bind RECIPE_DB before running outside development.",
    );
  });
});
