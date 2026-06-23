import {
  recipeSchema,
  recipeSummarySchema,
  type Recipe,
  type RecipeInput,
  type RecipeSummary,
} from "~/modules/recipe-domain";
import {
  getRecipeLibraryPage,
  getRecipeLibraryResults,
  getRecipeLibrarySlice,
  recipeLibraryPageSize,
  type RecipeLibraryPage,
  type RecipeLibraryQuery,
  type RecipeLibrarySlice,
} from "~/modules/library/recipe-library";

import {
  RecipeRepository,
  RecipeVersionConflictError,
} from "./recipe.repo";

export type RecipeServiceRepository = Pick<
  RecipeRepository,
  | "create"
  | "countSummaries"
  | "list"
  | "listSummaryPage"
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

  async getLibraryPage(query: RecipeLibraryQuery): Promise<RecipeLibraryPage> {
    if (canUseSummaryPageQuery(query)) {
      const totalCount = await this.repository.countSummaries();
      const visibleCount = Math.min(totalCount, (query.page ?? 1) * recipeLibraryPageSize);
      const recipes = await this.repository.listSummaryPage({
        direction: query.direction,
        limit: visibleCount,
        offset: 0,
        sort: query.sort,
      });

      return {
        hasMore: visibleCount < totalCount,
        recipes: recipes.map((recipe) => recipeSummarySchema.parse(recipe)),
        totalCount,
        visibleCount,
      };
    }

    const recipes = getRecipeLibraryResults(await this.listSummaries(), query);

    return getRecipeLibraryPage(recipes, query);
  }

  async getLibrarySlice(query: RecipeLibraryQuery): Promise<RecipeLibrarySlice> {
    const page = query.page ?? 1;

    if (canUseSummaryPageQuery(query)) {
      const totalCount = await this.repository.countSummaries();
      const visibleCount = Math.min(totalCount, page * recipeLibraryPageSize);
      const recipes = await this.repository.listSummaryPage({
        direction: query.direction,
        limit: recipeLibraryPageSize,
        offset: (page - 1) * recipeLibraryPageSize,
        sort: query.sort,
      });

      return {
        hasMore: visibleCount < totalCount,
        page,
        recipes: recipes.map((recipe) => recipeSummarySchema.parse(recipe)),
        totalCount,
        visibleCount,
      };
    }

    const recipes = getRecipeLibraryResults(await this.listSummaries(), query);

    return getRecipeLibrarySlice(recipes, query);
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

function canUseSummaryPageQuery(query: RecipeLibraryQuery): boolean {
  return (
    query.q === "" &&
    query.tags.length === 0 &&
    query.chapters.length === 0 &&
    query.cookbooks.length === 0 &&
    query.sources.length === 0 &&
    query.websites.length === 0 &&
    !query.favorite &&
    !query.topRated
  );
}
