import { ZodError } from "zod";

import {
  buildGenerateRecipePrompt,
  buildTransformRecipePrompt,
  parseRecipeAiProviderDraft,
  type RecipeAiGenerateRequest,
  type RecipeAiPromptContract,
  type RecipeAiProvider,
  type RecipeAiProviderDraft,
  type RecipeAiTransformRequest,
} from "./recipe-ai.contracts";

const DEFAULT_OPENAI_RESPONSES_URL = "https://api.openai.com/v1/responses";
const DEFAULT_OPENAI_RECIPE_MODEL = "gpt-4.1-mini";
const DEFAULT_TIMEOUT_MS = 30_000;

type FetchLike = typeof fetch;

export type OpenAiRecipeAiProviderConfig = {
  apiKey: string;
  model?: string;
  endpoint?: string;
  timeoutMs?: number;
  fetch?: FetchLike;
};

export type OpenAiRecipeAiProviderEnv = {
  OPENAI_API_KEY?: string;
  OPENAI_RECIPE_MODEL?: string;
  OPENAI_RESPONSES_URL?: string;
};

export type OpenAiRecipeAiProviderErrorKind =
  | "configuration"
  | "http"
  | "timeout"
  | "json_parse"
  | "schema_validation"
  | "empty_response";

export class OpenAiRecipeAiProviderError extends Error {
  constructor(
    message: string,
    readonly kind: OpenAiRecipeAiProviderErrorKind,
    readonly cause?: unknown,
  ) {
    super(message);
    this.name = "OpenAiRecipeAiProviderError";
  }
}

export function formatOpenAiRecipeAiProviderError(error: unknown): string | null {
  if (!(error instanceof OpenAiRecipeAiProviderError)) {
    return null;
  }

  const causeMessage = getOpenAiErrorCauseMessage(error.cause);

  return causeMessage ? `${error.message} ${causeMessage}` : error.message;
}

export class OpenAiRecipeAiProvider implements RecipeAiProvider {
  private readonly apiKey: string;
  private readonly endpoint: string;
  private readonly fetchImpl: FetchLike;
  private readonly model: string;
  private readonly timeoutMs: number;

  constructor(config: OpenAiRecipeAiProviderConfig) {
    if (!config.apiKey.trim()) {
      throw new OpenAiRecipeAiProviderError(
        "OPENAI_API_KEY is required to use the recipe AI provider.",
        "configuration",
      );
    }

    this.apiKey = config.apiKey;
    this.endpoint = config.endpoint ?? DEFAULT_OPENAI_RESPONSES_URL;
    this.fetchImpl = config.fetch ?? ((input, init) => fetch(input, init));
    this.model = config.model ?? DEFAULT_OPENAI_RECIPE_MODEL;
    this.timeoutMs = config.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  }

  async generateRecipe(
    request: RecipeAiGenerateRequest,
  ): Promise<RecipeAiProviderDraft> {
    return this.completePrompt(buildGenerateRecipePrompt(request));
  }

  async transformRecipe(
    request: RecipeAiTransformRequest,
  ): Promise<RecipeAiProviderDraft> {
    return this.completePrompt(buildTransformRecipePrompt(request));
  }

  private async completePrompt(
    prompt: RecipeAiPromptContract,
  ): Promise<RecipeAiProviderDraft> {
    const firstAttempt = await this.requestText(prompt);
    const firstResult = parseProviderText(firstAttempt);

    if (firstResult.success) {
      return firstResult.data;
    }

    const repairAttempt = await this.requestText(
      buildRepairPrompt(prompt, firstAttempt, firstResult.error),
    );
    const repairResult = parseProviderText(repairAttempt);

    if (repairResult.success) {
      return repairResult.data;
    }

    throw repairResult.error;
  }

