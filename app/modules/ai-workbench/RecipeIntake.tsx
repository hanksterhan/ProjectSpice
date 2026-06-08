import { useEffect, useRef, useState } from "react";
import { Form, Link, useNavigation } from "react-router";

import type { RecipeDraft } from "~/modules/recipe-domain";
import { Button } from "~/modules/ui-shell/primitives";

import { AiDraftPreview } from "./AiDraftPreview";
import { serializeAiDraft } from "./ai-draft";
import { projectSpiceRecipeSystemPrompt } from "./project-spice-recipe-intake";

export type RecipeIntakeActionData =
  | {
      intent: "preview-intake";
      draftRecipe?: RecipeDraft;
      changeSummary?: string[];
      rawRecipeJson?: string;
      errors?: string[];
    }
  | {
      intent: "save-intake";
      draftRecipe?: RecipeDraft;
      changeSummary?: string[];
      rawRecipeJson?: string;
      errors?: string[];
    };

type RecipeIntakeProps = {
  actionData?: RecipeIntakeActionData;
};

export function RecipeIntake({ actionData }: RecipeIntakeProps) {
  const promptTextAreaRef = useRef<HTMLTextAreaElement>(null);
  const previewPanelRef = useRef<HTMLElement>(null);
  const [copyStatus, setCopyStatus] = useState<"idle" | "copied" | "failed">(
    "idle",
  );
  const navigation = useNavigation();
  const isPreviewing =
    navigation.state !== "idle" &&
    navigation.formData?.get("intent") === "preview-intake";
  const isSaving =
    navigation.state !== "idle" &&
    navigation.formData?.get("intent") === "save-intake";
  const draftRecipe = actionData?.draftRecipe;
  const changeSummary = actionData?.changeSummary ?? [];

  useEffect(() => {
    if (!draftRecipe) {
      return;
    }

    previewPanelRef.current?.scrollIntoView({
      behavior: "smooth",
      block: "start",
    });
  }, [draftRecipe]);

  return (
    <div className="recipe-intake-page">
      <header className="editor-header">
        <div>
          <h1>Recipe Intake</h1>
          <p>
            Give this prompt to ChatGPT or Claude, paste the JSON here, then
            review the Project Spice draft before saving it.
          </p>
        </div>
        <div className="editor-actions">
          <Link className="button button-secondary" to="/recipes/new?mode=manual">
            Manual Entry
          </Link>
          <Link className="button button-secondary" to="/">
            Cancel
          </Link>
        </div>
      </header>

      <div className="recipe-intake-layout">
        <section className="intake-prompt-panel" aria-labelledby="prompt-heading">
          <div className="intake-panel-header">
            <div>
              <h2 id="prompt-heading">System Prompt</h2>
              <span
                className={`copy-status ${copyStatus}`}
                aria-live="polite"
                role="status"
              >
                {copyStatus === "copied"
                  ? "Copied"
                  : copyStatus === "failed"
                    ? "Copy failed"
                    : ""}
              </span>
            </div>
            <button
              className="icon-button"
              type="button"
              title="Copy system prompt"
              aria-label="Copy system prompt"
              onClick={async () => {
                const copied = await copyPromptToClipboard(
                  projectSpiceRecipeSystemPrompt,
                  promptTextAreaRef.current,
                );

                setCopyStatus(copied ? "copied" : "failed");
                window.setTimeout(() => setCopyStatus("idle"), 1800);
              }}
            >
              <CopyIcon />
              <span className="sr-only">Copy system prompt</span>
            </button>
          </div>
          <label className="field">
            <span>Copy into ChatGPT or Claude</span>
            <textarea
              ref={promptTextAreaRef}
              readOnly
              rows={18}
              value={projectSpiceRecipeSystemPrompt}
            />
          </label>
        </section>

        <section className="intake-json-panel" aria-labelledby="json-heading">
          <div>
            <h2 id="json-heading">Paste Recipe JSON</h2>
          </div>

          <Form className="intake-json-form" method="post">
            <input name="intent" type="hidden" value="preview-intake" />
            <label className="field">
              <span>Chat output</span>
              <textarea
                name="recipeJson"
                placeholder='{"draftRecipe":{"title":"..."}, "changeSummary":["..."]}'
                required
                rows={14}
                defaultValue={actionData?.rawRecipeJson}
              />
            </label>
            {actionData?.errors?.length ? (
              <div className="form-status error" role="alert">
                <p>Review the pasted JSON.</p>
                <ul>
                  {actionData.errors.map((error) => (
                    <li key={error}>{error}</li>
                  ))}
                </ul>
              </div>
            ) : null}
            <Button type="submit" variant="primary" disabled={isPreviewing}>
              {isPreviewing ? "Validating" : "Preview Recipe"}
            </Button>
          </Form>
        </section>
      </div>

      <section
        className="intake-preview-panel"
        ref={previewPanelRef}
        aria-labelledby="intake-preview-heading"
      >
        <div className="intake-preview-header">
          <div>
            <h2 id="intake-preview-heading">Recipe Preview</h2>
          </div>
          {draftRecipe ? (
            <Form method="post">
              <input name="intent" type="hidden" value="save-intake" />
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
              <input
                name="recipeJson"
                type="hidden"
                value={actionData?.rawRecipeJson ?? ""}
              />
              <Button type="submit" variant="primary" disabled={isSaving}>
                {isSaving ? "Saving" : "Save to Library"}
              </Button>
            </Form>
          ) : null}
        </div>

        {draftRecipe ? (
          <AiDraftPreview recipe={draftRecipe} changeSummary={changeSummary} />
        ) : (
          <div className="ai-draft-empty">
            <h3>No preview yet</h3>
            <p>A validated recipe draft appears here before it enters the database.</p>
          </div>
        )}
      </section>
    </div>
  );
}

async function copyPromptToClipboard(
  prompt: string,
  textArea: HTMLTextAreaElement | null,
): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(prompt);

    return true;
  } catch {
    if (!textArea) {
      return false;
    }

    textArea.focus();
    textArea.select();

    return document.execCommand("copy");
  }
}

function CopyIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24" focusable="false">
      <rect x="9" y="9" width="13" height="13" rx="2" />
      <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
    </svg>
  );
}
