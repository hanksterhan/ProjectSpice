import type { z } from "zod";

import type {
  directionSectionSchema,
  directionStepSchema,
  ingredientItemSchema,
  ingredientSectionSchema,
  recipeDraftSchema,
  recipeSchema,
  recipeSourceSchema,
  recipeSourceTypeSchema,
  recipeRatingSchema,
  recipeTimesSchema,
  recipeYieldSchema,
} from "./recipe.schema";

export type RecipeSourceType = z.infer<typeof recipeSourceTypeSchema>;
export type RecipeYield = z.infer<typeof recipeYieldSchema>;
export type RecipeTimes = z.infer<typeof recipeTimesSchema>;
export type RecipeSource = z.infer<typeof recipeSourceSchema>;
export type RecipeRating = z.infer<typeof recipeRatingSchema>;
export type IngredientItem = z.infer<typeof ingredientItemSchema>;
export type IngredientSection = z.infer<typeof ingredientSectionSchema>;
export type DirectionStep = z.infer<typeof directionStepSchema>;
export type DirectionSection = z.infer<typeof directionSectionSchema>;
export type Recipe = z.infer<typeof recipeSchema>;
export type RecipeDraft = z.infer<typeof recipeDraftSchema>;
export type RecipeInput = z.input<typeof recipeSchema>;
export type RecipeDraftInput = z.input<typeof recipeDraftSchema>;
