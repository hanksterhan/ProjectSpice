import { Form, Link, redirect } from "react-router";
import { z } from "zod";

import type { Route } from "./+types/recipes.$recipeId";
import {
  buildRecipeFromAiDraft,
  buildUpdatedRecipeFromAiDraft,
  parseAiDraftJson,
  type RecipeAiPanelActionData,
} from "~/modules/ai-workbench";
import { RecipeViewer } from "~/modules/recipe-viewer/RecipeViewer";
import { getRecipeDetailPath } from "~/modules/recipe-viewer/recipe-detail";
import {
  RecipeAiRateLimitError,
  formatOpenAiRecipeAiProviderError,
  getRecipeAiService,
} from "~/server/ai";
import { RecipeVersionConflictError } from "~/server/recipes/recipe.repo";
import { getRecipeService } from "~/server/recipes/recipe.runtime";

const transformFormSchema = z.object({
  prompt: z.string().trim().min(1, "Add a transform request before generating."),
  preferences: z.string().optional(),
});

const saveDraftFormSchema = z.object({
  draftRecipeJson: z.string().trim().min(1, "Missing AI draft."),
  changeSummaryJson: z.string().optional(),
});

export function meta({ data }: Route.MetaArgs) {
  return [{ title: `${data?.recipe.title ?? "Recipe"} | ProjectSpice` }];
}

export async function loader({ params, context }: Route.LoaderArgs) {
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

  if (intent === "transform") {
    const parsed = transformFormSchema.safeParse({
      prompt: formData.get("prompt"),
      preferences: formData.get("preferences"),
    });

    if (!parsed.success) {
      return {
        intent: "transform",
        errors: parsed.error.issues.map((issue) => issue.message),
      };
    }

    try {
      const result = await getRecipeAiService(context).transformRecipeDraft(
        {
          recipe,
          prompt: parsed.data.prompt,
          preferences: parsePreferences(parsed.data.preferences),
        },
        {
          rateLimitKey: getRateLimitKey(request),
        },
      );

      return {
        intent: "transform",
        draftRecipe: result.draftRecipe,
        changeSummary: result.changeSummary,
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
  actionData,
  loaderData,
}: Route.ComponentProps) {
  return (
    <div className="recipe-detail-route">
      <Link className="back-link" to="/">
        Back to library
      </Link>
      <Link className="button button-secondary edit-recipe-link" to="edit">
        Edit Recipe
      </Link>
      <Form method="post">
        <input name="intent" type="hidden" value="delete" />
        <button className="button button-quiet delete-recipe-button" type="submit">
          Delete Recipe
        </button>
      </Form>
      <RecipeViewer actionData={actionData} recipe={loaderData.recipe} />
    </div>
  );
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
