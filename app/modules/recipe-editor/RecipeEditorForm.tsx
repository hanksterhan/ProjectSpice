import { zodResolver } from "@hookform/resolvers/zod";
import { useMemo, useState } from "react";
import { Link } from "react-router";
import { useForm, type FieldErrors, type UseFormRegister } from "react-hook-form";

import type { Recipe, RecipeDraft } from "~/modules/recipe-domain";
import { Button } from "~/modules/ui-shell/primitives";

import {
  recipeEditorFormSchema,
  validateRecipeEditorDraft,
  type ParsedRecipeEditorFormValues,
  type RecipeEditorFormValues,
} from "./recipe-editor.schema";
import {
  getRecipeEditorBaseDraft,
  getRecipeEditorDefaults,
} from "./recipe-editor.values";
import { IngredientSectionEditor } from "./IngredientSectionEditor";

type RecipeEditorFormProps = {
  mode: "new" | "edit";
  recipe: Recipe | RecipeDraft;
  cancelHref: string;
  onSaveDraft?: (draft: RecipeDraft) => void;
};

type EditorFieldProps = {
  label: string;
  name: keyof RecipeEditorFormValues;
  register: UseFormRegister<RecipeEditorFormValues>;
  errors: FieldErrors<RecipeEditorFormValues>;
  defaultValue: string;
  type?: string;
  inputMode?: "decimal" | "numeric" | "text" | "url";
  placeholder?: string;
};

