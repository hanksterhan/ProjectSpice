import { seedRecipes, type Recipe } from "~/modules/recipe-domain";
import {
  getCloudflareRuntimeContext,
  type RuntimeLoadContext,
} from "~/server/runtime-context";

import { RecipeRepository, type RecipeRepositoryDatabase } from "./recipe.repo";
import { RecipeVersionConflictError } from "./recipe.repo";
import { RecipeService, type RecipeServiceRepository } from "./recipe.service";

type MaybeD1Env = Record<string, unknown> & {
  DB?: RecipeRepositoryDatabase;
  RECIPE_DB?: RecipeRepositoryDatabase;
  PROJECTSPICE_RECIPE_STORAGE?: string;
};

let memoryRepository: MemoryRecipeRepository | undefined;

export function getRecipeService(context: RuntimeLoadContext): RecipeService {
  const database = getBoundRecipeDatabase(context);

  if (database) {
    return new RecipeService(new RecipeRepository(database));
  }

  memoryRepository ??= new MemoryRecipeRepository(seedRecipes);

  return new RecipeService(memoryRepository);
}

function getBoundRecipeDatabase(
  context: RuntimeLoadContext,
): RecipeRepositoryDatabase | undefined {
  const env = getCloudflareRuntimeContext(context).env as unknown as MaybeD1Env;

  if (
    env.PROJECTSPICE_RECIPE_STORAGE === "memory" ||
    process.env.PROJECTSPICE_RECIPE_STORAGE === "memory"
  ) {
    return undefined;
  }

  return env.RECIPE_DB ?? env.DB;
}

class MemoryRecipeRepository implements RecipeServiceRepository {
  private readonly recipes = new Map<string, Recipe>();
  readonly versions: Array<{
    recipeId: string;
    version: number;
    recipe: Recipe;
    changeSummary: string | null;
  }> = [];
  private readonly deletedRecipeIds = new Set<string>();

  constructor(initialRecipes: readonly Recipe[]) {
    initialRecipes.forEach((recipe) => {
      this.recipes.set(recipe.id, cloneRecipe(recipe));
    });
  }

  async create(recipe: Recipe): Promise<Recipe> {
    this.recipes.set(recipe.id, cloneRecipe(recipe));
    this.deletedRecipeIds.delete(recipe.id);

    return cloneRecipe(recipe);
  }

  async list(): Promise<Recipe[]> {
    return [...this.recipes.values()]
      .filter((recipe) => !this.deletedRecipeIds.has(recipe.id))
      .sort((firstRecipe, secondRecipe) =>
        firstRecipe.title.localeCompare(secondRecipe.title),
      )
      .map(cloneRecipe);
  }

  async getById(id: string): Promise<Recipe | null> {
    if (this.deletedRecipeIds.has(id)) {
      return null;
    }

    const recipe = this.recipes.get(id);

    return recipe ? cloneRecipe(recipe) : null;
  }

  async update(recipe: Recipe, expectedVersion: number): Promise<Recipe> {
    const currentRecipe = await this.getById(recipe.id);

    if (!currentRecipe || currentRecipe.version !== expectedVersion) {
      throw new RecipeVersionConflictError(recipe.id, expectedVersion);
    }

    this.recipes.set(recipe.id, cloneRecipe(recipe));

    return cloneRecipe(recipe);
  }

  async recordVersion(recipe: Recipe, changeSummary?: string): Promise<void> {
    this.versions.push({
      recipeId: recipe.id,
      version: recipe.version,
      recipe: cloneRecipe(recipe),
      changeSummary: changeSummary ?? null,
    });
  }

  async softDelete(id: string, _deletedAt: string): Promise<boolean> {
    const recipe = await this.getById(id);

    if (!recipe) {
      return false;
    }

    this.deletedRecipeIds.add(id);

    return true;
  }
}

function cloneRecipe(recipe: Recipe): Recipe {
  return JSON.parse(JSON.stringify(recipe)) as Recipe;
}
