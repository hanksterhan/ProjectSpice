import { useEffect, useRef, useState } from "react";
import type { ComponentPropsWithoutRef, ReactNode } from "react";
import { Form, Link, useNavigation } from "react-router";
import { Button, Chip, ImageFallback, SectionHeader } from "~/components/ui";

export type RecipeEditorValues = {
  id?: string;
  title?: string;
  description?: string | null;
  sourceUrl?: string | null;
  imageSourceUrl?: string | null;
  imageAlt?: string | null;
  prepTimeMin?: number | null;
  activeTimeMin?: number | null;
  totalTimeMin?: number | null;
  timeNotes?: string | null;
  servings?: number | null;
  servingsUnit?: string | null;
  difficulty?: string | null;
  directionsText?: string | null;
  notes?: string | null;
  visibility?: string | null;
  ingredientsText?: string;
  tagsText?: string;
};

type RecipeEditorFormProps = {
  mode: "new" | "edit";
  values?: RecipeEditorValues;
  tagSuggestions: string[];
  actionError?: string;
  cancelTo: string;
};

const fieldClass =
  "ps-control w-full border border-rule bg-paper-2 px-3 text-sm text-ink placeholder:text-ink-4 focus-visible:ps-focus-ring";
const textareaClass =
  "w-full rounded-lg border border-rule bg-paper-2 px-3 py-2 text-sm text-ink placeholder:text-ink-4 focus-visible:ps-focus-ring";

export function RecipeEditorForm({
  mode,
  values,
  tagSuggestions,
  actionError,
  cancelTo,
}: RecipeEditorFormProps) {
  const navigation = useNavigation();
  const isPending = navigation.state === "submitting";
  const isDirty = useRef(false);
  const [tagInput, setTagInput] = useState(values?.tagsText ?? "");
  const [imageUrl, setImageUrl] = useState(values?.imageSourceUrl ?? "");

  useEffect(() => {
    const handler = (event: BeforeUnloadEvent) => {
      if (isDirty.current) event.preventDefault();
    };
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, []);

  function addSuggestedTag(tag: string) {
    const current = tagInput
      .split(",")
      .map((item) => item.trim())
      .filter(Boolean);
    if (!current.includes(tag)) {
      setTagInput([...current, tag].join(", "));
      isDirty.current = true;
    }
  }

  return (
    <Form
      method="post"
      className="space-y-5"
      onChange={() => {
        isDirty.current = true;
      }}
    >
      <div className="sticky top-16 z-20 -mx-4 border-b border-rule bg-paper/95 px-4 py-3 backdrop-blur sm:-mx-6 sm:px-6 lg:-mx-8 lg:px-8">
        <div className="mx-auto flex max-w-5xl flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-xs font-semibold uppercase text-ink-3">
              {mode === "new" ? "New recipe" : "Recipe editor"}
            </p>
            <p className="text-sm text-ink-3">
              {mode === "new"
                ? "Draft a recipe with enough structure to cook from later."
                : "Update the saved recipe while preserving its library links."}
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button type="submit" variant="primary" disabled={isPending}>
              {isPending ? "Saving..." : mode === "new" ? "Save Recipe" : "Save Changes"}
            </Button>
            <Link
              to={cancelTo}
              className="ps-control inline-flex items-center justify-center border border-rule bg-paper-2 px-4 text-sm font-medium text-ink hover:bg-paper-3 focus-visible:ps-focus-ring"
            >
              Cancel
            </Link>
          </div>
        </div>
      </div>

      {actionError && (
        <div role="alert" className="rounded-lg border border-err/30 bg-err/10 px-4 py-3 text-sm text-err">
          {actionError}
        </div>
      )}

      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_18rem]">
        <div className="space-y-5">
          <EditorSection
            eyebrow="Identity"
            title="Name and story"
            description="Keep the title scannable; use the description for the short cookbook note."
          >
            <TextField
              id="title"
              name="title"
              label="Title"
              required
              autoFocus={mode === "new"}
              defaultValue={values?.title ?? ""}
              placeholder="Chocolate Chip Cookies"
            />
            <TextareaField
              id="description"
              name="description"
              label="Description"
              rows={3}
              defaultValue={values?.description ?? ""}
              placeholder="A short note for the recipe card."
            />
          </EditorSection>

          <EditorSection
            eyebrow="Cook"
            title="Ingredients and directions"
            description="One ingredient or step per line keeps cooking mode readable."
          >
            <TextareaField
              id="ingredients"
              name="ingredients"
              label="Ingredients"
              rows={12}
              defaultValue={values?.ingredientsText ?? ""}
              helper="End a line with ':' to create a section header."
              monospace
              placeholder={"2 cups all-purpose flour\n1 tsp baking powder\n\nFor the topping:\n2 tbsp sugar"}
            />
            <TextareaField
              id="directionsText"
              name="directionsText"
              label="Directions"
              rows={12}
              defaultValue={values?.directionsText ?? ""}
              helper="Blank lines create paragraph breaks."
              placeholder={"Preheat oven to 375 F.\nMix dry ingredients in a bowl.\nFold in wet ingredients."}
            />
            <TextareaField
              id="notes"
              name="notes"
              label="Notes"
              rows={4}
              defaultValue={values?.notes ?? ""}
              placeholder="Storage, substitutions, or family notes."
            />
          </EditorSection>
        </div>

        <aside className="space-y-5">
          <EditorSection eyebrow="Image" title="Recipe photo">
            <div className="overflow-hidden rounded-lg border border-rule bg-paper-3">
              <div className="aspect-[4/3]">
                <ImageFallback src={imageUrl || null} label="Recipe" alt="" />
              </div>
            </div>
            <TextField
              id="imageSourceUrl"
              name="imageSourceUrl"
              label="Image URL"
              type="url"
              value={imageUrl}
              onChange={(event) => setImageUrl(event.currentTarget.value)}
              placeholder="https://..."
            />
            <TextField
              id="imageAlt"
              name="imageAlt"
              label="Image alt text"
              defaultValue={values?.imageAlt ?? ""}
              placeholder="Describe the finished dish"
            />
          </EditorSection>

          <EditorSection eyebrow="Timing" title="Time and yield">
            <div className="grid grid-cols-3 gap-2">
              <TextField id="prepTimeMin" name="prepTimeMin" label="Prep" type="number" min="0" defaultValue={values?.prepTimeMin ?? ""} />
              <TextField id="activeTimeMin" name="activeTimeMin" label="Active" type="number" min="0" defaultValue={values?.activeTimeMin ?? ""} />
              <TextField id="totalTimeMin" name="totalTimeMin" label="Total" type="number" min="0" defaultValue={values?.totalTimeMin ?? ""} />
            </div>
            <TextField
              id="timeNotes"
              name="timeNotes"
              label="Time notes"
              defaultValue={values?.timeNotes ?? ""}
              placeholder="Plus overnight rest"
            />
            <div className="grid grid-cols-2 gap-2">
              <TextField id="servings" name="servings" label="Servings" type="number" min="0" step="0.5" defaultValue={values?.servings ?? ""} />
              <TextField id="servingsUnit" name="servingsUnit" label="Unit" defaultValue={values?.servingsUnit ?? ""} placeholder="portions" />
            </div>
          </EditorSection>

          <EditorSection eyebrow="Organize" title="Library metadata">
            <SelectField
              id="difficulty"
              name="difficulty"
              label="Difficulty"
              defaultValue={values?.difficulty ?? ""}
              options={[
                ["", "Not set"],
                ["easy", "Easy"],
                ["medium", "Medium"],
                ["hard", "Hard"],
              ]}
            />
            <SelectField
              id="visibility"
              name="visibility"
              label="Visibility"
              defaultValue={values?.visibility ?? "private"}
              options={[
                ["private", "Private"],
                ["family", "Family"],
              ]}
            />
            <TextField
              id="sourceUrl"
              name="sourceUrl"
              label="Source URL"
              type="url"
              defaultValue={values?.sourceUrl ?? ""}
              placeholder="https://..."
            />
            <div className="space-y-2">
              <TextField
                id="tags"
                name="tags"
                label="Tags"
                value={tagInput}
                onChange={(event) => setTagInput(event.currentTarget.value)}
                placeholder="pasta, weeknight"
              />
              {tagSuggestions.length > 0 && (
                <div className="flex flex-wrap gap-1.5">
                  {tagSuggestions.slice(0, 24).map((tag) => (
                    <button
                      key={tag}
                      type="button"
                      onClick={() => addSuggestedTag(tag)}
                      className="focus-visible:ps-focus-ring"
                    >
                      <Chip>+ {tag}</Chip>
                    </button>
                  ))}
                </div>
              )}
            </div>
          </EditorSection>
        </aside>
      </div>
    </Form>
  );
}

