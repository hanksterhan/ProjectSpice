import { describe, expect, it, vi } from "vitest";

import {
  validRecipeDraftFixture,
  validRecipeFixture,
  type Recipe,
} from "~/modules/recipe-domain";

import type { RecipeAiProvider } from "../recipe-ai.contracts";
import type { RecipeAiRunRecord } from "../recipe-ai.repo";
import {
  KvRecipeAiRateLimiter,
  MemoryRecipeAiRateLimiter,
  RecipeAiRateLimitError,
  RecipeAiService,
  type RecipeAiRateLimiter,
  type RecipeAiServiceAuditRepository,
} from "../recipe-ai.service";

describe("RecipeAiService", () => {
  it("generates a draft, applies rate limiting, and records a successful ai_run", async () => {
    const provider = createProviderDouble();
    const auditRepository = createAuditRepository();
    const rateLimiter = createRateLimiter();
    const service = createService({
      provider,
      auditRepository,
      rateLimiter,
    });

    await expect(
      service.generateRecipeDraft(
        {
          prompt: "Make a lemony weeknight pasta.",
          preferences: ["vegetarian"],
        },
        {
          rateLimitKey: "test-user",
          now: new Date("2026-05-28T10:00:00.000Z"),
        },
      ),
    ).resolves.toEqual({
      draftRecipe: validRecipeDraftFixture,
      changeSummary: ["Generated draft."],
      aiRunId: "ai-run-1",
    });

    expect(rateLimiter.consume).toHaveBeenCalledWith(
      "test-user",
      new Date("2026-05-28T10:00:00.000Z"),
    );
    expect(auditRepository.runs).toMatchObject([
      {
        id: "ai-run-1",
        operation: "generate",
        provider: "test-provider",
        model: "test-model",
        status: "succeeded",
        prompt: {
          prompt: "Make a lemony weeknight pasta.",
          preferences: ["vegetarian"],
        },
        draftRecipe: validRecipeDraftFixture,
        changeSummary: ["Generated draft."],
      },
    ]);
  });

  it("records failed provider calls in ai_runs", async () => {
    const auditRepository = createAuditRepository();
    const service = createService({
      auditRepository,
      provider: createProviderDouble({
        generateRecipe: async () => {
          throw new Error("Provider unavailable.");
        },
      }),
    });

    await expect(
      service.generateRecipeDraft(
        { prompt: "Make soup." },
        {
          rateLimitKey: "test-user",
          now: new Date("2026-05-28T10:00:00.000Z"),
        },
      ),
    ).rejects.toThrow("Provider unavailable.");

    expect(auditRepository.runs).toMatchObject([
      {
        id: "ai-run-1",
        operation: "generate",
        status: "failed",
        error: "Provider unavailable.",
      },
    ]);
  });

  it("does not call the provider or audit repository after a rate limit rejection", async () => {
    const provider = createProviderDouble();
    const auditRepository = createAuditRepository();
    const service = createService({
      provider,
      auditRepository,
      rateLimiter: {
        consume: vi.fn(async () => {
          throw new RecipeAiRateLimitError();
        }),
      },
    });

    await expect(
      service.generateRecipeDraft(
        { prompt: "Make soup." },
        { rateLimitKey: "test-user" },
      ),
    ).rejects.toBeInstanceOf(RecipeAiRateLimitError);
    expect(provider.generateRecipe).not.toHaveBeenCalled();
    expect(auditRepository.runs).toEqual([]);
  });

  it("passes a cloned recipe to transform so the original recipe is never mutated", async () => {
    const originalRecipe: Recipe = structuredClone(validRecipeFixture);
    const snapshot = structuredClone(originalRecipe);
    const provider = createProviderDouble({
      transformRecipe: vi.fn(async (request) => {
        request.recipe.title = "Mutated by provider";

        return {
          draftRecipe: {
            ...validRecipeDraftFixture,
            title: "Dairy-Free Sesame Chicken Bowls",
          },
          changeSummary: ["Made the sauce dairy-free."],
        };
      }),
    });
    const auditRepository = createAuditRepository();
    const service = createService({
      provider,
      auditRepository,
    });

    await expect(
      service.transformRecipeDraft(
        {
          recipe: originalRecipe,
          prompt: "Make it dairy-free.",
        },
        {
          rateLimitKey: "test-user",
          now: new Date("2026-05-28T10:00:00.000Z"),
        },
      ),
    ).resolves.toMatchObject({
      draftRecipe: {
        title: "Dairy-Free Sesame Chicken Bowls",
      },
      changeSummary: ["Made the sauce dairy-free."],
    });

    expect(originalRecipe).toEqual(snapshot);
    expect(auditRepository.runs).toMatchObject([
      {
        recipeId: validRecipeFixture.id,
        operation: "transform",
        status: "succeeded",
        prompt: {
          sourceRecipe: {
            id: validRecipeFixture.id,
            title: validRecipeFixture.title,
            version: validRecipeFixture.version,
          },
        },
        changeSummary: ["Made the sauce dairy-free."],
      },
    ]);
  });

  it("passes cloned current draft context for iterative revisions", async () => {
    const currentDraft = structuredClone(validRecipeDraftFixture);
    const snapshot = structuredClone(currentDraft);
    const provider = createProviderDouble({
      generateRecipe: vi.fn(async (request) => {
        request.currentDraft!.title = "Mutated by provider";

        return {
          draftRecipe: {
            ...validRecipeDraftFixture,
            title: "Brighter Lemon Cream",
          },
          changeSummary: ["Brightened the lemon flavor."],
        };
      }),
    });
    const auditRepository = createAuditRepository();
    const service = createService({
      provider,
      auditRepository,
    });

    await expect(
      service.generateRecipeDraft(
        {
          prompt: "Make the lemon brighter.",
          currentDraft,
          conversation: [{ role: "user", content: "Make a lemon dessert." }],
        },
        {
          rateLimitKey: "test-user",
          now: new Date("2026-05-28T10:00:00.000Z"),
        },
      ),
    ).resolves.toMatchObject({
      draftRecipe: {
        title: "Brighter Lemon Cream",
      },
      changeSummary: ["Brightened the lemon flavor."],
    });

    expect(currentDraft).toEqual(snapshot);
    expect(auditRepository.runs).toMatchObject([
      {
        operation: "generate",
        status: "succeeded",
        prompt: {
          currentDraftTitle: validRecipeDraftFixture.title,
          conversationTurns: 1,
        },
      },
    ]);
  });
});

