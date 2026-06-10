import { useEffect, useState } from "react";
import { redirect } from "react-router";
import { z } from "zod";

import type { Route } from "./+types/recipes.$recipeId.edit";
import {
  RecipeAiPanel,
  appendAiChatTurn,
  buildRecipeFromAiDraft,
  buildUpdatedRecipeFromAiDraft,
  parseAiChatHistoryJson,
  parseAiDraftJson,
  type RecipeAiPanelActionData,
} from "~/modules/ai-workbench";
import { RecipeEditorForm } from "~/modules/recipe-editor";
import { useShellCommand } from "~/modules/ui-shell/AppShell";
import {
  RecipeAiRateLimitError,
  formatOpenAiRecipeAiProviderError,
  getRecipeAiProviderOverride,
  getRecipeAiService,
} from "~/server/ai";
import {
  buildRecipeFromEditorFormData,
  getExpectedRecipeVersion,
} from "~/server/recipes/recipe.form";
import { requireAuthenticatedUser } from "~/server/auth";
import { RecipeVersionConflictError } from "~/server/recipes/recipe.repo";
import { getRecipeService } from "~/server/recipes/recipe.runtime";
import {
  getRecipeDetailPath,
} from "~/modules/recipe-viewer/recipe-detail";

const transformFormSchema = z.object({
  prompt: z.string().trim().min(1, "Add a transform request before generating."),
  preferences: z.string().optional(),
  currentDraftJson: z.string().optional(),
  chatHistoryJson: z.string().optional(),
});

const saveDraftFormSchema = z.object({
  draftRecipeJson: z.string().trim().min(1, "Missing AI draft."),
  changeSummaryJson: z.string().optional(),
});

export function meta({ data }: Route.MetaArgs) {
  return [{ title: `Edit ${data?.recipe.title ?? "Recipe"} | ProjectSpice` }];
}

export async function loader({ params, request, context }: Route.LoaderArgs) {
  await requireAuthenticatedUser({ request, context, params });

  const recipe = await getRecipeService(context).getById(params.recipeId);

  if (!recipe) {
    throw new Response("Recipe not found", { status: 404 });
  }

  return { recipe };
}

export async function action({
  params,
  request,
  context,
}: Route.ActionArgs): Promise<Response | RecipeAiPanelActionData | { errors: string[] }> {
  const user = await requireAuthenticatedUser({ request, context, params });

  const service = getRecipeService(context);
  const recipe = await service.getById(params.recipeId);

  if (!recipe) {
    throw new Response("Recipe not found", { status: 404 });
  }

  const formData = await request.formData();
  const intent = formData.get("intent");

  if (intent === "transform") {
    const parsed = transformFormSchema.safeParse({
      prompt: formData.get("prompt"),
      preferences: formData.get("preferences"),
      currentDraftJson: optionalFormString(formData.get("currentDraftJson")),
      chatHistoryJson: optionalFormString(formData.get("chatHistoryJson")),
    });

    if (!parsed.success) {
      return {
        intent: "transform",
        errors: parsed.error.issues.map((issue) => issue.message),
      };
    }

    try {
      const currentDraft = parsed.data.currentDraftJson
        ? parseAiDraftJson(parsed.data.currentDraftJson)
        : undefined;
      const chatHistory = parseAiChatHistoryJson(parsed.data.chatHistoryJson);
      const result = await getRecipeAiService(
        context,
        getRecipeAiProviderOverride(request, context),
      ).transformRecipeDraft(
        {
          recipe,
          prompt: parsed.data.prompt,
          preferences: parsePreferences(parsed.data.preferences),
          currentDraft,
          conversation: chatHistory,
        },
        {
          rateLimitKey: user.userId,
        },
      );

      return {
        intent: "transform",
        draftRecipe: result.draftRecipe,
        changeSummary: result.changeSummary,
        chatHistory: appendAiChatTurn({
          history: chatHistory,
          prompt: parsed.data.prompt,
          changeSummary: result.changeSummary,
        }),
      };
    } catch (error) {
      return {
        intent: "transform",
        errors: [getAiErrorMessage(error)],
      };
    }
  }

  if (intent === "save-update" || intent === "save-copy") {
    const parsed = saveDraftFormSchema.safeParse({
      draftRecipeJson: formData.get("draftRecipeJson"),
      changeSummaryJson: formData.get("changeSummaryJson"),
    });

    if (!parsed.success) {
      return {
        intent,
        errors: parsed.error.issues.map((issue) => issue.message),
      };
    }

    const changeSummary = parseChangeSummary(parsed.data.changeSummaryJson);

    try {
      const draftRecipe = parseAiDraftJson(parsed.data.draftRecipeJson);

      if (intent === "save-copy") {
        const copiedRecipe = await service.create(
          buildRecipeFromAiDraft({
            draftRecipe,
            now: new Date().toISOString(),
          }),
        );

        return redirect(getRecipeDetailPath(copiedRecipe));
      }

      const updatedRecipe = await service.update(
        buildUpdatedRecipeFromAiDraft({
          draftRecipe,
          existingRecipe: recipe,
          now: new Date().toISOString(),
        }),
        recipe.version,
        formatChangeSummary(changeSummary),
      );

      return redirect(getRecipeDetailPath(updatedRecipe));
    } catch (error) {
      return {
        intent,
        draftRecipe: safeParseDraft(parsed.data.draftRecipeJson),
        changeSummary,
        errors: [getSaveErrorMessage(error)],
      };
    }
  }

  const expectedVersion = getExpectedRecipeVersion(formData);

  if (!expectedVersion) {
    return { errors: ["Missing expected recipe version."] };
  }

  const result = buildRecipeFromEditorFormData({
    formData,
    baseDraft: recipe,
    existingRecipe: recipe,
    now: new Date().toISOString(),
  });

  if (!result.ok) {
    return { errors: result.errors };
  }

  try {
    const updatedRecipe = await service.update(
      result.recipe,
      expectedVersion,
      "Updated recipe from editor",
    );

    return redirect(getRecipeDetailPath(updatedRecipe));
  } catch (error) {
    if (error instanceof RecipeVersionConflictError) {
      return { errors: ["This recipe changed before your save. Reload and try again."] };
    }

    throw error;
  }
}

