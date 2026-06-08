import { Form, Link, useNavigation } from "react-router";

import type { RecipeDraft } from "~/modules/recipe-domain";
import { Button } from "~/modules/ui-shell/primitives";

import { AiDraftPreview } from "./AiDraftPreview";
import type { AiChatMessage } from "./ai-chat";
import { serializeAiChatHistory } from "./ai-chat";
import { serializeAiDraft } from "./ai-draft";

export type AiWorkbenchActionData =
  | {
      intent: "generate";
      draftRecipe?: RecipeDraft;
      changeSummary?: string[];
      chatHistory?: AiChatMessage[];
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
  const chatHistory =
    actionData?.intent === "generate" ? actionData.chatHistory ?? [] : [];
  const hasDraft = Boolean(draftRecipe);

  return (
    <div className="ai-workbench-page">
      <section className="ai-workbench-toolbar">
        <div>
          <h1>Recipe Chat</h1>
          <p className="page-summary">
            Start with an idea, then keep tuning the draft before it enters the
            library.
          </p>
        </div>
      </section>

      <div className="ai-workbench-layout">
        <Form className="ai-prompt-panel" method="post">
          <input name="intent" type="hidden" value="generate" />
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
            <span>{hasDraft ? "Message" : "Prompt"}</span>
            <textarea
              name="prompt"
              placeholder={
                hasDraft
                  ? "Make the filling less sweet and add a make-ahead note"
                  : "Chilled lemon dessert for a summer dinner"
              }
              required
              rows={hasDraft ? 4 : 8}
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
            {isGenerating
              ? hasDraft
                ? "Updating"
                : "Generating"
              : hasDraft
                ? "Update Draft"
                : "Generate Draft"}
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

function AiChatHistory({ history }: { history: AiChatMessage[] }) {
  return (
    <ol className="ai-chat-history" aria-label="AI conversation">
      {history.map((message, index) => (
        <li className={`ai-chat-message ${message.role}`} key={`${message.role}-${index}`}>
          <span>{message.role === "user" ? "You" : "AI"}</span>
          <p>{message.content}</p>
        </li>
      ))}
    </ol>
  );
}
