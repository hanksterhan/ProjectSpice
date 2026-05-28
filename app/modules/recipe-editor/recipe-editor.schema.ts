import { z } from "zod";

import { recipeDraftSchema } from "~/modules/recipe-domain";

const optionalTextInput = z
  .string()
  .trim()
  .transform((value) => (value.length > 0 ? value : undefined));

const optionalUrlInput = optionalTextInput.pipe(z.url().optional());

const optionalNumberInput = z
  .string()
  .trim()
  .transform((value, context) => {
    if (value.length === 0) {
      return undefined;
    }

    const numberValue = Number(value);

    if (!Number.isFinite(numberValue)) {
      context.addIssue({
        code: "custom",
        message: "Use a valid number.",
      });

      return z.NEVER;
    }

    return numberValue;
  });

const optionalMinutesInput = optionalNumberInput.pipe(
  z.number().int("Use whole minutes.").nonnegative("Minutes cannot be negative.").optional(),
);

const optionalPositiveNumberInput = optionalNumberInput.pipe(
  z.number().positive("Use a positive number.").optional(),
);

export const recipeEditorFormSchema = z
  .object({
    title: z.string().trim().min(1, "Add a recipe title."),
    description: optionalTextInput,
    imageUrl: optionalUrlInput,
    tagsText: z.string(),
    prepMinutes: optionalMinutesInput,
    cookMinutes: optionalMinutesInput,
    totalMinutes: optionalMinutesInput,
    yieldQuantity: optionalPositiveNumberInput,
    yieldUnit: optionalTextInput,
    yieldNotes: optionalTextInput,
    notesText: z.string(),
    sourceName: optionalTextInput,
    sourceUrl: optionalUrlInput,
  })
  .strict();

export type RecipeEditorFormValues = z.input<typeof recipeEditorFormSchema>;
export type ParsedRecipeEditorFormValues = z.output<typeof recipeEditorFormSchema>;

export function parseRecipeEditorTags(tagsText: string): string[] {
  return tagsText
    .split(",")
    .map((tag) => tag.trim())
    .filter(Boolean);
}

export function parseRecipeEditorNotes(notesText: string): string[] | undefined {
  const notes = notesText
    .split(/\n+/)
    .map((note) => note.trim())
    .filter(Boolean);

  return notes.length > 0 ? notes : undefined;
}

export function validateRecipeEditorDraft(
  values: ParsedRecipeEditorFormValues,
  baseDraft: z.input<typeof recipeDraftSchema>,
) {
  const draft = recipeDraftSchema.parse({
    ...baseDraft,
    title: values.title,
    description: values.description,
    imageUrl: values.imageUrl,
    tags: parseRecipeEditorTags(values.tagsText),
    notes: parseRecipeEditorNotes(values.notesText),
    yield:
      values.yieldQuantity || values.yieldUnit || values.yieldNotes
        ? {
            quantity: values.yieldQuantity,
            unit: values.yieldUnit,
            notes: values.yieldNotes,
          }
        : undefined,
    times:
      values.prepMinutes !== undefined ||
      values.cookMinutes !== undefined ||
      values.totalMinutes !== undefined
        ? {
            prepMinutes: values.prepMinutes,
            cookMinutes: values.cookMinutes,
            totalMinutes: values.totalMinutes,
          }
        : undefined,
    source:
      values.sourceName || values.sourceUrl
        ? {
            type: baseDraft.source?.type ?? "manual",
            name: values.sourceName,
            url: values.sourceUrl,
          }
        : baseDraft.source,
  });

  return draft;
}