  private async requestText(prompt: RecipeAiPromptContract): Promise<string> {
    const abortController = new AbortController();
    const timeout = setTimeout(() => abortController.abort(), this.timeoutMs);

    try {
      const response = await this.fetchImpl(this.endpoint, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${this.apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(this.buildRequestBody(prompt)),
        signal: abortController.signal,
      });

      if (!response.ok) {
        throw new OpenAiRecipeAiProviderError(
          `OpenAI recipe request failed with ${response.status}.`,
          "http",
          await readResponseError(response),
        );
      }

      return extractOpenAiResponseText(await response.json());
    } catch (error) {
      if (isAbortError(error)) {
        throw new OpenAiRecipeAiProviderError(
          "OpenAI recipe request timed out.",
          "timeout",
          error,
        );
      }

      if (error instanceof OpenAiRecipeAiProviderError) {
        throw error;
      }

      throw new OpenAiRecipeAiProviderError(
        "OpenAI recipe request failed.",
        "http",
        error,
      );
    } finally {
      clearTimeout(timeout);
    }
  }

  private buildRequestBody(prompt: RecipeAiPromptContract): Record<string, unknown> {
    return {
      model: this.model,
      input: prompt.messages.map((message) => ({
        role: message.role,
        content: message.content,
      })),
      text: {
        format: {
          type: "json_schema",
          name: "project_spice_recipe_draft",
          schema: recipeAiProviderDraftJsonSchema,
          strict: true,
        },
      },
    };
  }
}

export function createOpenAiRecipeAiProviderFromEnv(
  env: OpenAiRecipeAiProviderEnv,
): OpenAiRecipeAiProvider {
  return new OpenAiRecipeAiProvider({
    apiKey: env.OPENAI_API_KEY ?? "",
    model: env.OPENAI_RECIPE_MODEL,
    endpoint: env.OPENAI_RESPONSES_URL,
  });
}

export function extractOpenAiResponseText(responseBody: unknown): string {
  if (!isRecord(responseBody)) {
    throw new OpenAiRecipeAiProviderError(
      "OpenAI recipe response was not an object.",
      "empty_response",
      responseBody,
    );
  }

  if (typeof responseBody.output_text === "string") {
    return responseBody.output_text;
  }

  const outputText = extractTextFromOutput(responseBody.output);

  if (outputText) {
    return outputText;
  }

  throw new OpenAiRecipeAiProviderError(
    "OpenAI recipe response did not include output text.",
    "empty_response",
    responseBody,
  );
}

export function parseProviderText(text: string):
  | { success: true; data: RecipeAiProviderDraft }
  | { success: false; error: OpenAiRecipeAiProviderError } {
  try {
    return {
      success: true,
      data: parseRecipeAiProviderDraft(extractJsonValue(text)),
    };
  } catch (error) {
    if (error instanceof SyntaxError) {
      return {
        success: false,
        error: new OpenAiRecipeAiProviderError(
          "OpenAI recipe response was not valid JSON.",
          "json_parse",
          error,
        ),
      };
    }

    if (error instanceof ZodError) {
      return {
        success: false,
        error: new OpenAiRecipeAiProviderError(
          "OpenAI recipe response did not match the RecipeDraft contract.",
          "schema_validation",
          error,
        ),
      };
    }

    return {
      success: false,
      error: new OpenAiRecipeAiProviderError(
        "OpenAI recipe response could not be parsed.",
        "json_parse",
        error,
      ),
    };
  }
}

function buildRepairPrompt(
  originalPrompt: RecipeAiPromptContract,
  invalidText: string,
  validationError: OpenAiRecipeAiProviderError,
): RecipeAiPromptContract {
  return {
    ...originalPrompt,
    messages: [
      ...originalPrompt.messages,
      {
        role: "user",
        content: [
          "Repair the previous response so it exactly follows the required JSON contract.",
          "Return only the corrected JSON object.",
          `Validation error kind: ${validationError.kind}`,
          `Validation error: ${validationError.message}`,
          "Previous response:",
          invalidText,
        ].join("\n\n"),
      },
    ],
  };
}

