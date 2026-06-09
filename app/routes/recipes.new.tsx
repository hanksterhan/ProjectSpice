import { redirect } from "react-router";

import type { Route } from "./+types/recipes.new";
import { createEmptyRecipeDraft } from "~/modules/recipe-domain";
import {
  buildRecipeFromAiDraft,
  parseAiDraftJson,
  parseProjectSpiceRecipeIntakeJson,
  RecipeIntake,
  type RecipeIntakeActionData,
} from "~/modules/ai-workbench";
import { RecipeEditorForm } from "~/modules/recipe-editor";
import { RecipeUrlIntake, type RecipeUrlIntakeActionData } from "~/modules/recipe-scraper";
import { useShellCommand } from "~/modules/ui-shell/AppShell";
import { buildRecipeFromEditorFormData } from "~/server/recipes/recipe.form";
import { getRecipeService } from "~/server/recipes/recipe.runtime";
import { scrapeRecipeFromUrl } from "~/server/recipe-scraper";

export function meta(_args: Route.MetaArgs) {
  return [{ title: "New Recipe | ProjectSpice" }];
}

export function loader({ request }: Route.LoaderArgs) {
  const mode = new URL(request.url).searchParams.get("mode");

  return {
    mode: mode === "manual" || mode === "url" ? mode : "intake",
    recipe: createEmptyRecipeDraft(),
  };
}

export async function action({
  request,
  context,
}: Route.ActionArgs): Promise<
  Response | RecipeIntakeActionData | RecipeUrlIntakeActionData | { errors: string[] }
> {
  const formData = await request.formData();
  const intent = formData.get("intent");

  if (intent === "preview-url") {
    const recipeUrl = getFormString(formData, "recipeUrl");

    try {
      const scraped = await scrapeRecipeFromUrl(recipeUrl);

      return {
        intent: "preview-url",
        recipeUrl,
        draftRecipe: scraped.draftRecipe,
        warnings: scraped.warnings,
      } satisfies RecipeUrlIntakeActionData;
    } catch (error) {
      return {
        intent: "preview-url",
        recipeUrl,
        errors: [error instanceof Error ? error.message : "Could not import recipe."],
      } satisfies RecipeUrlIntakeActionData;
    }
  }

  if (intent === "preview-intake") {
    const rawRecipeJson = getFormString(formData, "recipeJson");
    const parsed = parseProjectSpiceRecipeIntakeJson(rawRecipeJson);

    if (!parsed.ok) {
      return {
        intent: "preview-intake",
        rawRecipeJson,
        errors: parsed.errors,
      };
    }

    return {
      intent: "preview-intake",
      draftRecipe: parsed.draftRecipe,
      changeSummary: parsed.changeSummary,
      rawRecipeJson,
    };
  }

  if (intent === "save-intake") {
    const rawRecipeJson = getFormString(formData, "recipeJson");
    const changeSummary = parseChangeSummaryJson(
      getFormString(formData, "changeSummaryJson"),
    );

    try {
      const draftRecipe = parseAiDraftJson(getFormString(formData, "draftRecipeJson"));
      const recipe = await getRecipeService(context).create(
        buildRecipeFromAiDraft({
          draftRecipe,
          now: new Date().toISOString(),
        }),
      );

      return redirect(`/recipes/${encodeURIComponent(recipe.id)}`);
    } catch (error) {
      return {
        intent: "save-intake",
        rawRecipeJson,
        changeSummary,
        errors: [error instanceof Error ? error.message : "Could not save recipe draft."],
      };
    }
  }

  const now = new Date().toISOString();
  const result = buildRecipeFromEditorFormData({
    formData,
    baseDraft: createEmptyRecipeDraft(),
    now,
  });

  if (!result.ok) {
    return { errors: result.errors };
  }

  const recipe = await getRecipeService(context).create(result.recipe);

  return redirect(`/recipes/${encodeURIComponent(recipe.id)}`);
}

export default function NewRecipe({ loaderData, actionData }: Route.ComponentProps) {
  useShellCommand({
    backHref: "/",
    backLabel: "Back to library",
    title:
      loaderData.mode === "manual"
        ? "New Recipe"
        : loaderData.mode === "url"
          ? "Import From URL"
          : "Recipe Intake",
  });

  if (loaderData.mode === "manual") {
    return (
      <div className="recipe-editor-route">
        <RecipeEditorForm
          mode="new"
          recipe={loaderData.recipe}
          cancelHref="/"
          errors={actionData?.errors}
        />
      </div>
    );
  }

  if (loaderData.mode === "url") {
    return (
      <RecipeUrlIntake
        actionData={actionData as RecipeUrlIntakeActionData | undefined}
      />
    );
  }

  return <RecipeIntake actionData={actionData as RecipeIntakeActionData | undefined} />;
}

function getFormString(formData: FormData, name: string): string {
  const value = formData.get(name);

  return typeof value === "string" ? value : "";
}

function parseChangeSummaryJson(value: string): string[] {
  try {
    const parsed = JSON.parse(value);

    if (!Array.isArray(parsed)) {
      return [];
    }

    return parsed.filter((entry): entry is string => typeof entry === "string");
  } catch {
    return [];
  }
}
