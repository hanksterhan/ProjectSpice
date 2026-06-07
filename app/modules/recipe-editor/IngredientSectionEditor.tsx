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

type IngredientItemsEditorProps = IngredientSectionEditorProps & {
  sectionIndex: number;
};

export function IngredientSectionEditor({
  control,
  register,
  errors,
}: IngredientSectionEditorProps) {
  const {
    fields: sections,
    append,
    remove,
    move,
  } = useFieldArray({
    control,
    name: "ingredientSections",
    keyName: "fieldId",
  });
  const sectionError = errors.ingredientSections?.message;

  return (
    <section className="editor-section" aria-labelledby="editor-ingredients">
      <div className="editor-section-header">
        <div>
          <h2 id="editor-ingredients">Ingredients</h2>
        </div>
        <Button
          type="button"
          variant="secondary"
          onClick={() => append(createEmptyIngredientSection())}
        >
          Add Group
        </Button>
      </div>

      {sectionError ? <small className="field-error">{sectionError}</small> : null}

      <div className="ingredient-editor-list">
        {sections.map((section, sectionIndex) => (
          <div className="ingredient-editor-section" key={section.fieldId}>
            <div className="ingredient-editor-section-header">
              <label className="field">
                <span>Group title</span>
                <input
                  {...register(`ingredientSections.${sectionIndex}.title`)}
                  defaultValue={section.title}
                  placeholder="Optional, e.g. Sauce"
                />
                <NestedFieldError
                  errors={errors}
                  path={["ingredientSections", sectionIndex, "title"]}
                />
              </label>

              <div className="editor-actions compact">
                <Button
                  type="button"
                  variant="quiet"
                  disabled={sectionIndex === 0}
                  onClick={() => move(sectionIndex, sectionIndex - 1)}
                >
                  Up
                </Button>
                <Button
                  type="button"
                  variant="quiet"
                  disabled={sectionIndex === sections.length - 1}
                  onClick={() => move(sectionIndex, sectionIndex + 1)}
                >
                  Down
                </Button>
                <Button
                  type="button"
                  variant="secondary"
                  disabled={sections.length === 1}
                  onClick={() => remove(sectionIndex)}
                >
                  Remove
                </Button>
              </div>
            </div>

            <input
              type="hidden"
              {...register(`ingredientSections.${sectionIndex}.id`)}
              defaultValue={section.id}
            />

            <IngredientItemsEditor
              control={control}
              register={register}
              errors={errors}
              sectionIndex={sectionIndex}
            />
          </div>
        ))}
      </div>
    </section>
  );
}

function IngredientItemsEditor({
  control,
  register,
  errors,
  sectionIndex,
}: IngredientItemsEditorProps) {
  const {
    fields: items,
    append,
    remove,
    move,
  } = useFieldArray({
    control,
    name: `ingredientSections.${sectionIndex}.items`,
    keyName: "fieldId",
  });
  const itemListError = errors.ingredientSections?.[sectionIndex]?.items?.message;

  return (
    <div className="ingredient-item-list">
      {itemListError ? <small className="field-error">{itemListError}</small> : null}

      {items.map((item, itemIndex) => (
        <div className="ingredient-item-editor" key={item.fieldId}>
          <input
            type="hidden"
            {...register(`ingredientSections.${sectionIndex}.items.${itemIndex}.id`)}
            defaultValue={item.id}
          />

          <label className="field field-wide">
            <span>Raw text</span>
            <input
              {...register(`ingredientSections.${sectionIndex}.items.${itemIndex}.raw`)}
              defaultValue={item.raw}
              placeholder="1 cup sugar, divided"
            />
            <NestedFieldError
              errors={errors}
              path={["ingredientSections", sectionIndex, "items", itemIndex, "raw"]}
            />
          </label>

          <div className="editor-grid ingredient-fields">
            <label className="field">
              <span>Qty</span>
              <input
                {...register(
                  `ingredientSections.${sectionIndex}.items.${itemIndex}.quantity`,
                )}
                defaultValue={item.quantity}
                inputMode="decimal"
              />
              <NestedFieldError
                errors={errors}
                path={[
                  "ingredientSections",
                  sectionIndex,
                  "items",
                  itemIndex,
                  "quantity",
                ]}
              />
            </label>

            <label className="field">
              <span>Unit</span>
              <input
                {...register(`ingredientSections.${sectionIndex}.items.${itemIndex}.unit`)}
                defaultValue={item.unit}
                placeholder="cup"
              />
              <NestedFieldError
                errors={errors}
                path={["ingredientSections", sectionIndex, "items", itemIndex, "unit"]}
              />
            </label>

            <label className="field">
              <span>Item</span>
              <input
                {...register(`ingredientSections.${sectionIndex}.items.${itemIndex}.item`)}
                defaultValue={item.item}
                placeholder="sugar"
              />
              <NestedFieldError
                errors={errors}
                path={["ingredientSections", sectionIndex, "items", itemIndex, "item"]}
              />
            </label>

            <label className="field">
              <span>Prep</span>
              <input
                {...register(
                  `ingredientSections.${sectionIndex}.items.${itemIndex}.preparation`,
                )}
                defaultValue={item.preparation}
                placeholder="divided"
              />
              <NestedFieldError
                errors={errors}
                path={[
                  "ingredientSections",
                  sectionIndex,
                  "items",
                  itemIndex,
                  "preparation",
                ]}
              />
            </label>
          </div>

          <div className="ingredient-item-actions">
            <label className="checkbox-field">
              <input
                type="checkbox"
                {...register(`ingredientSections.${sectionIndex}.items.${itemIndex}.optional`)}
                defaultChecked={item.optional}
              />
              <span>Optional</span>
            </label>
            <div className="editor-actions compact">
              <Button
                type="button"
                variant="quiet"
                disabled={itemIndex === 0}
                onClick={() => move(itemIndex, itemIndex - 1)}
              >
                Up
              </Button>
              <Button
                type="button"
                variant="quiet"
                disabled={itemIndex === items.length - 1}
                onClick={() => move(itemIndex, itemIndex + 1)}
              >
                Down
              </Button>
              <Button
                type="button"
                variant="secondary"
                disabled={items.length === 1}
                onClick={() => remove(itemIndex)}
              >
                Remove
              </Button>
            </div>
          </div>
        </div>
      ))}

      <Button
        type="button"
        variant="secondary"
        onClick={() => append(createEmptyIngredientItem())}
      >
        Add Ingredient
      </Button>
    </div>
  );
}

function createEmptyIngredientSection() {
  return {
    id: createRecipeEditorId("ingredient-section"),
    title: "",
    items: [createEmptyIngredientItem()],
  };
}

function createEmptyIngredientItem() {
  return {
    id: createRecipeEditorId("ingredient"),
    raw: "",
    quantity: "",
    unit: "",
    item: "",
    preparation: "",
    optional: false,
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
