import { z } from "zod";

import {
  recipeDraftSchema,
  type Recipe,
  type RecipeDraft,
} from "~/modules/recipe-domain";
import { formatRecipeLensPromptGuidance } from "~/modules/recipe-lenses";

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
  currentDraft?: RecipeDraft;
  conversation?: RecipeAiConversationMessage[];
};

export type RecipeAiTransformRequest = {
  recipe: Recipe;
  prompt: string;
  preferences?: string[];
  currentDraft?: RecipeDraft;
  conversation?: RecipeAiConversationMessage[];
};

export type RecipeAiConversationMessage = {
  role: "user" | "assistant";
  content: string;
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
    "For transformed recipes, changeSummary must name the most important ingredient or portion deltas and include confidence/caveat language when the user's nutritional goal cannot be verified exactly.",
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
  const isRevision = Boolean(request.currentDraft);

  return {
    operation: "generate",
    messages: [
      {
        role: "system",
        content: systemMessage,
      },
      {
        role: "user",
        content: isRevision
          ? [
              "Revise the current unsaved recipe draft according to the latest user message.",
              "Only change the parts needed to satisfy the request; preserve the rest of the draft.",
              formatConversation(request.conversation),
              "Latest user message:",
              request.prompt,
              formatPreferences(request.preferences),
              "Current draft JSON:",
              JSON.stringify(request.currentDraft, null, 2),
              formatStructuredOutputInstructions(),
            ].join("\n\n")
          : [
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
          request.currentDraft
            ? "Revise the current unsaved transformed draft according to this request:"
            : "Transform the existing recipe according to this request:",
          request.prompt,
          request.currentDraft
            ? "Only change the parts needed to satisfy the request; preserve the rest of the current draft."
            : "Preserve the recipe's intent unless the request explicitly changes it.",
          formatTransformQualityGuidance(request),
          formatConversation(request.conversation),
          formatPreferences(request.preferences),
          "Existing recipe JSON:",
          JSON.stringify(request.recipe, null, 2),
          request.currentDraft
            ? [
                "Current transformed draft JSON:",
                JSON.stringify(request.currentDraft, null, 2),
              ].join("\n")
            : "",
          formatStructuredOutputInstructions(),
        ]
          .filter(Boolean)
          .join("\n\n"),
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

function formatTransformQualityGuidance(request: RecipeAiTransformRequest): string {
  const lensGuidance = formatRecipeLensPromptGuidance(
    [request.prompt, ...(request.preferences ?? [])].join("\n"),
  );
  const generalGuidance = [
    "Transform quality requirements:",
    "- Preserve serving count unless the user explicitly asks for portion changes; if portion changes drive the result, say so.",
    "- Make the most important ingredient quantity changes explicit in changeSummary.",
    "- Use cautious wording for nutrition, glucose, diet, allergy, or medical-adjacent claims unless exact validated data is available.",
  ].join("\n");

  return lensGuidance
    ? [generalGuidance, "Recipe lens requirements:", lensGuidance].join("\n\n")
    : generalGuidance;
}

function formatConversation(
  conversation: RecipeAiConversationMessage[] | undefined,
): string {
  if (!conversation?.length) {
    return "Conversation so far: none.";
  }

  return [
    "Conversation so far:",
    ...conversation.map((message) => `${message.role}: ${message.content}`),
  ].join("\n");
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