function extractJsonValue(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch (error) {
    const jsonText = findFirstJsonObjectText(text);

    if (!jsonText) {
      throw error;
    }

    return JSON.parse(jsonText);
  }
}

function findFirstJsonObjectText(text: string): string | null {
  const start = text.indexOf("{");

  if (start < 0) {
    return null;
  }

  let depth = 0;
  let inString = false;
  let escaped = false;

  for (let index = start; index < text.length; index += 1) {
    const character = text[index];

    if (escaped) {
      escaped = false;
      continue;
    }

    if (character === "\\") {
      escaped = inString;
      continue;
    }

    if (character === "\"") {
      inString = !inString;
      continue;
    }

    if (inString) {
      continue;
    }

    if (character === "{") {
      depth += 1;
    }

    if (character === "}") {
      depth -= 1;
    }

    if (depth === 0) {
      return text.slice(start, index + 1);
    }
  }

  return null;
}

function extractTextFromOutput(output: unknown): string | null {
  if (!Array.isArray(output)) {
    return null;
  }

  const textParts: string[] = [];

  for (const item of output) {
    if (!isRecord(item) || !Array.isArray(item.content)) {
      continue;
    }

    for (const content of item.content) {
      if (isRecord(content) && typeof content.text === "string") {
        textParts.push(content.text);
      }
    }
  }

  return textParts.length ? textParts.join("\n") : null;
}

async function readResponseError(response: Response): Promise<unknown> {
  try {
    return await response.json();
  } catch {
    return response.statusText;
  }
}

function getOpenAiErrorCauseMessage(cause: unknown): string | null {
  if (typeof cause === "string" && cause.trim()) {
    return cause;
  }

  if (cause instanceof Error && cause.message.trim()) {
    return cause.message;
  }

  if (isRecord(cause)) {
    const error = cause.error;

    if (isRecord(error) && typeof error.message === "string") {
      return error.message;
    }

    if (typeof cause.message === "string") {
      return cause.message;
    }
  }

  return null;
}

