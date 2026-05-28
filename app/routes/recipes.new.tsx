import { useState } from "react";

import type { Route } from "./+types/recipes.new";
import { createEmptyRecipeDraft, type RecipeDraft } from "~/modules/recipe-domain";
import { RecipeEditorForm } from "~/modules/recipe-editor";

export function meta(_args: Route.MetaArgs) {
  return [{ title: "New Recipe | ProjectSpice" }];
}

export function loader(_args: Route.LoaderArgs) {
  return {
    recipe: createEmptyRecipeDraft(),
  };
}

export default function NewRecipe({ loaderData }: Route.ComponentProps) {
  const [validatedDraft, setValidatedDraft] = useState<RecipeDraft | null>(null);

  return (
    <div className="recipe-editor-route">
      <RecipeEditorForm
        mode="new"
        recipe={validatedDraft ?? loaderData.recipe}
        cancelHref="/"
        onSaveDraft={setValidatedDraft}
      />
    </div>
  );
}
