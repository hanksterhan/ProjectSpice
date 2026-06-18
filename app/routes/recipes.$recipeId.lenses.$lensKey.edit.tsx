import { redirect } from "react-router";

import type { Route } from "./+types/recipes.$recipeId.lenses.$lensKey.edit";
import {
  getRecipeEditorBaseDraft,
  RecipeEditorForm,
} from "~/modules/recipe-editor";
import {
  getRecipeLensDefinition,
  getRecipeLensDetailPath,
  recipeLensKeySchema,
} from "~/modules/recipe-lenses";
import { useShellCommand } from "~/modules/ui-shell/AppShell";
import { requireAuthenticatedUser } from "~/server/auth";
import { getRecipeLensService } from "~/server/recipe-lenses";
import { buildRecipeDraftFromEditorFormData } from "~/server/recipes/recipe.form";
import { getRecipeService } from "~/server/recipes/recipe.runtime";

export function meta({ data }: Route.MetaArgs) {
  return [
    {
      title: `${data?.lensDefinition.label ?? "Recipe Lens"} | ${data?.recipe.title ?? "ProjectSpice"}`,
    },
  ];
}

export async function loader({ params, request, context }: Route.LoaderArgs) {
  await requireAuthenticatedUser({ request, context, params });

  const lensKey = parseLensKey(params.lensKey);
  const recipe = await getRecipeService(context).getById(params.recipeId);

  if (!recipe) {
    throw new Response("Recipe not found", { status: 404 });
  }

  const lensDefinition = getRecipeLensDefinition(lensKey);

  if (!lensDefinition) {
    throw new Response("Recipe lens not found", { status: 404 });
  }

  const lens = await getRecipeLensService(context).getByRecipeIdAndKey(
    recipe.id,
    lensKey,
  );

  return {
    recipe,
    lens,
    lensDefinition,
    lensKey,
    editDraft: lens?.recipeDraft ?? getRecipeEditorBaseDraft(recipe),
  };
}

export async function action({
  params,
  request,
  context,
}: Route.ActionArgs): Promise<Response | { errors: string[] }> {
  await requireAuthenticatedUser({ request, context, params });

  const lensKey = parseLensKey(params.lensKey);
  const recipe = await getRecipeService(context).getById(params.recipeId);

  if (!recipe) {
    throw new Response("Recipe not found", { status: 404 });
  }

  const formData = await request.formData();
  const lensService = getRecipeLensService(context);

  const notes = getFormString(formData, "lensNotes").trim();

  if (!notes) {
    return { errors: ["Add concise lens notes before saving."] };
  }

  const result = buildRecipeDraftFromEditorFormData({
    formData,
    baseDraft: getRecipeEditorBaseDraft(recipe),
  });

  if (!result.ok) {
    return { errors: result.errors };
  }

  await lensService.upsert(
    {
      recipeId: recipe.id,
      lensKey,
      notes,
      recipeDraft: result.draft,
    },
    new Date().toISOString(),
  );

  return redirect(getRecipeLensDetailPath(recipe, lensKey));
}

export default function EditRecipeLens({
  loaderData,
  actionData,
}: Route.ComponentProps) {
  const { recipe, lens, lensDefinition, lensKey, editDraft } = loaderData;
  const detailHref = getRecipeLensDetailPath(recipe, lensKey);

  useShellCommand({
    backHref: detailHref,
    backLabel: "Back to recipe",
    title: `${lensDefinition.label} lens`,
  });

  return (
    <div className="recipe-editor-route">
      <section className="recipe-lens-editor-panel" aria-labelledby="recipe-lens-editor-heading">
        <div className="recipe-lens-editor-intro">
          <div>
            <span>Recipe lens</span>
            <h1 id="recipe-lens-editor-heading">{lensDefinition.label}</h1>
            <p>{lensDefinition.description}</p>
          </div>
        </div>

        <div className="recipe-lens-notes-editor">
          <label className="field field-wide">
            <span>Lens Notes</span>
            <textarea
              name="lensNotes"
              form="recipe-lens-editor-form"
              defaultValue={lens?.notes ?? ""}
              placeholder="Summarize what changed and why it improves this lens."
              rows={4}
            />
          </label>
        </div>
      </section>

      <RecipeEditorForm
        mode="edit"
        recipe={editDraft}
        cancelHref={detailHref}
        errors={actionData?.errors}
        formId="recipe-lens-editor-form"
        submitLabel="Save Lens"
      />

    </div>
  );
}

function parseLensKey(value: string | undefined) {
  const parsed = recipeLensKeySchema.safeParse(value);

  if (!parsed.success) {
    throw new Response("Recipe lens not found", { status: 404 });
  }

  return parsed.data;
}

function getFormString(formData: FormData, name: string): string {
  const value = formData.get(name);

  return typeof value === "string" ? value : "";
}
