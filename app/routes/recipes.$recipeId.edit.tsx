import { useState } from "react";

import type { Route } from "./+types/recipes.$recipeId.edit";
import type { RecipeDraft } from "~/modules/recipe-domain";
import { RecipeEditorForm } from "~/modules/recipe-editor";
import {
  getRecipeDetailPath,
  getSeedRecipeById,
} from "~/modules/recipe-viewer/recipe-detail";

export function meta({ data }: Route.MetaArgs) {
  return [{ title: `Edit ${data?.recipe.title ?? "Recipe"} | ProjectSpice` }];
}

export function loader({ params }: Route.LoaderArgs) {
  const recipe = getSeedRecipeById(params.recipeId);

  if (!recipe) {
    throw new Response("Recipe not found", { status: 404 });
  }

  return { recipe };
}

export default function EditRecipe({ loaderData }: Route.ComponentProps) {
  const [validatedDraft, setValidatedDraft] = useState<RecipeDraft | null>(null);

  return (
    <div className="recipe-editor-route">
      <RecipeEditorForm
        mode="edit"
        recipe={validatedDraft ?? loaderData.recipe}
        cancelHref={getRecipeDetailPath(loaderData.recipe)}
        onSaveDraft={setValidatedDraft}
      />
    </div>
  );
}