describe("MemoryRecipeAiRateLimiter", () => {
  it("limits requests inside the configured window", async () => {
    const rateLimiter = new MemoryRecipeAiRateLimiter({
      maxRequests: 2,
      windowSeconds: 60,
    });
    const now = new Date("2026-05-28T10:00:00.000Z");

    await expect(rateLimiter.consume("test-user", now)).resolves.toBeUndefined();
    await expect(rateLimiter.consume("test-user", now)).resolves.toBeUndefined();
    await expect(rateLimiter.consume("test-user", now)).rejects.toBeInstanceOf(
      RecipeAiRateLimitError,
    );
  });
});

describe("KvRecipeAiRateLimiter", () => {
  it("increments a fixed-window KV counter with expiration", async () => {
    const values = new Map<string, string>();
    const kv = {
      get: vi.fn(async (key: string) => values.get(key) ?? null),
      put: vi.fn(async (key: string, value: string) => {
        values.set(key, value);
      }),
    };
    const rateLimiter = new KvRecipeAiRateLimiter(kv, {
      maxRequests: 2,
      windowSeconds: 60,
    });
    const now = new Date("2026-05-28T10:00:00.000Z");

    await rateLimiter.consume("test-user", now);
    await rateLimiter.consume("test-user", now);

    expect(kv.put).toHaveBeenLastCalledWith(
      expect.stringContaining("recipe-ai:test-user:"),
      "2",
      { expirationTtl: 60 },
    );
    await expect(rateLimiter.consume("test-user", now)).rejects.toBeInstanceOf(
      RecipeAiRateLimitError,
    );
  });
});

function createService({
  provider = createProviderDouble(),
  auditRepository = createAuditRepository(),
  rateLimiter = createRateLimiter(),
}: {
  provider?: RecipeAiProvider;
  auditRepository?: RecipeAiServiceAuditRepository;
  rateLimiter?: RecipeAiRateLimiter;
} = {}) {
  return new RecipeAiService({
    provider,
    auditRepository,
    rateLimiter,
    providerName: "test-provider",
    model: "test-model",
    createId: () => "ai-run-1",
  });
}

function createProviderDouble(
  overrides: Partial<RecipeAiProvider> = {},
): RecipeAiProvider {
  return {
    generateRecipe: vi.fn(async () => ({
      draftRecipe: validRecipeDraftFixture,
      changeSummary: ["Generated draft."],
    })),
    transformRecipe: vi.fn(async () => ({
      draftRecipe: validRecipeDraftFixture,
      changeSummary: ["Transformed draft."],
    })),
    ...overrides,
  };
}

function createAuditRepository(): RecipeAiServiceAuditRepository & {
  runs: RecipeAiRunRecord[];
} {
  const runs: RecipeAiRunRecord[] = [];

  return {
    runs,
    record: vi.fn(async (run: RecipeAiRunRecord) => {
      runs.push(structuredClone(run));
    }),
  };
}

function createRateLimiter(): RecipeAiRateLimiter {
  return {
    consume: vi.fn(async () => undefined),
  };
}
