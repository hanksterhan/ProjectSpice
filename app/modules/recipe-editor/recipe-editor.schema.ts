import { z } from "zod";

import {
  createRecipeSlug,
  recipeDraftSchema,
  recipeSourceTypeSchema,
} from "~/modules/recipe-domain";

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

const optionalRatingInput = optionalNumberInput.pipe(
  z
    .number()
    .min(0, "Rating cannot be below 0.")
    .max(10, "Rating cannot be above 10.")
    .refine((value) => Math.abs(value * 10 - Math.round(value * 10)) < 0.000001, {
      message: "Use 0.1 rating increments.",
    })
    .optional(),
);

const ingredientEditorItemSchema = z
  .object({
    id: z.string().trim().min(1),
    raw: z.string().trim().min(1, "Preserve the ingredient text."),
    quantity: optionalPositiveNumberInput,
    unit: optionalTextInput,
    item: optionalTextInput,
    preparation: optionalTextInput,
    optional: z.boolean(),
  })
  .strict();

const ingredientEditorSectionSchema = z
  .object({
    id: z.string().trim().min(1),
    title: optionalTextInput,
    itemsText: z.string().optional(),
    items: z.array(ingredientEditorItemSchema).optional(),
  })
  .refine((section) => getIngredientLines(section).length > 0, {
    message: "Add at least one ingredient.",
  })
  .strict();

const directionEditorStepSchema = z
  .object({
    id: z.string().trim().min(1),
    text: z.string().trim().min(1, "Add direction text."),
    timerMinutes: optionalNumberInput.pipe(
      z.number().int("Use whole minutes.").positive("Use a positive timer.").optional(),
    ),
    ingredientRefsText: z.string(),
  })
  .strict();

const directionEditorSectionSchema = z
  .object({
    id: z.string().trim().min(1),
    title: optionalTextInput,
    stepsText: z.string().optional(),
    steps: z.array(directionEditorStepSchema).optional(),
  })
  .refine((section) => getDirectionLines(section).length > 0, {
    message: "Add at least one step.",
  })
  .strict();

export const recipeEditorFormSchema = z
  .object({
    title: z.string().trim().min(1, "Add a recipe title."),
    description: optionalTextInput,
    imageUrl: optionalUrlInput,
    tagsText: z.string(),
    favorite: z.boolean(),
    rating: optionalRatingInput,
    prepMinutes: optionalMinutesInput,
    cookMinutes: optionalMinutesInput,
    totalMinutes: optionalMinutesInput,
    yieldQuantity: optionalPositiveNumberInput,
    yieldUnit: optionalTextInput,
    yieldNotes: optionalTextInput,
    notesText: z.string(),
    sourceType: recipeSourceTypeSchema.default("manual"),
    sourceName: optionalTextInput,
    sourceUrl: optionalUrlInput,
    ingredientSections: z
      .array(ingredientEditorSectionSchema)
      .min(1, "Add at least one ingredient section."),
    directionSections: z
      .array(directionEditorSectionSchema)
      .min(1, "Add at least one direction section."),
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

export function parseRecipeEditorIngredientRefs(
  ingredientRefsText: string,
): string[] | undefined {
  const refs = ingredientRefsText
    .split(",")
    .map((ref) => ref.trim())
    .filter(Boolean);

  return refs.length > 0 ? refs : undefined;
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
    favorite: values.favorite ? true : undefined,
    rating: values.rating,
    notes: parseRecipeEditorNotes(values.notesText),
    ingredients: values.ingredientSections.map((section) => ({
      id: section.id,
      title: section.title,
      items: getIngredientLines(section).map((item, itemIndex) => ({
        id: item.id || createRecipeEditorLineId("ingredient", item.raw, itemIndex),
        raw: item.raw,
        quantity: item.quantity,
        unit: item.unit,
        item: item.item ?? item.raw,
        preparation: item.preparation,
        optional: item.optional ? true : undefined,
      })),
    })),
    directions: values.directionSections.map((section) => ({
      id: section.id,
      title: section.title,
      steps: getDirectionLines(section).map((step, stepIndex) => ({
        id: step.id || createRecipeEditorLineId("step", step.text, stepIndex),
        order: stepIndex + 1,
        text: step.text,
        timerMinutes: step.timerMinutes,
        ingredientRefs: parseRecipeEditorIngredientRefs(step.ingredientRefsText),
      })),
    })),
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
      values.sourceName || values.sourceUrl || values.sourceType !== "manual"
        ? {
            type: values.sourceType,
            name: values.sourceName,
            url: values.sourceUrl,
          }
        : baseDraft.source,
  });

  return draft;
}

function getIngredientLines(section: {
  itemsText?: string;
  items?: Array<{
    id: string;
    raw: string;
    quantity?: number;
    unit?: string;
    item?: string;
    preparation?: string;
    optional: boolean;
  }>;
}): Array<{
  id: string;
  raw: string;
  quantity?: number;
  unit?: string;
  item?: string;
  preparation?: string;
  optional: boolean;
}> {
  const textLines = splitEditableLines(section.itemsText).map((raw) => ({
    id: "",
    raw,
    quantity: undefined,
    unit: undefined,
    item: raw,
    preparation: undefined,
    optional: false,
  }));

  if (textLines.length > 0) {
    return textLines;
  }

  return section.items ?? [];
}

function getDirectionLines(section: {
  stepsText?: string;
  steps?: Array<{
    id: string;
    text: string;
    timerMinutes?: number;
    ingredientRefsText: string;
  }>;
}): Array<{
  id: string;
  text: string;
  timerMinutes?: number;
  ingredientRefsText: string;
}> {
  const textLines = splitEditableLines(section.stepsText).map((text) => ({
    id: "",
    text: stripLeadingDirectionNumber(text),
    timerMinutes: undefined,
    ingredientRefsText: "",
  }));

  if (textLines.length > 0) {
    return textLines;
  }

  return section.steps ?? [];
}

function splitEditableLines(value: string | undefined): string[] {
  return (value ?? "")
    .split(/\n+/)
    .map((line) => line.trim())
    .filter(Boolean);
}

function stripLeadingDirectionNumber(text: string): string {
  return text.replace(/^\s*(?:step\s*)?\d+[).:-]?\s+/i, "").trim();
}

function createRecipeEditorLineId(prefix: string, line: string, index: number): string {
  return createRecipeSlug(`${prefix}-${line}`).slice(0, 64) || `${prefix}-${index + 1}`;
}
