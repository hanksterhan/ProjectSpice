import { useState } from "react";
import { ChefHat } from "lucide-react";
import { Form, Link, redirect } from "react-router";
import { z } from "zod";

import type { Route } from "./+types/recipes.$recipeId";
import { addCookJournalNote, addCookedDate } from "~/modules/recipe-domain";
import {
  appendAiChatTurn,
  buildRecipeFromAiDraft,
  buildUpdatedRecipeFromAiDraft,
  parseAiChatHistoryJson,
  parseAiDraftJson,
  type RecipeAiPanelActionData,
} from "~/modules/ai-workbench";
import { getCookSessionHref } from "~/modules/cooking";
import {
  CookHistoryDrawer,
  RecipeViewer,
} from "~/modules/recipe-viewer/RecipeViewer";
import {
  getRecipeDetailPath,
  getRecipeEditPath,
} from "~/modules/recipe-viewer/recipe-detail";
import { useShellCommand } from "~/modules/ui-shell/AppShell";
import {
  RecipeAiRateLimitError,
  formatOpenAiRecipeAiProviderError,
  getRecipeAiProviderOverride,
  getRecipeAiService,
} from "~/server/ai";
import { requireAuthenticatedUser } from "~/server/auth";
import { RecipeVersionConflictError } from "~/server/recipes/recipe.repo";
import { getRecipeService } from "~/server/recipes/recipe.runtime";

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

const cookedFormSchema = z.object({
  cookedOn: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Choose a valid date."),
  cookNote: z.string().trim().max(1200, "Keep cook notes under 1200 characters.").optional(),
});

export function meta({ data }: Route.MetaArgs) {
  return [{ title: `${data?.recipe.title ?? "Recipe"} | ProjectSpice` }];
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
}: Route.ActionArgs): Promise<Response | RecipeAiPanelActionData> {
  const user = await requireAuthenticatedUser({ request, context, params });
  const service = getRecipeService(context);
  const recipe = await service.getById(params.recipeId);

  if (!recipe) {
    throw new Response("Recipe not found", { status: 404 });
  }

  const formData = await request.formData();
  const intent = formData.get("intent");

  if (intent === "delete") {
    await service.softDelete(params.recipeId, new Date().toISOString());

    return redirect("/");
  }

  if (intent === "record-cooked") {
    const parsed = cookedFormSchema.safeParse({
      cookedOn: formData.get("cookedOn"),
      cookNote: optionalFormString(formData.get("cookNote")),
    });

    if (!parsed.success) {
      return redirect(getRecipeDetailPath(recipe));
    }

    const now = new Date().toISOString();
    const cookedRecipe = addCookJournalNote(
      addCookedDate(recipe, parsed.data.cookedOn),
      parsed.data.cookedOn,
      parsed.data.cookNote,
    );
    const updatedRecipe = await service.update(
      {
        ...cookedRecipe,
        version: recipe.version + 1,
        updatedAt: now,
      },
      recipe.version,
      parsed.data.cookNote
        ? `Recorded cooked date with note: ${parsed.data.cookedOn}`
        : `Recorded cooked date: ${parsed.data.cookedOn}`,
    );

    return redirect(getRecipeDetailPath(updatedRecipe));
  }

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

  return {
    intent: "transform",
    errors: ["Choose a recipe action."],
  };
}

export default function RecipeDetail({
  loaderData,
}: Route.ComponentProps) {
  const [isCookHistoryOpen, setIsCookHistoryOpen] = useState(false);
  const recipe = loaderData.recipe;
  const recipeId = recipe.id;
  const recipeTitle = recipe.title;

  useShellCommand({
    backHref: "/",
    backLabel: "Back to library",
    title: recipeTitle,
  });

  return (
    <div className="recipe-detail-route">
      <RecipeViewer recipe={recipe} />
      <RecipeActionRail
        isCookHistoryOpen={isCookHistoryOpen}
        onOpenCookHistory={() => setIsCookHistoryOpen(true)}
        recipeId={recipeId}
        recipeTitle={recipeTitle}
      />
      {isCookHistoryOpen ? (
        <CookHistoryDrawer
          onClose={() => setIsCookHistoryOpen(false)}
          recipe={recipe}
        />
      ) : null}
    </div>
  );
}

function RecipeActionRail({
  isCookHistoryOpen,
  onOpenCookHistory,
  recipeId,
  recipeTitle,
}: {
  isCookHistoryOpen: boolean;
  onOpenCookHistory: () => void;
  recipeId: string;
  recipeTitle: string;
}) {
  return (
    <nav className="recipe-action-rail" aria-label="Recipe actions">
      <Link
        aria-label="Edit recipe"
        className="recipe-rail-action primary"
        data-tooltip="Edit recipe"
        to={getRecipeEditPath({ id: recipeId })}
      >
        <PencilIcon />
        <span className="sr-only">Edit recipe</span>
      </Link>
      <Link
        aria-label="Cook this recipe"
        className="recipe-rail-action"
        data-tooltip="Cook this recipe"
        to={getCookSessionHref([recipeId])}
      >
        <ChefHat aria-hidden="true" size={18} strokeWidth={2.4} />
        <span className="sr-only">Cook this recipe</span>
      </Link>
      <button
        className="recipe-rail-action"
        data-tooltip="Cook history"
        type="button"
        aria-controls="cook-history-drawer"
        aria-expanded={isCookHistoryOpen}
        aria-label="Cook history"
        onClick={onOpenCookHistory}
      >
        <HistoryIcon />
        <span className="sr-only">Cook history</span>
      </button>
      <Form
        method="post"
        onSubmit={(event) => {
          if (!window.confirm(`Delete "${recipeTitle}" from your library?`)) {
            event.preventDefault();
          }
        }}
      >
        <input name="intent" type="hidden" value="delete" />
        <button
          aria-label="Delete recipe"
          className="recipe-rail-action danger"
          data-tooltip="Delete recipe"
          type="submit"
        >
          <TrashIcon />
          <span className="sr-only">Delete recipe</span>
        </button>
      </Form>
    </nav>
  );
}

function PencilIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24" focusable="false">
      <path d="M12 20h9" />
      <path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z" />
    </svg>
  );
}

function TrashIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24" focusable="false">
      <path d="M3 6h18" />
      <path d="M8 6V4h8v2" />
      <path d="M19 6l-1 14H6L5 6" />
      <path d="M10 11v5" />
      <path d="M14 11v5" />
    </svg>
  );
}

function HistoryIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24" focusable="false">
      <path d="M3 12a9 9 0 1 0 3-6.7" />
      <path d="M3 4v5h5" />
      <path d="M12 7v5l3 2" />
    </svg>
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
