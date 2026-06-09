import {
  useFieldArray,
  type Control,
  type FieldErrors,
  type UseFormRegister,
} from "react-hook-form";

import { Button } from "~/modules/ui-shell/primitives";

import { createRecipeEditorId } from "./recipe-editor.ids";
import type {
  ParsedRecipeEditorFormValues,
  RecipeEditorFormValues,
} from "./recipe-editor.schema";

type IngredientSectionEditorProps = {
  control: Control<
    RecipeEditorFormValues,
    unknown,
    ParsedRecipeEditorFormValues
  >;
  register: UseFormRegister<RecipeEditorFormValues>;
  errors: FieldErrors<RecipeEditorFormValues>;
};

export function IngredientSectionEditor({
  control,
  register,
  errors,
}: IngredientSectionEditorProps) {
  const { fields: sections, append } = useFieldArray({
    control,
    name: "ingredientSections",
    keyName: "fieldId",
  });
  const sectionError = errors.ingredientSections?.message;

  return (
    <section
      className="editor-section recipe-compose-ingredients"
      aria-labelledby="editor-ingredients"
    >
      <div className="editor-section-header">
        <div>
          <h2 id="editor-ingredients">Ingredients</h2>
        </div>
        <Button
          type="button"
          variant="secondary"
          onClick={() => append(createEmptyIngredientSection())}
        >
          Add Section
        </Button>
      </div>

      {sectionError ? <small className="field-error">{sectionError}</small> : null}

      <div className="ingredient-editor-list">
        {sections.map((section, sectionIndex) => (
          <div className="ingredient-editor-section" key={section.fieldId}>
            <input
              type="hidden"
              {...register(`ingredientSections.${sectionIndex}.id`)}
              defaultValue={section.id}
            />

            {section.title || sectionIndex > 0 ? (
              <label className="compose-section-title-field">
                <span className="sr-only">Ingredient section title</span>
                <input
                  {...register(`ingredientSections.${sectionIndex}.title`)}
                  defaultValue={section.title}
                  placeholder="Section title"
                />
                <NestedFieldError
                  errors={errors}
                  path={["ingredientSections", sectionIndex, "title"]}
                />
              </label>
            ) : (
              <input
                type="hidden"
                {...register(`ingredientSections.${sectionIndex}.title`)}
                defaultValue={section.title}
              />
            )}

            <label className="compose-text-block">
              <span className="sr-only">Ingredients</span>
              <textarea
                {...register(`ingredientSections.${sectionIndex}.itemsText`)}
                defaultValue={section.itemsText}
                placeholder={"1 cup sugar\n2 eggs\nCilantro (optional)"}
                rows={Math.max(5, section.itemsText?.split("\n").length ?? 5)}
              />
              <NestedFieldError
                errors={errors}
                path={["ingredientSections", sectionIndex]}
              />
            </label>
          </div>
        ))}
      </div>
    </section>
  );
}

function createEmptyIngredientSection() {
  return {
    id: createRecipeEditorId("ingredient-section"),
    title: "",
    itemsText: "",
    items: [],
  };
}

function NestedFieldError({
  errors,
  path,
}: {
  errors: FieldErrors<RecipeEditorFormValues>;
  path: Array<string | number>;
}) {
  let current: unknown = errors;

  for (const segment of path) {
    if (!current || typeof current !== "object") {
      return null;
    }

    current = (current as Record<string | number, unknown>)[segment];
  }

  if (
    !current ||
    typeof current !== "object" ||
    !("message" in current) ||
    typeof current.message !== "string"
  ) {
    return null;
  }

  return <small className="field-error">{current.message}</small>;
}
