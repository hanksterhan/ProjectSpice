import type { AppLoadContext } from "react-router";

import { createOpenAiRecipeAiProviderFromEnv } from "./openai-recipe-ai.provider";
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
};

type RecipeAiRunRepositoryDatabase = ConstructorParameters<
  typeof RecipeAiRunRepository
>[0];

let memoryAuditRepository: MemoryRecipeAiRunRepository | undefined;
let memoryRateLimiter: MemoryRecipeAiRateLimiter | undefined;

export function getRecipeAiService(context: AppLoadContext): RecipeAiService {
  const env = context.cloudflare.env as unknown as MaybeAiEnv;
  const model = env.OPENAI_RECIPE_MODEL ?? "gpt-4.1-mini";

  return new RecipeAiService({
    provider: createOpenAiRecipeAiProviderFromEnv(env),
    auditRepository: getAuditRepository(env),
    rateLimiter: getRateLimiter(env),
    providerName: "openai",
    model,
  });
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
