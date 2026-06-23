import type { Recipe, RecipeSummary } from "~/modules/recipe-domain";
import {
  getCloudflareRuntimeContext,
  type RuntimeLoadContext,
} from "~/server/runtime-context";

import {
  RecipeRepository,
  type RecipeRepositoryDatabase,
  type RecipeSummaryPageOptions,
} from "./recipe.repo";
import { RecipeVersionConflictError } from "./recipe.repo";
import { RecipeService, type RecipeServiceRepository } from "./recipe.service";

type MaybeD1Env = Record<string, unknown> & {
  DB?: RecipeRepositoryDatabase;
  ENVIRONMENT?: string;
  RECIPE_DB?: RecipeRepositoryDatabase;
  PROJECTSPICE_RECIPE_STORAGE?: string;
};

let memoryRepository: MemoryRecipeRepository | undefined;
const developmentSeedPromises = new WeakMap<object, Promise<void>>();

export function getRecipeService(context: RuntimeLoadContext): RecipeService {
  const database = getBoundRecipeDatabase(context);

  if (database) {
    const repository = new RecipeRepository(database);

    if (shouldSeedDevelopmentRecipeDatabase(context)) {
      return new RecipeService(new DevelopmentSeedRecipeRepository(database, repository));
    }

    return new RecipeService(repository);
  }

  assertCanUseMemoryRecipeStorage(context);
  memoryRepository ??= new MemoryRecipeRepository();

  return new RecipeService(
    shouldSeedDevelopmentRecipeDatabase(context)
      ? new DevelopmentSeedRecipeRepository(memoryRepository, memoryRepository)
      : memoryRepository,
  );
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

function shouldSeedDevelopmentRecipeDatabase(context: RuntimeLoadContext): boolean {
  const env = getCloudflareRuntimeContext(context).env as unknown as MaybeD1Env;
  const environment = env.ENVIRONMENT ?? process.env.ENVIRONMENT;

  return environment === "development";
}

function assertCanUseMemoryRecipeStorage(context: RuntimeLoadContext): void {
  const env = getCloudflareRuntimeContext(context).env as unknown as MaybeD1Env;
  const environment = env.ENVIRONMENT ?? process.env.ENVIRONMENT;

  if (environment !== "development") {
    throw new Error(
      "Recipe persistence is not configured. Bind RECIPE_DB before running outside development.",
    );
  }
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

  constructor(initialRecipes: readonly Recipe[] = []) {
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

  async listSummaries(): Promise<RecipeSummary[]> {
    return (await this.list()).map(toRecipeSummary);
  }

  async countSummaries(): Promise<number> {
    return (await this.listSummaries()).length;
  }

  async listSummaryPage(options: RecipeSummaryPageOptions): Promise<RecipeSummary[]> {
    return (await this.listSummaries())
      .sort((firstRecipe, secondRecipe) =>
        compareRecipeSummaries(firstRecipe, secondRecipe, options),
      )
      .slice(options.offset, options.offset + options.limit);
  }

  async getById(id: string): Promise<Recipe | null> {
    if (this.deletedRecipeIds.has(id)) {
      return null;
    }

    const recipe = this.recipes.get(id);

    return recipe ? cloneRecipe(recipe) : null;
  }

  async getManyByIds(ids: string[]): Promise<Recipe[]> {
    const idSet = new Set(ids);

    return [...this.recipes.values()]
      .filter((recipe) => idSet.has(recipe.id) && !this.deletedRecipeIds.has(recipe.id))
      .map(cloneRecipe);
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

class DevelopmentSeedRecipeRepository implements RecipeServiceRepository {
  constructor(
    private readonly seedKey: object,
    private readonly repository: RecipeServiceRepository,
  ) {}

  async create(recipe: Recipe): Promise<Recipe> {
    await this.ensureSeeded();

    return this.repository.create(recipe);
  }

  async list(): Promise<Recipe[]> {
    await this.ensureSeeded();

    return this.repository.list();
  }

  async listSummaries(): Promise<RecipeSummary[]> {
    await this.ensureSeeded();

    return this.repository.listSummaries();
  }

  async countSummaries(): Promise<number> {
    await this.ensureSeeded();

    return this.repository.countSummaries();
  }

  async listSummaryPage(options: RecipeSummaryPageOptions): Promise<RecipeSummary[]> {
    await this.ensureSeeded();

    return this.repository.listSummaryPage(options);
  }

  async getById(id: string): Promise<Recipe | null> {
    await this.ensureSeeded();

    return this.repository.getById(id);
  }

  async getManyByIds(ids: string[]): Promise<Recipe[]> {
    await this.ensureSeeded();

    return this.repository.getManyByIds(ids);
  }

  async update(recipe: Recipe, expectedVersion: number): Promise<Recipe> {
    await this.ensureSeeded();

    return this.repository.update(recipe, expectedVersion);
  }

  async recordVersion(recipe: Recipe, changeSummary?: string): Promise<void> {
    return this.repository.recordVersion(recipe, changeSummary);
  }

  async softDelete(id: string, deletedAt: string): Promise<boolean> {
    await this.ensureSeeded();

    return this.repository.softDelete(id, deletedAt);
  }

  private ensureSeeded(): Promise<void> {
    let seedPromise = developmentSeedPromises.get(this.seedKey);

    if (!seedPromise) {
      seedPromise = seedMissingRecipes(this.repository).catch((error: unknown) => {
        developmentSeedPromises.delete(this.seedKey);
        throw error;
      });
      developmentSeedPromises.set(this.seedKey, seedPromise);
    }

    return seedPromise;
  }
}

async function seedMissingRecipes(repository: RecipeServiceRepository): Promise<void> {
  const { seedRecipes } = await import("~/modules/recipe-domain/seed-recipes.fixtures");
  const existingRecipeIds = new Set(
    (await repository.listSummaries()).map((recipe) => recipe.id),
  );

  for (const recipe of seedRecipes) {
    if (!existingRecipeIds.has(recipe.id)) {
      await repository.create(recipe);
    }
  }
}

function cloneRecipe(recipe: Recipe): Recipe {
  return JSON.parse(JSON.stringify(recipe)) as Recipe;
}

function compareRecipeSummaries(
  firstRecipe: RecipeSummary,
  secondRecipe: RecipeSummary,
  options: RecipeSummaryPageOptions,
): number {
  const multiplier = options.direction === "asc" ? 1 : -1;

  if (options.sort === "title") {
    return firstRecipe.title.localeCompare(secondRecipe.title) * multiplier;
  }

  if (options.sort === "time") {
    return (
      ((firstRecipe.times?.totalMinutes ?? Number.MAX_SAFE_INTEGER) -
        (secondRecipe.times?.totalMinutes ?? Number.MAX_SAFE_INTEGER)) *
      multiplier
    );
  }

  if (options.sort === "rating") {
    return ((firstRecipe.rating ?? -1) - (secondRecipe.rating ?? -1)) * multiplier;
  }

  return firstRecipe.updatedAt.localeCompare(secondRecipe.updatedAt) * multiplier;
}

function toRecipeSummary(recipe: Recipe): RecipeSummary {
  return {
    id: recipe.id,
    title: recipe.title,
    ...(recipe.description ? { description: recipe.description } : {}),
    ...(recipe.yield ? { yield: recipe.yield } : {}),
    ...(recipe.times ? { times: recipe.times } : {}),
    ...(recipe.imageUrl ? { imageUrl: recipe.imageUrl } : {}),
    ...(recipe.source ? { source: recipe.source } : {}),
    tags: [...recipe.tags],
    ...(recipe.favorite ? { favorite: recipe.favorite } : {}),
    ...(recipe.rating !== undefined ? { rating: recipe.rating } : {}),
    version: recipe.version,
    createdAt: recipe.createdAt,
    updatedAt: recipe.updatedAt,
  };
}
