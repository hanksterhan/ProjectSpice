import { recipeDraftSchema, type Recipe, type RecipeDraft } from "~/modules/recipe-domain";

import type {
  RecipeAiGenerateRequest,
  RecipeAiProvider,
  RecipeAiProviderDraft,
  RecipeAiTransformRequest,
} from "./recipe-ai.contracts";
import type { RecipeAiRunRecord } from "./recipe-ai.repo";

const DEFAULT_RATE_LIMIT_MAX_REQUESTS = 20;
const DEFAULT_RATE_LIMIT_WINDOW_SECONDS = 60 * 60;

export type RecipeAiRateLimiter = {
  consume(key: string, now: Date): Promise<void>;
};

export type RecipeAiRateLimitStore = {
  get(key: string): Promise<string | null>;
  put(
    key: string,
    value: string,
    options?: { expirationTtl?: number },
  ): Promise<void>;
};

export type RecipeAiServiceAuditRepository = {
  record(run: RecipeAiRunRecord): Promise<void>;
};

export type RecipeAiServiceConfig = {
  provider: RecipeAiProvider;
  auditRepository: RecipeAiServiceAuditRepository;
  rateLimiter: RecipeAiRateLimiter;
  providerName?: string;
  model?: string;
  createId?: () => string;
};

export type RecipeAiServiceRequestContext = {
  rateLimitKey: string;
  now?: Date;
};

export type RecipeAiServiceDraftResult = {
  draftRecipe: RecipeDraft;
  changeSummary: string[];
  aiRunId: string;
};

export class RecipeAiRateLimitError extends Error {
  constructor(message = "AI request rate limit exceeded.") {
    super(message);
    this.name = "RecipeAiRateLimitError";
  }
}

export class RecipeAiService {
  private readonly auditRepository: RecipeAiServiceAuditRepository;
  private readonly createId: () => string;
  private readonly model: string;
  private readonly provider: RecipeAiProvider;
  private readonly providerName: string;
  private readonly rateLimiter: RecipeAiRateLimiter;

  constructor(config: RecipeAiServiceConfig) {
    this.auditRepository = config.auditRepository;
    this.createId = config.createId ?? createRandomId;
    this.model = config.model ?? "gpt-4.1-mini";
    this.provider = config.provider;
    this.providerName = config.providerName ?? "openai";
    this.rateLimiter = config.rateLimiter;
  }

  async generateRecipeDraft(
    request: RecipeAiGenerateRequest,
    context: RecipeAiServiceRequestContext,
  ): Promise<RecipeAiServiceDraftResult> {
    const now = context.now ?? new Date();
    await this.rateLimiter.consume(context.rateLimitKey, now);

    return this.runWithAudit({
      operation: "generate",
      providerCall: () => this.provider.generateRecipe(request),
      prompt: {
        operation: "generate",
        prompt: request.prompt,
        preferences: request.preferences ?? [],
      },
      now,
    });
  }

  async transformRecipeDraft(
    request: RecipeAiTransformRequest,
    context: RecipeAiServiceRequestContext,
  ): Promise<RecipeAiServiceDraftResult> {
    const now = context.now ?? new Date();
    await this.rateLimiter.consume(context.rateLimitKey, now);
    const sourceRecipe = cloneRecipe(request.recipe);

    return this.runWithAudit({
      operation: "transform",
      recipeId: sourceRecipe.id,
      providerCall: () =>
        this.provider.transformRecipe({
          ...request,
          recipe: cloneRecipe(sourceRecipe),
        }),
      prompt: {
        operation: "transform",
        prompt: request.prompt,
        preferences: request.preferences ?? [],
        sourceRecipe: {
          id: sourceRecipe.id,
          title: sourceRecipe.title,
          version: sourceRecipe.version,
        },
      },
      now,
    });
  }

  private async runWithAudit({
    operation,
    recipeId,
    providerCall,
    prompt,
    now,
  }: {
    operation: "generate" | "transform";
    recipeId?: string;
    providerCall: () => Promise<RecipeAiProviderDraft>;
    prompt: Record<string, unknown>;
    now: Date;
  }): Promise<RecipeAiServiceDraftResult> {
    const aiRunId = this.createId();
    const createdAt = now.toISOString();

    try {
      const providerDraft = await providerCall();
      const draftRecipe = recipeDraftSchema.parse(providerDraft.draftRecipe);
      const changeSummary = [...providerDraft.changeSummary];

      await this.auditRepository.record({
        id: aiRunId,
        recipeId,
        operation,
        provider: this.providerName,
        model: this.model,
        prompt,
        response: {
          changeSummary,
          draftRecipeTitle: draftRecipe.title,
        },
        draftRecipe,
        status: "succeeded",
        changeSummary,
        createdAt,
      });

      return {
        draftRecipe,
        changeSummary,
        aiRunId,
      };
    } catch (error) {
      await this.auditRepository.record({
        id: aiRunId,
        recipeId,
        operation,
        provider: this.providerName,
        model: this.model,
        prompt,
        status: "failed",
        error: getErrorMessage(error),
        createdAt,
      });

      throw error;
    }
  }
}

export class KvRecipeAiRateLimiter implements RecipeAiRateLimiter {
  constructor(
    private readonly kv: RecipeAiRateLimitStore,
    private readonly config: {
      maxRequests?: number;
      windowSeconds?: number;
    } = {},
  ) {}

  async consume(key: string, now: Date): Promise<void> {
    const maxRequests = this.config.maxRequests ?? DEFAULT_RATE_LIMIT_MAX_REQUESTS;
    const windowSeconds =
      this.config.windowSeconds ?? DEFAULT_RATE_LIMIT_WINDOW_SECONDS;
    const windowKey = createRateLimitWindowKey(key, now, windowSeconds);
    const currentCount = Number((await this.kv.get(windowKey)) ?? "0");

    if (currentCount >= maxRequests) {
      throw new RecipeAiRateLimitError();
    }

    await this.kv.put(windowKey, String(currentCount + 1), {
      expirationTtl: windowSeconds,
    });
  }
}

export class MemoryRecipeAiRateLimiter implements RecipeAiRateLimiter {
  private readonly counts = new Map<string, number>();

  constructor(
    private readonly config: {
      maxRequests?: number;
      windowSeconds?: number;
    } = {},
  ) {}

  async consume(key: string, now: Date): Promise<void> {
    const maxRequests = this.config.maxRequests ?? DEFAULT_RATE_LIMIT_MAX_REQUESTS;
    const windowSeconds =
      this.config.windowSeconds ?? DEFAULT_RATE_LIMIT_WINDOW_SECONDS;
    const windowKey = createRateLimitWindowKey(key, now, windowSeconds);
    const currentCount = this.counts.get(windowKey) ?? 0;

    if (currentCount >= maxRequests) {
      throw new RecipeAiRateLimitError();
    }

    this.counts.set(windowKey, currentCount + 1);
  }
}

function createRateLimitWindowKey(
  key: string,
  now: Date,
  windowSeconds: number,
): string {
  const windowStart = Math.floor(now.getTime() / (windowSeconds * 1000));

  return `recipe-ai:${key}:${windowStart}`;
}

function cloneRecipe(recipe: Recipe): Recipe {
  return JSON.parse(JSON.stringify(recipe)) as Recipe;
}

function createRandomId(): string {
  return crypto.randomUUID();
}

function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
