import { zodResolver } from "@hookform/resolvers/zod";
import { useMemo } from "react";
import { Form, Link } from "react-router";
import { useForm, type FieldErrors, type UseFormRegister } from "react-hook-form";

import type { Recipe, RecipeDraft } from "~/modules/recipe-domain";
import { Button } from "~/modules/ui-shell/primitives";

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
}: RecipeEditorFormProps) {
  const defaultValues = useMemo(() => getRecipeEditorDefaults(recipe), [recipe]);
  const {
    register,
    control,
    formState: { errors, isDirty, isSubmitting },
  } = useForm<RecipeEditorFormValues, unknown, ParsedRecipeEditorFormValues>({
    defaultValues,
    resolver: zodResolver(recipeEditorFormSchema),
  });

  return (
    <Form className="recipe-editor-form" method="post">
      {"version" in recipe ? (
        <input
          type="hidden"
          name="expectedVersion"
          defaultValue={recipe.version}
        />
      ) : null}
      <header className="editor-header">
        <div>
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
            Save Recipe
          </Button>
        </div>
      </header>

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

      <section className="editor-section" aria-labelledby="editor-metadata">
        <div>
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
        <div className="editor-grid two-column">
          <label className="checkbox-field">
            <input
              type="checkbox"
              {...register("favorite")}
              defaultChecked={defaultValues.favorite}
            />
            Favorite
          </label>
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
        </div>
      </section>

      <section className="editor-section" aria-labelledby="editor-timing">
        <div>
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

      <DirectionSectionEditor
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
            Save Recipe
          </Button>
        </div>
      </footer>
    </Form>
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