export function RecipeEditorForm({
  mode,
  recipe,
  cancelHref,
  onSaveDraft,
}: RecipeEditorFormProps) {
  const defaultValues = useMemo(() => getRecipeEditorDefaults(recipe), [recipe]);
  const baseDraft = useMemo(() => getRecipeEditorBaseDraft(recipe), [recipe]);
  const [saveState, setSaveState] = useState<"idle" | "validated">("idle");
  const {
    register,
    control,
    handleSubmit,
    formState: { errors, isDirty, isSubmitting },
  } = useForm<RecipeEditorFormValues, unknown, ParsedRecipeEditorFormValues>({
    defaultValues,
    resolver: zodResolver(recipeEditorFormSchema),
  });

  function handleValidSubmit(values: ParsedRecipeEditorFormValues) {
    const draft = validateRecipeEditorDraft(values, baseDraft);

    onSaveDraft?.(draft);
    setSaveState("validated");
  }

  return (
    <form className="recipe-editor-form" onSubmit={handleSubmit(handleValidSubmit)}>
      <header className="editor-header">
        <div>
          <p className="eyebrow">{mode === "new" ? "New recipe" : "Edit recipe"}</p>
          <h1>{mode === "new" ? "Create Recipe" : "Edit Recipe"}</h1>
          <p>
            Shape the recipe basics now. Ingredients and directions stay with the
            current structured draft for the next editor slices.
          </p>
        </div>
        <div className="editor-actions">
          <Link className="button button-secondary" to={cancelHref}>
            Cancel
          </Link>
          <Button type="submit" variant="primary" disabled={isSubmitting}>
            Save Draft
          </Button>
        </div>
      </header>

      {saveState === "validated" ? (
        <div className="form-status" role="status">
          Draft validated and ready for the route action.
        </div>
      ) : null}

      <section className="editor-section" aria-labelledby="editor-metadata">
        <div>
          <p className="eyebrow">Metadata</p>
          <h2 id="editor-metadata">Recipe Details</h2>
        </div>
        <div className="editor-grid two-column">
          <EditorField
            label="Title"
            name="title"
            register={register}
            errors={errors}
            defaultValue={defaultValues.title}
            placeholder="Lemon Icebox Pie"
          />
          <EditorField
            label="Image URL"
            name="imageUrl"
            register={register}
            errors={errors}
            defaultValue={defaultValues.imageUrl}
            inputMode="url"
            placeholder="https://..."
          />
        </div>
        <label className="field field-wide">
          <span>Description</span>
          <textarea
            {...register("description")}
            defaultValue={defaultValues.description}
            placeholder="A short description for the library and recipe header."
            rows={3}
          />
          <FieldError errors={errors} name="description" />
        </label>
        <EditorField
          label="Tags"
          name="tagsText"
          register={register}
          errors={errors}
          defaultValue={defaultValues.tagsText}
          placeholder="dessert, make-ahead, chilled"
        />
      </section>

      <section className="editor-section" aria-labelledby="editor-timing">
        <div>
          <p className="eyebrow">Timing</p>
          <h2 id="editor-timing">Prep, Cook, and Total</h2>
        </div>
        <div className="editor-grid three-column">
          <EditorField
            label="Prep minutes"
            name="prepMinutes"
            register={register}
            errors={errors}
            defaultValue={defaultValues.prepMinutes}
            inputMode="numeric"
          />
          <EditorField
            label="Cook minutes"
            name="cookMinutes"
            register={register}
            errors={errors}
            defaultValue={defaultValues.cookMinutes}
            inputMode="numeric"
          />
          <EditorField
            label="Total minutes"
            name="totalMinutes"
            register={register}
            errors={errors}
            defaultValue={defaultValues.totalMinutes}
            inputMode="numeric"
          />
        </div>
      </section>

      <section className="editor-section" aria-labelledby="editor-yield">
        <div>
          <p className="eyebrow">Yield</p>
          <h2 id="editor-yield">Servings and Notes</h2>
        </div>
        <div className="editor-grid three-column">
          <EditorField
            label="Quantity"
            name="yieldQuantity"
            register={register}
            errors={errors}
            defaultValue={defaultValues.yieldQuantity}
            inputMode="decimal"
          />
          <EditorField
            label="Unit"
            name="yieldUnit"
            register={register}
            errors={errors}
            defaultValue={defaultValues.yieldUnit}
            placeholder="servings"
          />
          <EditorField
            label="Yield notes"
            name="yieldNotes"
            register={register}
            errors={errors}
            defaultValue={defaultValues.yieldNotes}
            placeholder="Makes one 9-inch pie"
          />
        </div>
      </section>

      <section className="editor-section" aria-labelledby="editor-notes-source">
        <div>
          <p className="eyebrow">Notes</p>
          <h2 id="editor-notes-source">Notes and Source</h2>
        </div>
        <label className="field field-wide">
          <span>Notes</span>
          <textarea
            {...register("notesText")}
            defaultValue={defaultValues.notesText}
            placeholder="One note per line."
            rows={5}
          />
          <FieldError errors={errors} name="notesText" />
        </label>
        <div className="editor-grid two-column">
          <EditorField
            label="Source name"
            name="sourceName"
            register={register}
            errors={errors}
            defaultValue={defaultValues.sourceName}
            placeholder="Project Spice test kitchen"
          />
          <EditorField
            label="Source URL"
            name="sourceUrl"
            register={register}
            errors={errors}
            defaultValue={defaultValues.sourceUrl}
            inputMode="url"
            placeholder="https://..."
          />
        </div>
      </section>

      <IngredientSectionEditor
        control={control}
        register={register}
        errors={errors}
      />

      <footer className="editor-footer">
        <span>{isDirty ? "Unsaved changes" : "No changes yet"}</span>
        <div className="editor-actions">
          <Link className="button button-secondary" to={cancelHref}>
            Cancel
          </Link>
          <Button type="submit" variant="primary" disabled={isSubmitting}>
            Save Draft
          </Button>
        </div>
      </footer>
    </form>
  );
}

function EditorField({
  label,
  name,
  register,
  errors,
  defaultValue,
  type = "text",
  inputMode,
  placeholder,
}: EditorFieldProps) {
  return (
    <label className="field">
      <span>{label}</span>
      <input
        {...register(name)}
        type={type}
        inputMode={inputMode}
        placeholder={placeholder}
        defaultValue={defaultValue}
      />
      <FieldError errors={errors} name={name} />
    </label>
  );
}

function FieldError({
  errors,
  name,
}: {
  errors: FieldErrors<RecipeEditorFormValues>;
  name: keyof RecipeEditorFormValues;
}) {
  const message = errors[name]?.message;

  return message ? <small className="field-error">{message}</small> : null;
}
