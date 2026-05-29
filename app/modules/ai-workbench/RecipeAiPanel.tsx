import { Form, useNavigation } from "react-router";

import type { Recipe, RecipeDraft } from "~/modules/recipe-domain";
import { Button } from "~/modules/ui-shell/primitives";

import { AiDraftPreview } from "./AiDraftPreview";
import { serializeAiDraft } from "./ai-draft";

export type RecipeAiPanelActionData =
  | {
      intent: "transform";
      draftRecipe?: RecipeDraft;
      changeSummary?: string[];
      errors?: string[];
    }
  | {
      intent: "save-update" | "save-copy" | "delete";
      draftRecipe?: RecipeDraft;
      changeSummary?: string[];
      errors?: string[];
    };

type RecipeAiPanelProps = {
  actionData?: RecipeAiPanelActionData;
  recipe: Recipe;
};

export function RecipeAiPanel({ actionData, recipe }: RecipeAiPanelProps) {
  const navigation = useNavigation();
  const activeIntent = navigation.formData?.get("intent");
  const isTransforming =
    navigation.state !== "idle" && activeIntent === "transform";
  const isSavingUpdate =
    navigation.state !== "idle" && activeIntent === "save-update";
  const isSavingCopy =
    navigation.state !== "idle" && activeIntent === "save-copy";
  const draftRecipe =
    actionData?.intent === "transform" ||
    actionData?.intent === "save-update" ||
    actionData?.intent === "save-copy"
      ? actionData.draftRecipe
      : undefined;
  const changeSummary =
    actionData?.intent === "transform" ||
    actionData?.intent === "save-update" ||
    actionData?.intent === "save-copy"
      ? actionData.changeSummary ?? []
      : [];

  return (
    <section className="recipe-ai-panel" aria-labelledby="ai-heading">
      <div className="recipe-ai-panel-header">
        <div>
          <p className="eyebrow">Workbench</p>
          <h2 id="ai-heading">AI</h2>
        </div>
        <span>v{recipe.version}</span>
      </div>

      <Form className="recipe-ai-transform-form" method="post">
        <input name="intent" type="hidden" value="transform" />
        <label className="field">
          <span>Transform request</span>
          <textarea
            name="prompt"
            placeholder="Make this lighter, add make-ahead notes, or scale it for 8"
            required
            rows={4}
          />
        </label>
        <label className="field">
          <span>Preferences</span>
          <input
            name="preferences"
            placeholder="less sugar, gluten-free, weeknight-friendly"
            type="text"
          />
        </label>
        {actionData?.errors?.length ? (
          <div className="form-status error" role="alert">
            <ul>
              {actionData.errors.map((error) => (
                <li key={error}>{error}</li>
              ))}
            </ul>
          </div>
        ) : null}
        <Button type="submit" variant="primary" disabled={isTransforming}>
          {isTransforming ? "Transforming" : "Transform Recipe"}
        </Button>
      </Form>

      {draftRecipe ? (
        <div className="recipe-ai-review">
          <AiDraftPreview recipe={draftRecipe} changeSummary={changeSummary} />
          <div className="ai-review-actions">
            <Form method="post">
              <input name="intent" type="hidden" value="save-update" />
              <DraftHiddenFields
                draftRecipe={draftRecipe}
                changeSummary={changeSummary}
              />
              <Button type="submit" variant="primary" disabled={isSavingUpdate}>
                {isSavingUpdate ? "Saving" : "Save Update"}
              </Button>
            </Form>
            <Form method="post">
              <input name="intent" type="hidden" value="save-copy" />
              <DraftHiddenFields
                draftRecipe={draftRecipe}
                changeSummary={changeSummary}
              />
              <Button type="submit" variant="secondary" disabled={isSavingCopy}>
                {isSavingCopy ? "Saving" : "Save Copy"}
              </Button>
            </Form>
            <a className="button button-quiet" href="#ai-heading">
              Discard
            </a>
          </div>
        </div>
      ) : (
        <section className="recipe-ai-empty" aria-label="No AI draft">
          <h3>No Draft</h3>
          <p>Transform this recipe, then review the draft before saving it.</p>
        </section>
      )}
    </section>
  );
}

function DraftHiddenFields({
  draftRecipe,
  changeSummary,
}: {
  draftRecipe: RecipeDraft;
  changeSummary: string[];
}) {
  return (
    <>
      <input
        name="draftRecipeJson"
        type="hidden"
        value={serializeAiDraft(draftRecipe)}
      />
      <input
        name="changeSummaryJson"
        type="hidden"
        value={JSON.stringify(changeSummary)}
      />
    </>
  );
}
