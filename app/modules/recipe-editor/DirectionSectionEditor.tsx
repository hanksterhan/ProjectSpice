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

export function DirectionSectionEditor({
  control,
  register,
  errors,
}: DirectionSectionEditorProps) {
  const { fields: sections, append } = useFieldArray({
    control,
    name: "directionSections",
    keyName: "fieldId",
  });
  const sectionError = errors.directionSections?.message;

  return (
    <section
      className="editor-section recipe-compose-directions"
      aria-labelledby="editor-directions"
    >
      <div className="editor-section-header">
        <div>
          <h2 id="editor-directions">Directions</h2>
        </div>
        <Button
          type="button"
          variant="secondary"
          onClick={() => append(createEmptyDirectionSection())}
        >
          Add Section
        </Button>
      </div>

      {sectionError ? <small className="field-error">{sectionError}</small> : null}

      <div className="direction-editor-list">
        {sections.map((section, sectionIndex) => (
          <div className="direction-editor-section" key={section.fieldId}>
            <input
              type="hidden"
              {...register(`directionSections.${sectionIndex}.id`)}
              defaultValue={section.id}
            />

            {section.title || sectionIndex > 0 ? (
              <label className="compose-section-title-field">
                <span className="sr-only">Direction section title</span>
                <input
                  {...register(`directionSections.${sectionIndex}.title`)}
                  defaultValue={section.title}
                  placeholder="Section title"
                />
                <NestedFieldError
                  errors={errors}
                  path={["directionSections", sectionIndex, "title"]}
                />
              </label>
            ) : (
              <input
                type="hidden"
                {...register(`directionSections.${sectionIndex}.title`)}
                defaultValue={section.title}
              />
            )}

            <label className="compose-text-block compose-directions-text">
              <span className="sr-only">Directions</span>
              <textarea
                {...register(`directionSections.${sectionIndex}.stepsText`)}
                defaultValue={section.stepsText}
                placeholder={"Heat oven to 350 F.\nMix the batter.\nBake until set."}
                rows={getDirectionTextareaRows(section.stepsText)}
              />
              <NestedFieldError
                errors={errors}
                path={["directionSections", sectionIndex]}
              />
            </label>
          </div>
        ))}
      </div>
    </section>
  );
}

function getDirectionTextareaRows(value: string | undefined): number {
  const lineCount = (value ?? "").split("\n").reduce((count, line) => {
    const visualLines = Math.max(1, Math.ceil(line.length / 78));
    return count + visualLines;
  }, 0);

  return Math.max(10, lineCount + 2);
}

function createEmptyDirectionSection() {
  return {
    id: createRecipeEditorId("direction-section"),
    title: "",
    stepsText: "",
    steps: [],
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
