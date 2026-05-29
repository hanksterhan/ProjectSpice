import type { AppLoadContext } from "react-router";

import type { RecipeDraft } from "~/modules/recipe-domain";

import { createOpenAiRecipeAiProviderFromEnv } from "./openai-recipe-ai.provider";
import type {
  RecipeAiGenerateRequest,
  RecipeAiProvider,
  RecipeAiProviderDraft,
  RecipeAiTransformRequest,
} from "./recipe-ai.contracts";
import { RecipeAiRunRepository, type RecipeAiRunRecord } from "./recipe-ai.repo";
import {
  KvRecipeAiRateLimiter,
  MemoryRecipeAiRateLimiter,
  RecipeAiService,
  type RecipeAiRateLimiter,
} from "./recipe-ai.service";

type MaybeAiEnv = Record<string, unknown> & {
  AI_RATE_LIMITS?: KVNamespace;
  AI_RATE_LIMIT?: KVNamespace;
  DB?: RecipeAiRunRepositoryDatabase;
  RECIPE_DB?: RecipeAiRunRepositoryDatabase;
  OPENAI_API_KEY?: string;
  OPENAI_RECIPE_MODEL?: string;
  OPENAI_RESPONSES_URL?: string;
  RECIPE_AI_PROVIDER?: string;
};

type RecipeAiRunRepositoryDatabase = ConstructorParameters<
  typeof RecipeAiRunRepository
>[0];

export type RecipeAiProviderOverride = "mock" | "openai";

let memoryAuditRepository: MemoryRecipeAiRunRepository | undefined;
let memoryRateLimiter: MemoryRecipeAiRateLimiter | undefined;

export function getRecipeAiService(
  context: AppLoadContext,
  providerOverride?: RecipeAiProviderOverride,
): RecipeAiService {
  const env = context.cloudflare.env as unknown as MaybeAiEnv;
  const model = env.OPENAI_RECIPE_MODEL ?? "gpt-4.1-mini";
  const providerName = providerOverride ?? getConfiguredProviderName(env);

  return new RecipeAiService({
    provider: createRecipeAiProvider(env, providerName),
    auditRepository: getAuditRepository(env),
    rateLimiter: getRateLimiter(env),
    providerName,
    model,
  });
}

function createRecipeAiProvider(
  env: MaybeAiEnv,
  providerName: "mock" | "openai",
): RecipeAiProvider {
  if (providerName === "mock") {
    return new MockRecipeAiProvider();
  }

  return createOpenAiRecipeAiProviderFromEnv(env);
}

function getConfiguredProviderName(env: MaybeAiEnv): "mock" | "openai" {
  return (env.RECIPE_AI_PROVIDER ?? process.env.RECIPE_AI_PROVIDER) === "mock"
    ? "mock"
    : "openai";
}

export function getRecipeAiProviderOverride(
  request: Request,
  context: AppLoadContext,
): RecipeAiProviderOverride | undefined {
  const env = context.cloudflare.env as unknown as MaybeAiEnv;
  const requestedProvider = request.headers.get("x-projectspice-ai-provider");

  if (env.ENVIRONMENT === "development" && requestedProvider === "mock") {
    return "mock";
  }

  return undefined;
}

function getAuditRepository(env: MaybeAiEnv) {
  const database = env.RECIPE_DB ?? env.DB;

  if (database) {
    return new RecipeAiRunRepository(database);
  }

  memoryAuditRepository ??= new MemoryRecipeAiRunRepository();

  return memoryAuditRepository;
}

function getRateLimiter(env: MaybeAiEnv): RecipeAiRateLimiter {
  const kv = env.AI_RATE_LIMITS ?? env.AI_RATE_LIMIT;

  if (kv) {
    return new KvRecipeAiRateLimiter(kv);
  }

  memoryRateLimiter ??= new MemoryRecipeAiRateLimiter();

  return memoryRateLimiter;
}

class MemoryRecipeAiRunRepository {
  readonly runs: RecipeAiRunRecord[] = [];

  async record(run: RecipeAiRunRecord): Promise<void> {
    this.runs.push(structuredClone(run));
  }
}

class MockRecipeAiProvider implements RecipeAiProvider {
  async generateRecipe(
    _request: RecipeAiGenerateRequest,
  ): Promise<RecipeAiProviderDraft> {
    return {
      draftRecipe: {
        title: "Mock Citrus Icebox Cake",
        description: "A deterministic AI draft for smoke testing.",
        yield: {
          quantity: 6,
          unit: "servings",
        },
        times: {
          prepMinutes: 20,
          totalMinutes: 260,
        },
        ingredients: [
          {
            id: "cream-layer",
            title: "Cream",
            items: [
              {
                id: "heavy-cream",
                raw: "2 cups heavy cream",
                quantity: 2,
                unit: "cups",
                item: "heavy cream",
              },
            ],
          },
        ],
        directions: [
          {
            id: "assemble",
            title: "Assemble",
            steps: [
              {
                id: "whip-cream",
                order: 1,
                text: "Whip the cream, layer with citrus cookies, and chill until set.",
                timerMinutes: 240,
              },
            ],
          },
        ],
        notes: ["Mock provider output only."],
        source: {
          type: "ai",
          name: "ProjectSpice smoke mock",
        },
        tags: ["mock", "chilled"],
      },
      changeSummary: ["Generated a deterministic smoke-test draft."],
    };
  }

  async transformRecipe(
    request: RecipeAiTransformRequest,
  ): Promise<RecipeAiProviderDraft> {
    const draftRecipe = toDraft(request.recipe);

    return {
      draftRecipe: {
        ...draftRecipe,
        title: `${request.recipe.title}, Lightened`,
        description: `Lightened version of ${request.recipe.title}.`,
        notes: [
          ...(draftRecipe.notes ?? []),
          "Mock transformation keeps the original recipe reviewable.",
        ],
        source: {
          type: "ai",
          name: "ProjectSpice smoke mock",
        },
        tags: [...new Set([...draftRecipe.tags, "ai-draft"])],
      },
      changeSummary: [
        "Lightened the current recipe for smoke testing.",
        "Preserved ingredients and directions for draft review.",
      ],
    };
  }
}

function toDraft(recipe: RecipeAiTransformRequest["recipe"]): RecipeDraft {
  const {
    id: _id,
    version: _version,
    createdAt: _createdAt,
    updatedAt: _updatedAt,
    ...draftRecipe
  } = structuredClone(recipe);

  return draftRecipe;
}
