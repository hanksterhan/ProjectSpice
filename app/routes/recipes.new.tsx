import { redirect } from "react-router";

import type { Route } from "./+types/recipes.new";
import { createEmptyRecipeDraft } from "~/modules/recipe-domain";
import { RecipeEditorForm } from "~/modules/recipe-editor";
import { useShellCommand } from "~/modules/ui-shell/AppShell";
import { buildRecipeFromEditorFormData } from "~/server/recipes/recipe.form";
import { getRecipeService } from "~/server/recipes/recipe.runtime";

export function meta(_args: Route.MetaArgs) {
  return [{ title: "New Recipe | ProjectSpice" }];
}

export function loader(_args: Route.LoaderArgs) {
  return {
    recipe: createEmptyRecipeDraft(),
  };
}

export async function action({ request, context }: Route.ActionArgs) {
  const formData = await request.formData();
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
    eyebrow: "Recipe",
    title: "New Recipe",
  });

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
