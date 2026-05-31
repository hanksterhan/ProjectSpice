import { Form, useNavigation } from "react-router";

import type { Recipe, RecipeDraft } from "~/modules/recipe-domain";
import { Button } from "~/modules/ui-shell/primitives";

import { AiDraftPreview } from "./AiDraftPreview";
import type { AiChatMessage } from "./ai-chat";
import { serializeAiChatHistory } from "./ai-chat";
import { serializeAiDraft } from "./ai-draft";

export type RecipeAiPanelActionData =
  | {
      intent: "transform";
      draftRecipe?: RecipeDraft;
      changeSummary?: string[];
      chatHistory?: AiChatMessage[];
      errors?: string[];
    }
  | {
      intent: "save-update" | "save-copy" | "delete";
      draftRecipe?: RecipeDraft;
      changeSummary?: string[];
      chatHistory?: AiChatMessage[];
      errors?: string[];
    };

type RecipeAiPanelProps = {
  actionData?: RecipeAiPanelActionData;
  onClose?: () => void;
  recipe: Recipe;
};

export function RecipeAiPanel({ actionData, onClose, recipe }: RecipeAiPanelProps) {
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
  const chatHistory =
    actionData?.intent === "transform" ||
    actionData?.intent === "save-update" ||
    actionData?.intent === "save-copy"
      ? actionData.chatHistory ?? []
      : [];
  const hasDraft = Boolean(draftRecipe);

  return (
    <aside
      className="recipe-ai-panel"
      id="recipe-ai-assistant"
      aria-labelledby="ai-heading"
    >
      <div className="recipe-ai-panel-header">
        <div>
          <p className="eyebrow">Assistant</p>
          <h2 id="ai-heading">Recipe Chat</h2>
        </div>
        <div className="recipe-ai-panel-tools">
          <span>v{recipe.version}</span>
          {onClose ? (
            <button
              className="icon-button"
              type="button"
              title="Close assistant"
              aria-label="Close assistant"
              onClick={onClose}
            >
              <CloseIcon />
              <span className="sr-only">Close assistant</span>
            </button>
          ) : null}
        </div>
      </div>

      <Form className="recipe-ai-transform-form" method="post">
        <input name="intent" type="hidden" value="transform" />
        {draftRecipe ? (
          <>
            <input
              name="currentDraftJson"
              type="hidden"
              value={serializeAiDraft(draftRecipe)}
            />
            <input
              name="chatHistoryJson"
              type="hidden"
              value={serializeAiChatHistory(chatHistory)}
            />
          </>
        ) : null}
        {chatHistory.length ? <AiChatHistory history={chatHistory} /> : null}
        <label className="field">
          <span>{hasDraft ? "Message" : "Transform request"}</span>
          <textarea
            name="prompt"
            placeholder={
              hasDraft
                ? "Keep the new ingredients, but make step 3 more specific"
                : "Make this lighter, add make-ahead notes, or scale it for 8"
            }
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
          {isTransforming
            ? hasDraft
              ? "Updating"
              : "Transforming"
            : hasDraft
              ? "Update Draft"
              : "Transform Recipe"}
        </Button>
      </Form>

      {draftRecipe ? (
        <div className="recipe-ai-review">
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
            <Button type="button" variant="quiet" onClick={onClose}>
              Close
            </Button>
          </div>
          <AiDraftPreview recipe={draftRecipe} changeSummary={changeSummary} />
        </div>
      ) : (
        <section className="recipe-ai-empty" aria-label="No AI draft">
          <h3>No Draft</h3>
          <p>Transform this recipe, then review the draft before saving it.</p>
        </section>
      )}
    </aside>
  );
}

function CloseIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24" focusable="false">
      <path d="M18 6 6 18" />
      <path d="m6 6 12 12" />
    </svg>
  );
}

function AiChatHistory({ history }: { history: AiChatMessage[] }) {
  return (
    <ol className="ai-chat-history compact" aria-label="AI conversation">
      {history.map((message, index) => (
        <li className={`ai-chat-message ${message.role}`} key={`${message.role}-${index}`}>
          <span>{message.role === "user" ? "You" : "AI"}</span>
          <p>{message.content}</p>
        </li>
      ))}
    </ol>
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
