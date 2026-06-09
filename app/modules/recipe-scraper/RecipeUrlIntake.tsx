import { Form, Link, useNavigation } from "react-router";

import type { RecipeDraft } from "~/modules/recipe-domain";
import { RecipeEditorForm } from "~/modules/recipe-editor";
import { Button } from "~/modules/ui-shell/primitives";

export type RecipeUrlIntakeActionData =
  | {
      intent: "preview-url";
      recipeUrl?: string;
      draftRecipe?: RecipeDraft;
      warnings?: string[];
      errors?: string[];
    }
  | {
      intent: "save-url";
      recipeUrl?: string;
      warnings?: string[];
      errors?: string[];
    };

type RecipeUrlIntakeProps = {
  actionData?: RecipeUrlIntakeActionData;
};

export function RecipeUrlIntake({ actionData }: RecipeUrlIntakeProps) {
  const navigation = useNavigation();
  const isPreviewing =
    navigation.state !== "idle" &&
    navigation.formData?.get("intent") === "preview-url";
  const draftRecipe =
    actionData?.intent === "preview-url" ? actionData.draftRecipe : undefined;
  const warnings = actionData?.warnings ?? [];

  if (draftRecipe) {
    return (
      <div className="recipe-url-intake-page imported">
        <section className="recipe-import-summary" aria-label="Imported recipe source">
          <div>
            <span>Imported from</span>
            {draftRecipe.source?.url ? (
              <a href={draftRecipe.source.url} rel="noreferrer" target="_blank">
                {draftRecipe.source.name ?? draftRecipe.source.url}
              </a>
            ) : (
              <strong>{draftRecipe.source?.name ?? "Recipe URL"}</strong>
            )}
          </div>
          <div className="editor-actions">
            <Link className="button button-secondary" to="/recipes/new?mode=url">
              Import another
            </Link>
          </div>
        </section>

        {warnings.length > 0 ? (
          <div className="form-status warning" role="status">
            <p>Review the imported draft.</p>
            <ul>
              {warnings.map((warning) => (
                <li key={warning}>{warning}</li>
              ))}
            </ul>
          </div>
        ) : null}

        <RecipeEditorForm
          mode="new"
          recipe={draftRecipe}
          cancelHref="/recipes/new?mode=url"
          errors={undefined}
          chrome="minimal"
        />
      </div>
    );
  }

  return (
    <div className="recipe-url-intake-page">
      <section className="editor-section" aria-labelledby="url-import-heading">
        <div>
          <h2 id="url-import-heading">Recipe URL</h2>
          <p className="intake-panel-note">
            Paste a public recipe URL, preview the imported draft, then adjust
            anything before saving it.
          </p>
        </div>
        <Form className="recipe-url-form" method="post">
          <input name="intent" type="hidden" value="preview-url" />
          <label className="field field-wide">
            <span>Public recipe page</span>
            <input
              name="recipeUrl"
              required
              type="url"
              placeholder="https://..."
              defaultValue={actionData?.recipeUrl}
            />
          </label>
          {actionData?.errors?.length ? (
            <div className="form-status error" role="alert">
              <p>Review the import issue.</p>
              <ul>
                {actionData.errors.map((error) => (
                  <li key={error}>{error}</li>
                ))}
              </ul>
            </div>
          ) : null}
          <Button type="submit" variant="primary" disabled={isPreviewing}>
            {isPreviewing ? "Importing" : "Preview Import"}
          </Button>
        </Form>
      </section>

    </div>
  );
}
