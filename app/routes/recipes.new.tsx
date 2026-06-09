import { Link, redirect } from "react-router";
import { z } from "zod";

import type { Route } from "./+types/recipes.new";
import { createEmptyRecipeDraft } from "~/modules/recipe-domain";
import {
  AiChatIntake,
  appendAiChatTurn,
  type AiChatIntakeActionData,
  buildRecipeFromAiDraft,
  parseAiChatHistoryJson,
  parseAiDraftJson,
  parseProjectSpiceRecipeIntakeJson,
  RecipeIntake,
  type RecipeIntakeActionData,
} from "~/modules/ai-workbench";
import { RecipeEditorForm } from "~/modules/recipe-editor";
import { RecipeUrlIntake, type RecipeUrlIntakeActionData } from "~/modules/recipe-scraper";
import { useShellCommand } from "~/modules/ui-shell/AppShell";
import {
  RecipeAiRateLimitError,
  formatOpenAiRecipeAiProviderError,
  getRecipeAiProviderOverride,
  getRecipeAiService,
} from "~/server/ai";
import { buildRecipeFromEditorFormData } from "~/server/recipes/recipe.form";
import { getRecipeService } from "~/server/recipes/recipe.runtime";
import { scrapeRecipeFromUrl } from "~/server/recipe-scraper";

type NewRecipeMode = "intake" | "chat" | "url" | "manual";

const newRecipeModeDetails: Record<
  NewRecipeMode,
  { label: string; summary: string; to: string }
> = {
  intake: {
    label: "AI JSON",
    summary:
      "Copy the system prompt into ChatGPT or Claude, paste the returned JSON, then preview before saving.",
    to: "/recipes/new",
  },
  chat: {
    label: "AI Chat",
    summary: "Describe the recipe you want, then tune the generated draft before saving.",
    to: "/recipes/new?mode=chat",
  },
  url: {
    label: "Import URL",
    summary: "Paste a public recipe URL, preview the imported draft, then adjust before saving.",
    to: "/recipes/new?mode=url",
  },
  manual: {
    label: "Manual Entry",
    summary: "Start from a blank form and enter the recipe details yourself.",
    to: "/recipes/new?mode=manual",
  },
};

const generateFormSchema = z.object({
  prompt: z.string().trim().min(1, "Add a prompt before generating."),
  preferences: z.string().optional(),
  currentDraftJson: z.string().optional(),
  chatHistoryJson: z.string().optional(),
});

const saveAiDraftFormSchema = z.object({
  draftRecipeJson: z.string().trim().min(1, "Missing AI draft."),
  changeSummaryJson: z.string().optional(),
});

export function meta(_args: Route.MetaArgs) {
  return [{ title: "New Recipe | ProjectSpice" }];
}

export function loader({ request }: Route.LoaderArgs) {
  const mode = new URL(request.url).searchParams.get("mode");
  const normalizedMode: NewRecipeMode =
    mode === "chat" || mode === "manual" || mode === "url" ? mode : "intake";

  return {
    mode: normalizedMode,
    recipe: createEmptyRecipeDraft(),
  };
}

export async function action({
  request,
  context,
}: Route.ActionArgs): Promise<
  | Response
  | AiChatIntakeActionData
  | RecipeIntakeActionData
  | RecipeUrlIntakeActionData
  | { errors: string[] }