function EditorSection({
  eyebrow,
  title,
  description,
  children,
}: {
  eyebrow: string;
  title: string;
  description?: string;
  children: ReactNode;
}) {
  return (
    <section className="ps-surface space-y-4 p-4">
      <SectionHeader
        eyebrow={eyebrow}
        title={<span className="text-xl">{title}</span>}
        description={description}
      />
      <div className="space-y-4">{children}</div>
    </section>
  );
}

type TextFieldProps = ComponentPropsWithoutRef<"input"> & {
  label: string;
  helper?: string;
};

function TextField({ id, label, helper, className, ...props }: TextFieldProps) {
  return (
    <div className="space-y-1.5">
      <label htmlFor={id} className="text-sm font-semibold text-ink">
        {label}
        {props.required && <span className="text-err"> *</span>}
      </label>
      {helper && <p className="text-xs text-ink-3">{helper}</p>}
      <input id={id} className={`${fieldClass} ${className ?? ""}`} {...props} />
    </div>
  );
}

type TextareaFieldProps = ComponentPropsWithoutRef<"textarea"> & {
  label: string;
  helper?: string;
  monospace?: boolean;
};

function TextareaField({
  id,
  label,
  helper,
  monospace,
  className,
  ...props
}: TextareaFieldProps) {
  return (
    <div className="space-y-1.5">
      <label htmlFor={id} className="text-sm font-semibold text-ink">
        {label}
      </label>
      {helper && <p className="text-xs text-ink-3">{helper}</p>}
      <textarea
        id={id}
        className={`${textareaClass} ${monospace ? "ps-mono" : ""} ${className ?? ""}`}
        {...props}
      />
    </div>
  );
}

function SelectField({
  id,
  name,
  label,
  defaultValue,
  options,
}: {
  id: string;
  name: string;
  label: string;
  defaultValue: string;
  options: Array<[string, string]>;
}) {
  return (
    <div className="space-y-1.5">
      <label htmlFor={id} className="text-sm font-semibold text-ink">
        {label}
      </label>
      <select id={id} name={name} defaultValue={defaultValue} className={fieldClass}>
        {options.map(([value, labelText]) => (
          <option key={value} value={value}>
            {labelText}
          </option>
        ))}
      </select>
    </div>
  );
}
