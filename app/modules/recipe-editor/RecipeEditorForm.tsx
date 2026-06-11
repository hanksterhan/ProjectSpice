import { zodResolver } from "@hookform/resolvers/zod";
import { useEffect, useMemo, useRef, type ReactNode } from "react";
import { ExternalLink } from "lucide-react";
import { Form, Link } from "react-router";
import { useForm, type FieldErrors, type UseFormRegister } from "react-hook-form";

import type { Recipe, RecipeDraft } from "~/modules/recipe-domain";
import { Button, FavoriteStar, RecipeImage } from "~/modules/ui-shell/primitives";

import {
  recipeEditorFormSchema,
  type ParsedRecipeEditorFormValues,
  type RecipeEditorFormValues,
} from "./recipe-editor.schema";
import { getRecipeEditorDefaults } from "./recipe-editor.values";
import { DirectionSectionEditor } from "./DirectionSectionEditor";
import { IngredientSectionEditor } from "./IngredientSectionEditor";

type RecipeEditorFormProps = {
  mode: "new" | "edit";
  recipe: Recipe | RecipeDraft;
  cancelHref: string;
  errors?: string[];
  chrome?: "full" | "minimal";
  secondaryAction?: ReactNode;
};

type EditorFieldProps = {
  label: string;
  name: keyof RecipeEditorFormValues;
  register: UseFormRegister<RecipeEditorFormValues>;
  errors: FieldErrors<RecipeEditorFormValues>;
  defaultValue: string;
  type?: string;
  inputMode?: "decimal" | "numeric" | "text" | "url";
  max?: string;
  min?: string;
  placeholder?: string;
  step?: string;
};

