import { redirect } from "react-router";
import { z } from "zod";

import type { Route } from "./+types/ai";
import {
  AiWorkbench,
  buildRecipeFromAiDraft,
  parseAiDraftJson,
  type AiWorkbenchActionData,
} from "~/modules/ai-workbench";
import {
  RecipeAiRateLimitError,
  formatOpenAiRecipeAiProviderError,
  getRecipeAiProviderOverride,
  getRecipeAiService,
} from "~/server/ai";
import { getRecipeService } from "~/server/recipes/recipe.runtime";

const generateFormSchema = z.object({
  prompt: z.string().trim().min(1, "Add a prompt before generating."),
  preferences: z.string().optional(),
});

const saveFormSchema = z.object({
  draftRecipeJson: z.string().trim().min(1, "Missing AI draft."),
  changeSummaryJson: z.string().optional(),
});

export function meta(_args: Route.MetaArgs) {
  return [{ title: "AI Workbench | ProjectSpice" }];
}

export async function action({
  request,
  context,
}: Route.ActionArgs): Promise<Response | AiWorkbenchActionData> {
  const formData = await request.formData();
  const intent = formData.get("intent");

  if (intent === "generate") {
    const parsed = generateFormSchema.safeParse({
      prompt: formData.get("prompt"),
      preferences: formData.get("preferences"),
    });

    if (!parsed.success) {
      return {
        intent: "generate",
        errors: parsed.error.issues.map((issue) => issue.message),
      };
    }

    try {
      const result = await getRecipeAiService(
        context,
        getRecipeAiProviderOverride(request, context),
      ).generateRecipeDraft(
        {
          prompt: parsed.data.prompt,
          preferences: parsePreferences(parsed.data.preferences),
        },
        {
          rateLimitKey: getRateLimitKey(request),
        },
      );

      return {
        intent: "generate",
        draftRecipe: result.draftRecipe,
        changeSummary: result.changeSummary,
      };
    } catch (error) {
      return {
        intent: "generate",
        errors: [getAiErrorMessage(error)],
      };
    }
  }

  if (intent === "save") {
    const parsed = saveFormSchema.safeParse({
      draftRecipeJson: formData.get("draftRecipeJson"),
      changeSummaryJson: formData.get("changeSummaryJson"),
    });

    if (!parsed.success) {
      return {
        intent: "save",
        errors: parsed.error.issues.map((issue) => issue.message),
      };
    }

    try {
      const draftRecipe = parseAiDraftJson(parsed.data.draftRecipeJson);
      const recipe = await getRecipeService(context).create(
        buildRecipeFromAiDraft({
          draftRecipe,
          now: new Date().toISOString(),
        }),
      );

      return redirect(`/recipes/${encodeURIComponent(recipe.id)}`);
    } catch (error) {
      return {
        intent: "save",
        errors: [getSaveErrorMessage(error)],
      };
    }
  }

  return {
    intent: "generate",
    errors: ["Choose an AI workbench action."],
  };
}

export default function AiWorkbenchRoute({ actionData }: Route.ComponentProps) {
  return <AiWorkbench actionData={actionData} />;
}

function parsePreferences(value: string | undefined): string[] | undefined {
  const preferences = value
    ?.split(",")
    .map((preference) => preference.trim())
    .filter(Boolean);

  return preferences?.length ? preferences : undefined;
}

function getRateLimitKey(request: Request): string {
  return request.headers.get("CF-Connecting-IP") ?? "single-user";
}

function getAiErrorMessage(error: unknown): string {
  if (error instanceof RecipeAiRateLimitError) {
    return "AI rate limit exceeded. Try again later.";
  }

  return (
    formatOpenAiRecipeAiProviderError(error) ??
    (error instanceof Error ? error.message : "AI draft generation failed.")
  );
}

function getSaveErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "Could not save AI draft.";
}
