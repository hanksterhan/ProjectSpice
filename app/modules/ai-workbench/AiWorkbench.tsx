import { Form, Link, useNavigation } from "react-router";

import type { RecipeDraft } from "~/modules/recipe-domain";
import { Button } from "~/modules/ui-shell/primitives";

import { AiDraftPreview } from "./AiDraftPreview";
import { serializeAiDraft } from "./ai-draft";

export type AiWorkbenchActionData =
  | {
      intent: "generate";
      draftRecipe?: RecipeDraft;
      changeSummary?: string[];
      errors?: string[];
    }
  | {
      intent: "save";
      errors?: string[];
    };

type AiWorkbenchProps = {
  actionData?: AiWorkbenchActionData;
};

export function AiWorkbench({ actionData }: AiWorkbenchProps) {
  const navigation = useNavigation();
  const isGenerating =
    navigation.state !== "idle" &&
    navigation.formData?.get("intent") === "generate";
  const isSaving =
    navigation.state !== "idle" && navigation.formData?.get("intent") === "save";
  const draftRecipe =
    actionData?.intent === "generate" ? actionData.draftRecipe : undefined;
  const changeSummary =
    actionData?.intent === "generate" ? actionData.changeSummary ?? [] : [];

  return (
    <div className="ai-workbench-page">
      <section className="ai-workbench-toolbar">
        <div>
          <p className="eyebrow">AI Workbench</p>
          <h1>Generate Recipe</h1>
          <p className="page-summary">Start with an idea, then review the draft.</p>
        </div>
      </section>

      <div className="ai-workbench-layout">
        <Form className="ai-prompt-panel" method="post">
          <input name="intent" type="hidden" value="generate" />
          <label className="field">
            <span>Prompt</span>
            <textarea
              name="prompt"
              placeholder="Chilled lemon dessert for a summer dinner"
              required
              rows={8}
            />
          </label>
          <label className="field">
            <span>Preferences</span>
            <input
              name="preferences"
              placeholder="vegetarian, no peanuts, serves 6"
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
          <Button type="submit" variant="primary" disabled={isGenerating}>
            {isGenerating ? "Generating" : "Generate Draft"}
          </Button>
        </Form>

        <div className="ai-review-panel">
          {draftRecipe ? (
            <>
              <AiDraftPreview recipe={draftRecipe} changeSummary={changeSummary} />
              <div className="ai-review-actions">
                <Form method="post">
                  <input name="intent" type="hidden" value="save" />
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
                  <Button type="submit" variant="primary" disabled={isSaving}>
                    {isSaving ? "Saving" : "Save to Library"}
                  </Button>
                </Form>
                <Link className="button button-secondary" to="/ai">
                  Discard
                </Link>
              </div>
            </>
          ) : (
            <section className="ai-draft-empty" aria-labelledby="ai-draft-empty-heading">
              <h2 id="ai-draft-empty-heading">No Draft</h2>
              <p>Drafts appear here before they enter the library.</p>
            </section>
          )}
        </div>
      </div>
    </div>
  );
}
