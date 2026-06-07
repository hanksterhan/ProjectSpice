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

type DirectionSectionEditorProps = {
  control: Control<
    RecipeEditorFormValues,
    unknown,
    ParsedRecipeEditorFormValues
  >;
  register: UseFormRegister<RecipeEditorFormValues>;
  errors: FieldErrors<RecipeEditorFormValues>;
};

type DirectionStepsEditorProps = DirectionSectionEditorProps & {
  sectionIndex: number;
};

export function DirectionSectionEditor({
  control,
  register,
  errors,
}: DirectionSectionEditorProps) {
  const {
    fields: sections,
    append,
    remove,
    move,
  } = useFieldArray({
    control,
    name: "directionSections",
    keyName: "fieldId",
  });
  const sectionError = errors.directionSections?.message;

  return (
    <section className="editor-section" aria-labelledby="editor-directions">
      <div className="editor-section-header">
        <div>
          <h2 id="editor-directions">Directions</h2>
        </div>
        <Button
          type="button"
          variant="secondary"
          onClick={() => append(createEmptyDirectionSection())}
        >
          Add Stage
        </Button>
      </div>

      {sectionError ? <small className="field-error">{sectionError}</small> : null}

      <div className="direction-editor-list">
        {sections.map((section, sectionIndex) => (
          <div className="direction-editor-section" key={section.fieldId}>
            <div className="direction-editor-section-header">
              <label className="field">
                <span>Stage title</span>
                <input
                  {...register(`directionSections.${sectionIndex}.title`)}
                  defaultValue={section.title}
                  placeholder="Optional, e.g. Bake"
                />
                <NestedFieldError
                  errors={errors}
                  path={["directionSections", sectionIndex, "title"]}
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
              {...register(`directionSections.${sectionIndex}.id`)}
              defaultValue={section.id}
            />

            <DirectionStepsEditor
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

function DirectionStepsEditor({
  control,
  register,
  errors,
  sectionIndex,
}: DirectionStepsEditorProps) {
  const {
    fields: steps,
    append,
    remove,
    move,
  } = useFieldArray({
    control,
    name: `directionSections.${sectionIndex}.steps`,
    keyName: "fieldId",
  });
  const stepListError = errors.directionSections?.[sectionIndex]?.steps?.message;

  return (
    <div className="direction-step-list">
      {stepListError ? <small className="field-error">{stepListError}</small> : null}

      {steps.map((step, stepIndex) => (
        <div className="direction-step-editor" key={step.fieldId}>
          <input
            type="hidden"
            {...register(`directionSections.${sectionIndex}.steps.${stepIndex}.id`)}
            defaultValue={step.id}
          />

          <label className="field field-wide">
            <span>Step {stepIndex + 1}</span>
            <textarea
              {...register(`directionSections.${sectionIndex}.steps.${stepIndex}.text`)}
              defaultValue={step.text}
              placeholder="Describe the next cooking action."
              rows={3}
            />
            <NestedFieldError
              errors={errors}
              path={["directionSections", sectionIndex, "steps", stepIndex, "text"]}
            />
          </label>

          <div className="editor-grid direction-fields">
            <label className="field">
              <span>Timer minutes</span>
              <input
                {...register(
                  `directionSections.${sectionIndex}.steps.${stepIndex}.timerMinutes`,
                )}
                defaultValue={step.timerMinutes}
                inputMode="numeric"
              />
              <NestedFieldError
                errors={errors}
                path={[
                  "directionSections",
                  sectionIndex,
                  "steps",
                  stepIndex,
                  "timerMinutes",
                ]}
              />
            </label>

            <label className="field">
              <span>Ingredient refs</span>
              <input
                {...register(
                  `directionSections.${sectionIndex}.steps.${stepIndex}.ingredientRefsText`,
                )}
                defaultValue={step.ingredientRefsText}
                placeholder="ingredient-id, another-id"
              />
              <NestedFieldError
                errors={errors}
                path={[
                  "directionSections",
                  sectionIndex,
                  "steps",
                  stepIndex,
                  "ingredientRefsText",
                ]}
              />
            </label>
          </div>

          <div className="direction-step-actions">
            <div className="editor-actions compact">
              <Button
                type="button"
                variant="quiet"
                disabled={stepIndex === 0}
                onClick={() => move(stepIndex, stepIndex - 1)}
              >
                Up
              </Button>
              <Button
                type="button"
                variant="quiet"
                disabled={stepIndex === steps.length - 1}
                onClick={() => move(stepIndex, stepIndex + 1)}
              >
                Down
              </Button>
              <Button
                type="button"
                variant="secondary"
                disabled={steps.length === 1}
                onClick={() => remove(stepIndex)}
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
        onClick={() => append(createEmptyDirectionStep())}
      >
        Add Step
      </Button>
    </div>
  );
}

function createEmptyDirectionSection() {
  return {
    id: createRecipeEditorId("direction-section"),
    title: "",
    steps: [createEmptyDirectionStep()],
  };
}

function createEmptyDirectionStep() {
  return {
    id: createRecipeEditorId("step"),
    text: "",
    timerMinutes: "",
    ingredientRefsText: "",
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