export default function EditRecipe({ loaderData, actionData }: Route.ComponentProps) {
  const isAiActionData = isRecipeAiPanelActionData(actionData);
  const [isAssistantOpen, setIsAssistantOpen] = useState(isAiActionData);

  useEffect(() => {
    if (isAiActionData) {
      setIsAssistantOpen(true);
    }
  }, [isAiActionData]);

  useShellCommand({
    backHref: getRecipeDetailPath(loaderData.recipe),
    backLabel: "Back to recipe",
    title: loaderData.recipe.title,
  });

  return (
    <div className="recipe-editor-route">
      <div className="recipe-editor-modebar">
        <div>
          <span>Editor</span>
          <strong>Manual edits with AI assist when you need it</strong>
        </div>
        <button
          className="button button-secondary"
          type="button"
          aria-controls="recipe-ai-assistant"
          aria-expanded={isAssistantOpen}
          onClick={() => setIsAssistantOpen((isOpen) => !isOpen)}
        >
          {isAssistantOpen ? "Hide AI Assist" : "AI Assist"}
        </button>
      </div>

      <div className={isAssistantOpen ? "recipe-editor-workspace with-ai" : "recipe-editor-workspace"}>
        <RecipeEditorForm
          mode="edit"
          recipe={loaderData.recipe}
          cancelHref={getRecipeDetailPath(loaderData.recipe)}
          errors={!isAiActionData ? actionData?.errors : undefined}
        />
        {isAssistantOpen ? (
          <RecipeAiPanel
            actionData={isAiActionData ? actionData : undefined}
            onClose={() => setIsAssistantOpen(false)}
            recipe={loaderData.recipe}
          />
        ) : null}
      </div>
    </div>
  );
}

function isRecipeAiPanelActionData(
  actionData: Route.ComponentProps["actionData"],
): actionData is RecipeAiPanelActionData {
  return Boolean(
    actionData &&
      "intent" in actionData &&
      (actionData.intent === "transform" ||
        actionData.intent === "save-update" ||
        actionData.intent === "save-copy" ||
        actionData.intent === "delete"),
  );
}

function parsePreferences(value: string | undefined): string[] | undefined {
  const preferences = value
    ?.split(",")
    .map((preference) => preference.trim())
    .filter(Boolean);

  return preferences?.length ? preferences : undefined;
}

function optionalFormString(value: FormDataEntryValue | null): string | undefined {
  return typeof value === "string" && value.trim() ? value : undefined;
}

function getAiErrorMessage(error: unknown): string {
  if (error instanceof RecipeAiRateLimitError) {
    return "AI rate limit exceeded. Try again later.";
  }

  return (
    formatOpenAiRecipeAiProviderError(error) ??
    (error instanceof Error ? error.message : "AI recipe transformation failed.")
  );
}

function getSaveErrorMessage(error: unknown): string {
  if (error instanceof RecipeVersionConflictError) {
    return "This recipe changed before your save. Reload and try again.";
  }

  return error instanceof Error ? error.message : "Could not save AI draft.";
}

function parseChangeSummary(value: string | undefined): string[] {
  if (!value) {
    return [];
  }

  try {
    const parsed = JSON.parse(value);

    return Array.isArray(parsed)
      ? parsed.filter((entry): entry is string => typeof entry === "string")
      : [];
  } catch {
    return [];
  }
}

function formatChangeSummary(changeSummary: string[]): string {
  return changeSummary.length
    ? `AI transformed recipe: ${changeSummary.join("; ")}`
    : "AI transformed recipe";
}

function safeParseDraft(value: string) {
  try {
    return parseAiDraftJson(value);
  } catch {
    return undefined;
  }
}
