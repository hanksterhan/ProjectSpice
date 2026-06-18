import { z } from "zod";

import { recipeDraftSchema } from "~/modules/recipe-domain";

export const builtInRecipeLenses = [
  {
    key: "lower-cal",
    label: "Lower-Cal",
    shortLabel: "Lower-Cal",
    description: "Trim calories; keep flavor.",
    sortOrder: 10,
  },
  {
    key: "glucose-conscious",
    label: "Glucose Conscious",
    shortLabel: "Glucose",
    description: "Blood glucose friendly.",
    sortOrder: 20,
  },
  {
    key: "quick",
    label: "Quick",
    shortLabel: "Quick",
    description: "Faster prep and cook time.",
    sortOrder: 30,
  },
  {
    key: "max-flavor",
    label: "Max Flavor",
    shortLabel: "Max Flavor",
    description: "Extra effort for flavor.",
    sortOrder: 40,
  },
] as const;

export const recipeLensKeySchema = z.enum([
  "lower-cal",
  "glucose-conscious",
  "quick",
  "max-flavor",
]);

export const recipeLensSchema = z
  .object({
    id: z.string().trim().min(1),
    recipeId: z.string().trim().min(1),
    lensKey: recipeLensKeySchema,
    notes: z.string().trim().min(1, "Add lens notes."),
    recipeDraft: recipeDraftSchema,
    createdAt: z.iso.datetime({ offset: true }),
    updatedAt: z.iso.datetime({ offset: true }),
  })
  .strict();

export const recipeLensInputSchema = recipeLensSchema.omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export const recipeLensSummarySchema = recipeLensSchema.omit({
  recipeDraft: true,
});

export type RecipeLensKey = z.infer<typeof recipeLensKeySchema>;
export type RecipeLens = z.infer<typeof recipeLensSchema>;
export type RecipeLensInput = z.input<typeof recipeLensInputSchema>;
export type RecipeLensSummary = z.infer<typeof recipeLensSummarySchema>;

export function getRecipeLensDefinition(lensKey: RecipeLensKey) {
  return builtInRecipeLenses.find((lens) => lens.key === lensKey);
}

export function getRecipeLensDetailPath(
  recipe: { id: string },
  lensKey: RecipeLensKey | "original" = "original",
): string {
  const basePath = `/recipes/${encodeURIComponent(recipe.id)}`;

  return lensKey === "original" ? basePath : `${basePath}?lens=${lensKey}`;
}

export function getRecipeLensEditPath(
  recipe: { id: string },
  lensKey: RecipeLensKey,
): string {
  return `/recipes/${encodeURIComponent(recipe.id)}/lenses/${lensKey}/edit`;
}
