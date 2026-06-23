import { z } from "zod";

import { recipeDraftSchema } from "~/modules/recipe-domain";

export const builtInRecipeLenses = [
  {
    key: "lower-cal",
    label: "Lower-Cal",
    shortLabel: "Lower-Cal",
    description: "Reduce estimated calories while keeping the recipe satisfying.",
    promptAliases: [
      "lower calorie",
      "lower-calorie",
      "low calorie",
      "calorie conscious",
      "calorie-conscious",
    ],
    goals: [
      "Reduce calorie-dense ingredients such as added sugar, butter, oil, cream, cheese, nuts, or oversized portions when they are meaningful drivers.",
      "Keep the recipe recognizable and satisfying through seasoning, texture, acidity, aromatics, or portion-aware serving suggestions.",
      "Prefer changes that are practical for a home cook over specialty diet products unless the user asks for them.",
    ],
    successCriteria: [
      "Aim for at least a 20% estimated calorie reduction when the original recipe allows it.",
      "Call out the ingredient or portion changes most responsible for the calorie reduction.",
      "If the recipe cannot become meaningfully lower-calorie without becoming a different dish, say so in the notes or change summary.",
    ],
    caution:
      "Do not claim exact calories unless nutrition data was provided or calculated by a dedicated nutrition tool.",
    sortOrder: 10,
  },
  {
    key: "glucose-conscious",
    label: "Glucose Conscious",
    shortLabel: "Glucose",
    description: "Reduce glucose impact without making medical claims.",
    promptAliases: [
      "blood glucose",
      "blood sugar",
      "diabetic",
      "diabetes",
      "glycemic",
      "glucose conscious",
      "glucose-conscious",
    ],
    goals: [
      "Reduce added sugar and refined starch load when they are meaningful drivers.",
      "Improve balance with fiber, protein, fat, acidity, nuts, seeds, legumes, vegetables, or smaller portions when appropriate.",
      "Keep the dish recognizable instead of turning dessert or bread recipes into unrelated foods.",
    ],
    successCriteria: [
      "Aim for at least a 40% added-sugar reduction when added sugar is present.",
      "Prefer lower-glycemic structure over simply calling a high-carb recipe glucose friendly.",
      "Include a plain-language caveat when the transformed recipe remains carb-heavy.",
    ],
    caution:
      "Do not describe the result as safe for diabetes or blood-glucose friendly; use reduced-sugar, glucose-aware, or glucose-conscious language.",
    sortOrder: 20,
  },
  {
    key: "quick",
    label: "Quick",
    shortLabel: "Quick",
    description: "Faster prep and cook time.",
    promptAliases: ["fast", "faster", "quick", "weeknight"],
    goals: [
      "Reduce active time, waiting time, or cleanup while preserving the recipe's core appeal.",
      "Simplify steps and combine compatible tasks where quality loss is acceptable.",
    ],
    successCriteria: [
      "Call out the timing tradeoff compared with the original.",
      "Avoid removing necessary food-safety, proofing, cooling, or doneness checks.",
    ],
    caution:
      "Do not imply the faster version is identical to the original when time savings reduce texture, flavor, or keeping quality.",
    sortOrder: 30,
  },
  {
    key: "max-flavor",
    label: "Max Flavor",
    shortLabel: "Max Flavor",
    description: "Extra effort for flavor.",
    promptAliases: ["maximum flavor", "max flavor", "more flavor", "best flavor"],
    goals: [
      "Use additional technique, seasoning, browning, resting, fermentation, layering, or finishing touches to deepen flavor.",
      "Keep the effort purposeful and explain what each extra step improves.",
    ],
    successCriteria: [
      "Call out the biggest flavor upgrades.",
      "Preserve practical home-cooking constraints unless the user asks for a restaurant-style project.",
    ],
    caution:
      "Do not optimize for calories, speed, or simplicity unless the user asks for those tradeoffs alongside flavor.",
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

export function findRecipeLensDefinitionInText(text: string) {
  const normalizedText = text.toLowerCase();

  return builtInRecipeLenses.find((lens) => {
    const searchTerms = [
      lens.key,
      lens.label,
      lens.shortLabel,
      ...lens.promptAliases,
    ].map((term) => term.toLowerCase());

    return searchTerms.some((term) => normalizedText.includes(term));
  });
}

export function formatRecipeLensPromptGuidance(text: string): string | null {
  const lens = findRecipeLensDefinitionInText(text);

  if (!lens) {
    return null;
  }

  return [
    `Detected recipe lens: ${lens.label}.`,
    "Lens goals:",
    ...lens.goals.map((goal) => `- ${goal}`),
    "Lens success criteria:",
    ...lens.successCriteria.map((criterion) => `- ${criterion}`),
    "Lens caution:",
    `- ${lens.caution}`,
  ].join("\n");
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