> {
  const formData = await request.formData();
  const intent = formData.get("intent");

  if (intent === "generate") {
    const parsed = generateFormSchema.safeParse({
      prompt: formData.get("prompt"),
      preferences: formData.get("preferences"),
      currentDraftJson: optionalFormString(formData.get("currentDraftJson")),
      chatHistoryJson: optionalFormString(formData.get("chatHistoryJson")),
    });

    if (!parsed.success) {
      return {
        intent: "generate",
        errors: parsed.error.issues.map((issue) => issue.message),
      };
    }

    try {
      const currentDraft = parsed.data.currentDraftJson
        ? parseAiDraftJson(parsed.data.currentDraftJson)
        : undefined;
      const chatHistory = parseAiChatHistoryJson(parsed.data.chatHistoryJson);
      const result = await getRecipeAiService(
        context,
        getRecipeAiProviderOverride(request, context),
      ).generateRecipeDraft(
        {
          prompt: parsed.data.prompt,
          preferences: parsePreferences(parsed.data.preferences),
          currentDraft,
          conversation: chatHistory,
        },
        {
          rateLimitKey: getRateLimitKey(request),
        },
      );

      return {
        intent: "generate",
        draftRecipe: result.draftRecipe,
        changeSummary: result.changeSummary,
        chatHistory: appendAiChatTurn({
          history: chatHistory,
          prompt: parsed.data.prompt,
          changeSummary: result.changeSummary,
        }),
      };
    } catch (error) {
      return {
        intent: "generate",
        errors: [getAiErrorMessage(error)],
      };
    }
  }

  if (intent === "save") {
    const parsed = saveAiDraftFormSchema.safeParse({
      draftRecipeJson: formData.get("draftRecipeJson"),
      changeSummaryJson: formData.get("changeSummaryJson"),
    });

    if (!parsed.success) {
      return {
        intent: "save",
        errors: parsed.error.issues.map((issue) => issue.message),
      };
    }

    try {
      const draftRecipe = parseAiDraftJson(parsed.data.draftRecipeJson);
      const recipe = await getRecipeService(context).create(
        buildRecipeFromAiDraft({
          draftRecipe,
          now: new Date().toISOString(),
        }),
      );

      return redirect(`/recipes/${encodeURIComponent(recipe.id)}`);
    } catch (error) {
      return {
        intent: "save",
        errors: [getSaveErrorMessage(error)],
      };
    }
  }

  if (intent === "preview-url") {
    const recipeUrl = getFormString(formData, "recipeUrl");

    try {
      const scraped = await scrapeRecipeFromUrl(recipeUrl);

      return {
        intent: "preview-url",
        recipeUrl,
        draftRecipe: scraped.draftRecipe,
        warnings: scraped.warnings,
      } satisfies RecipeUrlIntakeActionData;
    } catch (error) {
      return {
        intent: "preview-url",
        recipeUrl,
        errors: [error instanceof Error ? error.message : "Could not import recipe."],
      } satisfies RecipeUrlIntakeActionData;
    }
  }

  if (intent === "preview-intake") {
    const rawRecipeJson = getFormString(formData, "recipeJson");
    const parsed = parseProjectSpiceRecipeIntakeJson(rawRecipeJson);

    if (!parsed.ok) {
      return {
        intent: "preview-intake",
        rawRecipeJson,
        errors: parsed.errors,
      };
    }

    return {
      intent: "preview-intake",
      draftRecipe: parsed.draftRecipe,
      changeSummary: parsed.changeSummary,
      rawRecipeJson,
    };
  }

  if (intent === "save-intake") {
    const rawRecipeJson = getFormString(formData, "recipeJson");
    const changeSummary = parseChangeSummaryJson(
      getFormString(formData, "changeSummaryJson"),
    );

    try {
      const draftRecipe = parseAiDraftJson(getFormString(formData, "draftRecipeJson"));
      const recipe = await getRecipeService(context).create(
        buildRecipeFromAiDraft({
          draftRecipe,
          now: new Date().toISOString(),
        }),
      );

      return redirect(`/recipes/${encodeURIComponent(recipe.id)}`);
    } catch (error) {
      return {
        intent: "save-intake",
        rawRecipeJson,
        changeSummary,
        errors: [error instanceof Error ? error.message : "Could not save recipe draft."],
      };
    }
  }

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
    title: "New Recipe",
  });

  const content =
    loaderData.mode === "manual" ? (
      <div className="recipe-editor-route">
        <RecipeEditorForm
          mode="new"
          recipe={loaderData.recipe}
          cancelHref="/"
          errors={actionData?.errors}
          chrome="minimal"
        />
      </div>
    ) : loaderData.mode === "url" ? (
      <RecipeUrlIntake
        actionData={actionData as RecipeUrlIntakeActionData | undefined}
      />
    ) : loaderData.mode === "chat" ? (
      <AiChatIntake actionData={actionData as AiChatIntakeActionData | undefined} />
    ) : (
      <RecipeIntake actionData={actionData as RecipeIntakeActionData | undefined} />
    );

  return (
    <div className="new-recipe-route">
      <NewRecipeModeHeader mode={loaderData.mode} />
      {content}
    </div>
  );
}

function NewRecipeModeHeader({ mode }: { mode: NewRecipeMode }) {
  const activeMode = newRecipeModeDetails[mode];

  return (
    <header className={`editor-header intake-mode-header intake-mode-header-${mode}`}>
      <div className="intake-mode-copy">
        <h1>{activeMode.label}</h1>
        <p>{activeMode.summary}</p>
      </div>
      <div className="intake-mode-picker">
        <span className="intake-mode-label">Intake mode</span>
        <nav className="intake-mode-toggle" aria-label="Recipe intake mode">
          {(["intake", "chat", "url", "manual"] as const).map((intakeMode) => {
            const modeDetails = newRecipeModeDetails[intakeMode];

            return (
              <Link
                className={
                  mode === intakeMode
                    ? "intake-mode-option active"
                    : "intake-mode-option"
                }
                key={intakeMode}
                to={modeDetails.to}
                aria-current={mode === intakeMode ? "page" : undefined}
              >
                {modeDetails.label}
              </Link>
            );
          })}
        </nav>
      </div>
    </header>
  );
}

function parsePreferences(value: string | undefined): string[] | undefined {
  const preferences = value
    ?.split(",")
    .map((preference) => preference.trim())
    .filter(Boolean);

  return preferences?.length ? preferences : undefined;
}

function optionalFormString(value: FormDataEntryValue | null): string | undefined {
  return typeof value === "string" && value.trim() ? value : undefined;
}

function getRateLimitKey(request: Request): string {
  return request.headers.get("CF-Connecting-IP") ?? "single-user";
}

function getAiErrorMessage(error: unknown): string {
  if (error instanceof RecipeAiRateLimitError) {
    return "AI rate limit exceeded. Try again later.";
  }

  return (
    formatOpenAiRecipeAiProviderError(error) ??
    (error instanceof Error ? error.message : "AI draft generation failed.")
  );
}

function getSaveErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "Could not save AI draft.";
}

function getFormString(formData: FormData, name: string): string {
  const value = formData.get(name);

  return typeof value === "string" ? value : "";
}

function parseChangeSummaryJson(value: string): string[] {
  try {
    const parsed = JSON.parse(value);

    if (!Array.isArray(parsed)) {
      return [];
    }

    return parsed.filter((entry): entry is string => typeof entry === "string");
  } catch {
    return [];
  }
}
