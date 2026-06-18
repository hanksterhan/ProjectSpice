import { z } from "zod";

const optionalTrimmedTextSchema = z
  .string()
  .trim()
  .min(1)
  .optional();

const requiredTrimmedTextSchema = z.string().trim().min(1);

const recipeIdSchema = requiredTrimmedTextSchema;

const dateOnlySchema = z.iso.date();

export const recipeSourceTypeSchema = z.enum([
  "manual",
  "ai",
  "imported",
  "scraped",
]);

export const recipeYieldSchema = z
  .object({
    quantity: z.number().positive().optional(),
    unit: optionalTrimmedTextSchema,
    notes: optionalTrimmedTextSchema,
  })
  .strict();

export const recipeTimesSchema = z
  .object({
    prepMinutes: z.number().int().nonnegative().optional(),
    cookMinutes: z.number().int().nonnegative().optional(),
    totalMinutes: z.number().int().nonnegative().optional(),
  })
  .strict();

export const recipeRatingSchema = z
  .number()
  .min(0, "Rating cannot be below 0.")
  .max(10, "Rating cannot be above 10.")
  .refine((value) => Math.abs(value * 10 - Math.round(value * 10)) < 0.000001, {
    message: "Rating must use 0.1 granularity.",
  });

export const recipeSourceSchema = z
  .object({
    type: recipeSourceTypeSchema,
    name: optionalTrimmedTextSchema,
    url: z.url().optional(),
  })
  .strict();

export const recipeCookHistoryEntrySchema = z
  .object({
    cookedOn: dateOnlySchema,
    lensKey: requiredTrimmedTextSchema,
    lensName: requiredTrimmedTextSchema,
    note: optionalTrimmedTextSchema,
    recipeVersion: z.number().int().positive().optional(),
    createdAt: z.iso.datetime({ offset: true }),
  })
  .strict();

export const ingredientItemSchema = z
  .object({
    id: recipeIdSchema,
    raw: requiredTrimmedTextSchema,
    quantity: z.number().positive().optional(),
    unit: optionalTrimmedTextSchema,
    item: requiredTrimmedTextSchema,
    preparation: optionalTrimmedTextSchema,
    optional: z.boolean().optional(),
  })
  .strict();

export const ingredientSectionSchema = z
  .object({
    id: recipeIdSchema,
    title: optionalTrimmedTextSchema,
    items: z.array(ingredientItemSchema).min(1),
  })
  .strict();

export const directionStepSchema = z
  .object({
    id: recipeIdSchema,
    order: z.number().int().positive(),
    text: requiredTrimmedTextSchema,
    timerMinutes: z.number().int().positive().optional(),
    ingredientRefs: z.array(recipeIdSchema).optional(),
  })
  .strict();

export const directionSectionSchema = z
  .object({
    id: recipeIdSchema,
    title: optionalTrimmedTextSchema,
    steps: z.array(directionStepSchema).min(1),
  })
  .strict();

export const recipeSchema = z
  .object({
    id: recipeIdSchema,
    title: requiredTrimmedTextSchema,
    description: optionalTrimmedTextSchema,
    yield: recipeYieldSchema.optional(),
    times: recipeTimesSchema.optional(),
    imageUrl: z.url().optional(),
    ingredients: z.array(ingredientSectionSchema).min(1),
    directions: z.array(directionSectionSchema).min(1),
    notes: z.array(requiredTrimmedTextSchema).optional(),
    source: recipeSourceSchema.optional(),
    tags: z.array(requiredTrimmedTextSchema),
    favorite: z.boolean().optional(),
    rating: recipeRatingSchema.optional(),
    cookedDates: z.array(dateOnlySchema).optional(),
    cookHistory: z.array(recipeCookHistoryEntrySchema).optional(),
    version: z.number().int().positive(),
    createdAt: z.iso.datetime({ offset: true }),
    updatedAt: z.iso.datetime({ offset: true }),
  })
  .strict();

export const recipeSummarySchema = recipeSchema.pick({
  id: true,
  title: true,
  description: true,
  yield: true,
  times: true,
  imageUrl: true,
  source: true,
  tags: true,
  favorite: true,
  rating: true,
  version: true,
  createdAt: true,
  updatedAt: true,
});

export const recipeDraftSchema = recipeSchema.omit({
  id: true,
  version: true,
  createdAt: true,
  updatedAt: true,
});
