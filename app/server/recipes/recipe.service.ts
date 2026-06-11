import {
  recipeSchema,
  recipeSummarySchema,
  type Recipe,
  type RecipeInput,
  type RecipeSummary,
} from "~/modules/recipe-domain";

import {
  RecipeRepository,
  RecipeVersionConflictError,
} from "./recipe.repo";

export type RecipeServiceRepository = Pick<
  RecipeRepository,
  | "create"
  | "list"
  | "listSummaries"
  | "getById"
  | "getManyByIds"
  | "update"
  | "recordVersion"
  | "softDelete"
>;

export class RecipeService {
  constructor(private readonly repository: RecipeServiceRepository) {}

  async create(input: RecipeInput): Promise<Recipe> {
    const recipe = recipeSchema.parse(input);
    const createdRecipe = await this.repository.create(recipe);

    return recipeSchema.parse(createdRecipe);
  }

  async list(): Promise<Recipe[]> {
    const recipes = await this.repository.list();

    return recipes.map((recipe) => recipeSchema.parse(recipe));
  }

  async listSummaries(): Promise<RecipeSummary[]> {
    const recipes = await this.repository.listSummaries();

    return recipes.map((recipe) => recipeSummarySchema.parse(recipe));
  }

  async getById(id: string): Promise<Recipe | null> {
    const recipe = await this.repository.getById(id);

    return recipe ? recipeSchema.parse(recipe) : null;
  }

  async getManyByIds(ids: string[]): Promise<Recipe[]> {
    const recipes = await this.repository.getManyByIds(ids);

    return recipes.map((recipe) => recipeSchema.parse(recipe));
  }

  async update(
    input: RecipeInput,
    expectedVersion: number,
    changeSummary?: string,
  ): Promise<Recipe> {
    const recipe = recipeSchema.parse(input);
    const updatedRecipe = recipeSchema.parse(
      await this.repository.update(recipe, expectedVersion),
    );

    await this.repository.recordVersion(updatedRecipe, changeSummary);

    return updatedRecipe;
  }

  async softDelete(id: string, deletedAt: string): Promise<boolean> {
    return this.repository.softDelete(id, deletedAt);
  }
}

export { RecipeVersionConflictError };
