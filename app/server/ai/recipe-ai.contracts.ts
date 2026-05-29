import { z } from "zod";

import {
  recipeDraftSchema,
  type Recipe,
  type RecipeDraft,
} from "~/modules/recipe-domain";

export type RecipeAiOperation = "generate" | "transform";

export type RecipeAiPromptMessage = {
  role: "system" | "user";
  content: string;
};

export type RecipeAiPromptContract = {
  operation: RecipeAiOperation;
  messages: RecipeAiPromptMessage[];
  responseFormat: RecipeAiResponseFormat;
};

export type RecipeAiResponseFormat = {
  type: "json_object";
  requiredKeys: ["draftRecipe", "changeSummary"];
  instructions: string;
};

export type RecipeAiGenerateRequest = {
  prompt: string;
  preferences?: string[];
};

export type RecipeAiTransformRequest = {
  recipe: Recipe;
  prompt: string;
  preferences?: string[];
};

export type RecipeAiProviderDraft = {
  draftRecipe: RecipeDraft;
  changeSummary: string[];
};

export interface RecipeAiProvider {
  generateRecipe(request: RecipeAiGenerateRequest): Promise<RecipeAiProviderDraft>;
  transformRecipe(request: RecipeAiTransformRequest): Promise<RecipeAiProviderDraft>;
}

const recipeDraftJsonShape = {
  title: "string",
  description: "string | optional",
  yield: {
    quantity: "number | optional",
    unit: "string | optional",
    notes: "string | optional",
  },
  times: {
    prepMinutes: "integer >= 0 | optional",
    cookMinutes: "integer >= 0 | optional",
    totalMinutes: "integer >= 0 | optional",
  },
  imageUrl: "valid URL string | optional",
  ingredients: [
    {
      id: "stable slug-like string",
      title: "string | optional",
      items: [
        {
          id: "stable slug-like string",
          raw: "readable ingredient line",
          quantity: "number > 0 | optional",
          unit: "string | optional",
          item: "ingredient name",
          preparation: "string | optional",
          optional: "boolean | optional",
        },
      ],
    },
  ],
  directions: [
    {
      id: "stable slug-like string",
      title: "string | optional",
      steps: [
        {
          id: "stable slug-like string",
          order: "positive integer starting at 1",
          text: "direction text",
          timerMinutes: "positive integer | optional",
          ingredientRefs: ["ingredient item ids | optional"],
        },
      ],
    },
  ],
  notes: ["string | optional"],
  source: {
    type: "ai",
    name: "string | optional",
    url: "valid URL string | optional",
  },
  tags: ["string"],
};

export const recipeAiResponseFormat = {
  type: "json_object",
  requiredKeys: ["draftRecipe", "changeSummary"],
  instructions: [
    "Return only a JSON object, with no markdown fences or prose.",
    "The JSON object must include draftRecipe and changeSummary keys.",
    "draftRecipe must conform to the Project Spice RecipeDraft schema.",
    "changeSummary must be an array of short user-facing strings.",
    "Do not include id, version, createdAt, or updatedAt in draftRecipe.",
    "Use source.type = \"ai\".",
  ].join(" "),
} as const satisfies RecipeAiResponseFormat;

const systemMessage = [
  "You are Project Spice's recipe drafting assistant.",
  "Create practical, structured recipes for a private recipe workbench.",
  "Favor clear ingredient sections, concise directions, realistic timings, and stable ids.",
].join(" ");

export function buildGenerateRecipePrompt(
  request: RecipeAiGenerateRequest,
): RecipeAiPromptContract {
  return {
    operation: "generate",
    messages: [
      {
        role: "system",
        content: systemMessage,
      },
      {
        role: "user",
        content: [
          "Generate a new recipe draft from this request:",
          request.prompt,
          formatPreferences(request.preferences),
          formatStructuredOutputInstructions(),
        ].join("\n\n"),
      },
    ],
    responseFormat: recipeAiResponseFormat,
  };
}

export function buildTransformRecipePrompt(
  request: RecipeAiTransformRequest,
): RecipeAiPromptContract {
  return {
    operation: "transform",
    messages: [
      {
        role: "system",
        content: systemMessage,
      },
      {
        role: "user",
        content: [
          "Transform the existing recipe according to this request:",
          request.prompt,
          "Preserve the recipe's intent unless the request explicitly changes it.",
          formatPreferences(request.preferences),
          "Existing recipe JSON:",
          JSON.stringify(request.recipe, null, 2),
          formatStructuredOutputInstructions(),
        ].join("\n\n"),
      },
    ],
    responseFormat: recipeAiResponseFormat,
  };
}

export function parseRecipeAiProviderDraft(output: unknown): RecipeAiProviderDraft {
  const parsed = recipeAiProviderDraftSchema.parse(removeNullObjectValues(output));

  return parsed;
}

export const recipeAiProviderDraftSchema = z
  .object({
    draftRecipe: recipeDraftSchema,
    changeSummary: z.array(z.string().trim().min(1)).min(1),
  })
  .strict();

function formatPreferences(preferences: string[] | undefined): string {
  if (!preferences?.length) {
    return "Preferences: none provided.";
  }

  return `Preferences:\n${preferences.map((preference) => `- ${preference}`).join("\n")}`;
}

function formatStructuredOutputInstructions(): string {
  return [
    "Structured JSON output instructions:",
    recipeAiResponseFormat.instructions,
    "Expected draftRecipe shape:",
    JSON.stringify(recipeDraftJsonShape, null, 2),
  ].join("\n");
}

function removeNullObjectValues(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value
      .filter((entryValue) => entryValue !== null)
      .map(removeNullObjectValues);
  }

  if (typeof value !== "object" || value === null) {
    return value;
  }

  return Object.fromEntries(
    Object.entries(value)
      .filter(([, entryValue]) => entryValue !== null)
      .map(([key, entryValue]) => [key, removeNullObjectValues(entryValue)]),
  );
}