export function RecipeEditorForm({
  mode,
  recipe,
  cancelHref,
  errors: actionErrors = [],
  chrome = "full",
  secondaryAction,
}: RecipeEditorFormProps) {
  const defaultValues = useMemo(() => getRecipeEditorDefaults(recipe), [recipe]);
  const titleTextareaRef = useRef<HTMLTextAreaElement | null>(null);
  const {
    register,
    control,
    formState: { errors, isDirty, isSubmitting },
  } = useForm<RecipeEditorFormValues, unknown, ParsedRecipeEditorFormValues>({
    defaultValues,
    resolver: zodResolver(recipeEditorFormSchema),
  });
  const titleField = register("title");

  useEffect(() => {
    resizeTextareaToContent(titleTextareaRef.current);
  }, [defaultValues.title]);

  return (
    <Form className="recipe-editor-form" method="post">
      {"version" in recipe ? (
        <input
          type="hidden"
          name="expectedVersion"
          defaultValue={recipe.version}
        />
      ) : null}
      <input
        type="hidden"
        {...register("sourceType")}
        defaultValue={defaultValues.sourceType}
      />
      {chrome === "full" ? (
        <header className="recipe-compose-toolbar">
          <div>
            <span>{mode === "new" ? "New recipe draft" : "Editing recipe"}</span>
            <strong>Review, edit, then save</strong>
          </div>
          <div className="editor-actions">
            {secondaryAction}
            <Link className="button button-secondary" to={cancelHref}>
              Cancel
            </Link>
            <Button type="submit" variant="primary" disabled={isSubmitting}>
              Save Recipe
            </Button>
          </div>
        </header>
      ) : null}

      {actionErrors.length > 0 ? (
        <div className="form-status error" role="alert">
          <p>Review the highlighted save issue.</p>
          <ul>
            {actionErrors.map((error) => (
              <li key={error}>{error}</li>
            ))}
          </ul>
        </div>
      ) : null}

      <section className="recipe-compose-hero" aria-labelledby="editor-metadata">
        <div className="recipe-compose-title-block">
          <label className="compose-title-field">
            <span className="sr-only">Title</span>
            <textarea
              {...titleField}
              defaultValue={defaultValues.title}
              id="editor-metadata"
              onInput={(event) => resizeTextareaToContent(event.currentTarget)}
              placeholder="Recipe title"
              ref={(element) => {
                titleField.ref(element);
                titleTextareaRef.current = element;
                resizeTextareaToContent(element);
              }}
              rows={1}
            />
          </label>
          <FieldError errors={errors} name="title" />
          <label className="compose-description-field">
            <span className="sr-only">Description</span>
            <textarea
              {...register("description")}
              defaultValue={defaultValues.description}
              placeholder="Add a short description."
              rows={3}
            />
          </label>
          <FieldError errors={errors} name="description" />
        </div>

        <div className="recipe-compose-image-panel">
          <RecipeImage
            className="recipe-compose-image"
            src={defaultValues.imageUrl}
            title={defaultValues.imageUrl ? defaultValues.title || "Recipe" : "URL"}
          />
          <details className="recipe-compose-image-url">
            <summary>Change image URL</summary>
            <label className="field field-wide">
              <span>Image URL</span>
              <input
                {...register("imageUrl")}
                defaultValue={defaultValues.imageUrl}
                inputMode="url"
                placeholder="https://..."
              />
              <FieldError errors={errors} name="imageUrl" />
            </label>
          </details>
        </div>
      </section>

      <section className="recipe-compose-stats" aria-label="Recipe details">
        <EditorField
          label="Yield"
          name="yieldNotes"
          register={register}
          errors={errors}
          defaultValue={defaultValues.yieldNotes}
          placeholder="Serves 4"
        />
        <EditorField
          label="Prep"
          name="prepMinutes"
          register={register}
          errors={errors}
          defaultValue={defaultValues.prepMinutes}
          inputMode="numeric"
          placeholder="15"
        />
        <EditorField
          label="Cook"
          name="cookMinutes"
          register={register}
          errors={errors}
          defaultValue={defaultValues.cookMinutes}
          inputMode="numeric"
          placeholder="30"
        />
        <EditorField
          label="Total"
          name="totalMinutes"
          register={register}
          errors={errors}
          defaultValue={defaultValues.totalMinutes}
          inputMode="numeric"
          placeholder="45"
        />
        <EditorField
          label="Rating"
          name="rating"
          register={register}
          errors={errors}
          defaultValue={defaultValues.rating}
          inputMode="decimal"
          max="10"
          min="0"
          step="0.1"
          type="number"
          placeholder="8.5"
        />
        <label className="compose-stat-toggle">
          <input
            type="checkbox"
            {...register("favorite")}
            defaultChecked={defaultValues.favorite}
          />
          <FavoriteStar decorative />
          <span>Favorite</span>
        </label>
      </section>

      <input
        type="hidden"
        {...register("yieldQuantity")}
        defaultValue={defaultValues.yieldQuantity}
      />
      <input
        type="hidden"
        {...register("yieldUnit")}
        defaultValue={defaultValues.yieldUnit}
      />

      <section className="recipe-compose-meta" aria-label="Tags and source">
        <label className="field field-wide">
          <span>Tags</span>
          <input
            {...register("tagsText")}
            defaultValue={defaultValues.tagsText}
            placeholder="dessert, make-ahead, chilled"
          />
          <FieldError errors={errors} name="tagsText" />
        </label>
        <label className="field field-wide">
          <span>Source</span>
          <input
            {...register("sourceName")}
            defaultValue={defaultValues.sourceName}
            placeholder="Source name"
          />
          <FieldError errors={errors} name="sourceName" />
        </label>
        <label className="field field-wide source-url-field">
          <span>Source URL</span>
          <div>
            <input
              {...register("sourceUrl")}
              defaultValue={defaultValues.sourceUrl}
              inputMode="url"
              placeholder="https://..."
            />
            {defaultValues.sourceUrl ? (
              <a href={defaultValues.sourceUrl} rel="noreferrer" target="_blank">
                <ExternalLink aria-hidden="true" size={16} strokeWidth={2.5} />
                <span className="sr-only">Open source</span>
              </a>
            ) : null}
          </div>
          <FieldError errors={errors} name="sourceUrl" />
        </label>
      </section>

      <div className="recipe-compose-layout">
        <IngredientSectionEditor
          control={control}
          register={register}
          errors={errors}
        />

        <div className="recipe-compose-main">
          <DirectionSectionEditor
            control={control}
            register={register}
            errors={errors}
          />

          <section className="editor-section recipe-compose-notes" aria-labelledby="editor-notes">
            <div>
              <h2 id="editor-notes">Notes</h2>
            </div>
            <label className="field field-wide">
              <span className="sr-only">Notes</span>
              <textarea
                {...register("notesText")}
                defaultValue={defaultValues.notesText}
                placeholder="Add notes, one per line."
                rows={5}
              />
              <FieldError errors={errors} name="notesText" />
            </label>
          </section>
        </div>
      </div>

      <footer className="editor-footer recipe-compose-footer">
        <span>{isDirty ? "Unsaved changes" : "Ready to review"}</span>
        <div className="editor-actions">
          {secondaryAction}
          <Link className="button button-secondary" to={cancelHref}>
            Cancel
          </Link>
          <Button type="submit" variant="primary" disabled={isSubmitting}>
            Save Recipe
          </Button>
        </div>
      </footer>
    </Form>
  );
}

function resizeTextareaToContent(element: HTMLTextAreaElement | null) {
  if (!element) {
    return;
  }

  element.style.height = "auto";
  element.style.height = `${element.scrollHeight}px`;
}

function EditorField({
  label,
  name,
  register,
  errors,
  defaultValue,
  type = "text",
  inputMode,
  max,
  min,
  placeholder,
  step,
}: EditorFieldProps) {
  return (
    <label className="field">
      <span>{label}</span>
      <input
        {...register(name)}
        type={type}
        inputMode={inputMode}
        max={max}
        min={min}
        placeholder={placeholder}
        step={step}
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
