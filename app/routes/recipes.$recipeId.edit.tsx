import { redirect } from "react-router";

import type { Route } from "./+types/recipes.$recipeId.edit";
import { RecipeEditorForm } from "~/modules/recipe-editor";
import { useShellCommand } from "~/modules/ui-shell/AppShell";
import {
  buildRecipeFromEditorFormData,
  getExpectedRecipeVersion,
} from "~/server/recipes/recipe.form";
import { RecipeVersionConflictError } from "~/server/recipes/recipe.repo";
import { getRecipeService } from "~/server/recipes/recipe.runtime";
import {
  getRecipeDetailPath,
} from "~/modules/recipe-viewer/recipe-detail";

export function meta({ data }: Route.MetaArgs) {
  return [{ title: `Edit ${data?.recipe.title ?? "Recipe"} | ProjectSpice` }];
}

export async function loader({ params, context }: Route.LoaderArgs) {
  const recipe = await getRecipeService(context).getById(params.recipeId);

  if (!recipe) {
    throw new Response("Recipe not found", { status: 404 });
  }

  return { recipe };
}

export async function action({ params, request, context }: Route.ActionArgs) {
  const service = getRecipeService(context);
  const recipe = await service.getById(params.recipeId);

  if (!recipe) {
    throw new Response("Recipe not found", { status: 404 });
  }

  const formData = await request.formData();
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
  useShellCommand({
    backHref: getRecipeDetailPath(loaderData.recipe),
    backLabel: "Back to recipe",
    eyebrow: "Edit recipe",
    title: loaderData.recipe.title,
  });

  return (
    <div className="recipe-editor-route">
      <RecipeEditorForm
        mode="edit"
        recipe={loaderData.recipe}
        cancelHref={getRecipeDetailPath(loaderData.recipe)}
        errors={actionData?.errors}
      />
    </div>
  );
}