function isAbortError(error: unknown): boolean {
  return error instanceof DOMException && error.name === "AbortError";
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

const recipeAiProviderDraftJsonSchema = {
  type: "object",
  additionalProperties: false,
  required: ["draftRecipe", "changeSummary"],
  properties: {
    draftRecipe: {
      type: "object",
      additionalProperties: false,
      required: [
        "title",
        "description",
        "yield",
        "times",
        "imageUrl",
        "ingredients",
        "directions",
        "notes",
        "source",
        "tags",
      ],
      properties: {
        title: { type: "string" },
        description: { type: ["string", "null"] },
        yield: {
          type: ["object", "null"],
          additionalProperties: false,
          required: ["quantity", "unit", "notes"],
          properties: {
            quantity: { type: ["number", "null"], exclusiveMinimum: 0 },
            unit: { type: ["string", "null"] },
            notes: { type: ["string", "null"] },
          },
        },
        times: {
          type: ["object", "null"],
          additionalProperties: false,
          required: ["prepMinutes", "cookMinutes", "totalMinutes"],
          properties: {
            prepMinutes: { type: ["integer", "null"], minimum: 0 },
            cookMinutes: { type: ["integer", "null"], minimum: 0 },
            totalMinutes: { type: ["integer", "null"], minimum: 0 },
          },
        },
        imageUrl: { type: ["string", "null"] },
        ingredients: {
          type: "array",
          minItems: 1,
          items: {
            type: "object",
            additionalProperties: false,
            required: ["id", "title", "items"],
            properties: {
              id: { type: "string" },
              title: { type: ["string", "null"] },
              items: {
                type: "array",
                minItems: 1,
                items: {
                  type: "object",
                  additionalProperties: false,
                  required: [
                    "id",
                    "raw",
                    "quantity",
                    "unit",
                    "item",
                    "preparation",
                    "optional",
                  ],
                  properties: {
                    id: { type: "string" },
                    raw: { type: "string" },
                    quantity: { type: ["number", "null"], exclusiveMinimum: 0 },
                    unit: { type: ["string", "null"] },
                    item: { type: "string" },
                    preparation: { type: ["string", "null"] },
                    optional: { type: ["boolean", "null"] },
                  },
                },
              },
            },
          },
        },
        directions: {
          type: "array",
          minItems: 1,
          items: {
            type: "object",
            additionalProperties: false,
            required: ["id", "title", "steps"],
            properties: {
              id: { type: "string" },
              title: { type: ["string", "null"] },
              steps: {
                type: "array",
                minItems: 1,
                items: {
                  type: "object",
                  additionalProperties: false,
                  required: [
                    "id",
                    "order",
                    "text",
                    "timerMinutes",
                    "ingredientRefs",
                  ],
                  properties: {
                    id: { type: "string" },
                    order: { type: "integer", minimum: 1 },
                    text: { type: "string" },
                    timerMinutes: { type: ["integer", "null"], minimum: 1 },
                    ingredientRefs: {
                      type: ["array", "null"],
                      items: { type: "string" },
                    },
                  },
                },
              },
            },
          },
        },
        variations: {
          type: ["array", "null"],
          items: {
            type: "object",
            additionalProperties: false,
            required: [
              "id",
              "title",
              "description",
              "ingredients",
              "directions",
              "notes",
            ],
            properties: {
              id: { type: "string" },
              title: { type: "string" },
              description: { type: ["string", "null"] },
              ingredients: {
                type: ["array", "null"],
                items: {
                  type: "object",
                  additionalProperties: false,
                  required: ["id", "title", "items"],
                  properties: {
                    id: { type: "string" },
                    title: { type: ["string", "null"] },
                    items: {
                      type: "array",
                      minItems: 1,
                      items: {
                        type: "object",
                        additionalProperties: false,
                        required: [
                          "id",
                          "raw",
                          "quantity",
                          "unit",
                          "item",
                          "preparation",
                          "optional",
                        ],
                        properties: {
                          id: { type: "string" },
                          raw: { type: "string" },
                          quantity: { type: ["number", "null"], exclusiveMinimum: 0 },
                          unit: { type: ["string", "null"] },
                          item: { type: "string" },
                          preparation: { type: ["string", "null"] },
                          optional: { type: ["boolean", "null"] },
                        },
                      },
                    },
                  },
                },
              },
              directions: {
                type: ["array", "null"],
                items: {
                  type: "object",
                  additionalProperties: false,
                  required: ["id", "title", "steps"],
                  properties: {
                    id: { type: "string" },
                    title: { type: ["string", "null"] },
                    steps: {
                      type: "array",
                      minItems: 1,
                      items: {
                        type: "object",
                        additionalProperties: false,
                        required: [
                          "id",
                          "order",
                          "text",
                          "timerMinutes",
                          "ingredientRefs",
                        ],
                        properties: {
                          id: { type: "string" },
                          order: { type: "integer", minimum: 1 },
                          text: { type: "string" },
                          timerMinutes: { type: ["integer", "null"], minimum: 1 },
                          ingredientRefs: {
                            type: ["array", "null"],
                            items: { type: "string" },
                          },
                        },
                      },
                    },
                  },
                },
              },
              notes: {
                type: ["array", "null"],
                items: { type: "string" },
              },
            },
          },
        },
        notes: { type: "array", items: { type: "string" } },
        source: {
          type: "object",
          additionalProperties: false,
          required: ["type", "name", "url"],
          properties: {
            type: { type: "string", enum: ["ai"] },
            name: { type: ["string", "null"] },
            url: { type: ["string", "null"] },
          },
        },
        tags: { type: "array", items: { type: "string" } },
      },
    },
    changeSummary: {
      type: "array",
      minItems: 1,
      items: { type: "string" },
    },
  },
};
