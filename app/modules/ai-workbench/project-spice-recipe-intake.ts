import { ZodError } from "zod";

import {
  recipeDraftSchema,
  type RecipeDraft,
} from "~/modules/recipe-domain";

export const projectSpiceRecipeOutputSpec = {
  envelopeKeys: ["draftRecipe", "changeSummary"],
  omittedRecipeKeys: ["id", "version", "createdAt", "updatedAt"],
  draftRecipeShape: {
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
            order: "positive integer step number starting at 1",
            text: "direction text that includes ingredient quantities used in this step",
            timerMinutes: "positive integer | optional",
            ingredientRefs: ["ingredient item ids | optional"],
          },
        ],
      },
    ],
    notes: ["string | optional"],
    source: {
      type: "ai",
      name: "ChatGPT or Claude | optional",
      url: "valid URL string | optional",
    },
    tags: ["string"],
  },
} as const;

export const projectSpiceRecipeSystemPrompt = [
  "You are a recipe creation assistant for Project Spice, a private recipe workbench.",
  "Your job is to create practical, cookable recipes that can be ingested as structured Project Spice recipe drafts.",
  "",
  "Recipe style:",
  "- Use clear, concise recipe names.",
  "- Favor realistic prep, cook, and total times in whole minutes.",
  "- Write ingredients as readable lines while also splitting quantity, unit, item, preparation, and optional when known.",
  "- Use stable, slug-like ids for ingredient sections, ingredient items, direction sections, and steps.",
  "- Keep direction steps specific enough for a home cook to follow.",
  "- Every direction step must include an order value. Use 1, 2, 3, and so on within each direction section.",
  "- Direction step text must display the ingredient quantities used in that step when quantities are known.",
  "- If an ingredient is split across multiple steps, state the partial quantity used in each relevant step. For example, if the recipe has 2 tablespoons butter and 1 tablespoon is used early, write the step text with \"1 tablespoon butter\" rather than only \"butter\".",
  "- Add timerMinutes on steps where a meaningful timer applies.",
  "- Add ingredientRefs on steps when you can confidently reference ingredient item ids.",
  "- Use source.type = \"ai\".",
  "",
  "Output rules:",
  "- Return only JSON. Do not wrap the answer in markdown fences.",
  "- The top-level JSON object must contain draftRecipe and changeSummary.",
  "- draftRecipe must omit id, version, createdAt, and updatedAt.",
  "- Omit unknown optional fields instead of using null.",
  "- changeSummary must be an array of short strings describing what you created.",
  "",
  "Top-level output shape:",
  JSON.stringify(projectSpiceRecipeOutputSpec, null, 2),
].join("\n");

type IntakeParseResult =
  | { ok: true; draftRecipe: RecipeDraft; changeSummary: string[] }
  | { ok: false; errors: string[] };

export function parseProjectSpiceRecipeIntakeJson(
  value: string,
): IntakeParseResult {
  try {
    const parsedJson = JSON.parse(normalizeRecipeIntakeJsonText(value));
    const envelope = getDraftEnvelope(parsedJson);
    const draftRecipe = recipeDraftSchema.parse(
      removeNullObjectValues(envelope.draftRecipe),
    );
    const changeSummary = parseChangeSummary(envelope.changeSummary);

    return {
      ok: true,
      draftRecipe,
      changeSummary,
    };
  } catch (error) {
    return {
      ok: false,
      errors: formatIntakeParseErrors(error),
    };
  }
}

export function normalizeRecipeIntakeJsonText(value: string): string {
  return stripMarkdownCodeFence(value.trim()).replace(/[“”]/g, "\"");
}

function stripMarkdownCodeFence(value: string): string {
  const match = /^```(?:json)?\s*([\s\S]*?)\s*```$/i.exec(value);

  return match ? match[1].trim() : value;
}

function getDraftEnvelope(value: unknown): {
  draftRecipe: unknown;
  changeSummary: unknown;
} {
  if (!isRecord(value)) {
    throw new Error("Paste a JSON object.");
  }

  if ("draftRecipe" in value) {
    return {
      draftRecipe: value.draftRecipe,
      changeSummary: value.changeSummary,
    };
  }

  return {
    draftRecipe: value,
    changeSummary: ["Prepared a Project Spice recipe draft."],
  };
}

function parseChangeSummary(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return ["Prepared a Project Spice recipe draft."];
  }

  const entries = value
    .filter((entry): entry is string => typeof entry === "string")
    .map((entry) => entry.trim())
    .filter(Boolean);

  return entries.length ? entries : ["Prepared a Project Spice recipe draft."];
}

function formatIntakeParseErrors(error: unknown): string[] {
  if (error instanceof SyntaxError) {
    return ["Paste valid JSON from ChatGPT or Claude."];
  }

  if (error instanceof ZodError) {
    return error.issues.map((issue) => {
      const path = issue.path.length ? `${issue.path.join(".")}: ` : "";

      return `${path}${issue.message}`;
    });
  }

  return [error instanceof Error ? error.message : "Could not parse recipe JSON."];
}

function removeNullObjectValues(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value
      .filter((entryValue) => entryValue !== null)
      .map(removeNullObjectValues);
  }

  if (!isRecord(value)) {
    return value;
  }

  return Object.fromEntries(
    Object.entries(value)
      .filter(([, entryValue]) => entryValue !== null)
      .map(([key, entryValue]) => [key, removeNullObjectValues(entryValue)]),
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
