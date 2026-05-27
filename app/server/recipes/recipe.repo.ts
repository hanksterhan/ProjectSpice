import type { Recipe } from "~/modules/recipe-domain";
import { createRecipeSlug } from "~/modules/recipe-domain";

export type RecipeRepositoryStatement = {
  bind(...values: unknown[]): RecipeRepositoryStatement;
  run(): Promise<{ meta: { changes: number } }>;
  first<T>(): Promise<T | null>;
  all<T>(): Promise<{ results: T[] }>;
};

export type RecipeRepositoryDatabase = {
  prepare(query: string): RecipeRepositoryStatement;
};

export class RecipeVersionConflictError extends Error {
  constructor(recipeId: string, expectedVersion: number) {
    super(`Recipe ${recipeId} was not at version ${expectedVersion}.`);
    this.name = "RecipeVersionConflictError";
  }
}

type RecipeRow = {
  recipe_json: string | Recipe;
};

export class RecipeRepository {
  constructor(private readonly database: RecipeRepositoryDatabase) {}

  async create(recipe: Recipe): Promise<Recipe> {
    const summary = toRecipeSummary(recipe);

    await this.database
      .prepare(
        `INSERT INTO recipes (
          id,
          slug,
          title,
          description,
          image_url,
          source_type,
          source_name,
          source_url,
          tags_json,
          yield_quantity,
          yield_unit,
          yield_notes,
          prep_minutes,
          cook_minutes,
          total_minutes,
          recipe_json,
          version,
          created_at,
          updated_at,
          deleted_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .bind(
        recipe.id,
        summary.slug,
        recipe.title,
        recipe.description ?? null,
        recipe.imageUrl ?? null,
        recipe.source?.type ?? null,
        recipe.source?.name ?? null,
        recipe.source?.url ?? null,
        JSON.stringify(recipe.tags),
        recipe.yield?.quantity ?? null,
        recipe.yield?.unit ?? null,
        recipe.yield?.notes ?? null,
        recipe.times?.prepMinutes ?? null,
        recipe.times?.cookMinutes ?? null,
        recipe.times?.totalMinutes ?? null,
        JSON.stringify(recipe),
        recipe.version,
        recipe.createdAt,
        recipe.updatedAt,
        null,
      )
      .run();

    return recipe;
  }

  async list(): Promise<Recipe[]> {
    const result = await this.database
      .prepare(
        `SELECT recipe_json
        FROM recipes
        WHERE deleted_at IS NULL
        ORDER BY title COLLATE NOCASE ASC`,
      )
      .all<RecipeRow>();

    return result.results.map(rowToRecipe);
  }

  async getById(id: string): Promise<Recipe | null> {
    const row = await this.database
      .prepare(
        `SELECT recipe_json
        FROM recipes
        WHERE id = ? AND deleted_at IS NULL
        LIMIT 1`,
      )
      .bind(id)
      .first<RecipeRow>();

    return row ? rowToRecipe(row) : null;
  }

  async update(recipe: Recipe, expectedVersion: number): Promise<Recipe> {
    const summary = toRecipeSummary(recipe);
    const result = await this.database
      .prepare(
        `UPDATE recipes
        SET
          slug = ?,
          title = ?,
          description = ?,
          image_url = ?,
          source_type = ?,
          source_name = ?,
          source_url = ?,
          tags_json = ?,
          yield_quantity = ?,
          yield_unit = ?,
          yield_notes = ?,
          prep_minutes = ?,
          cook_minutes = ?,
          total_minutes = ?,
          recipe_json = ?,
          version = ?,
          updated_at = ?
        WHERE id = ? AND version = ? AND deleted_at IS NULL`,
      )
      .bind(
        summary.slug,
        recipe.title,
        recipe.description ?? null,
        recipe.imageUrl ?? null,
        recipe.source?.type ?? null,
        recipe.source?.name ?? null,
        recipe.source?.url ?? null,
        JSON.stringify(recipe.tags),
        recipe.yield?.quantity ?? null,
        recipe.yield?.unit ?? null,
        recipe.yield?.notes ?? null,
        recipe.times?.prepMinutes ?? null,
        recipe.times?.cookMinutes ?? null,
        recipe.times?.totalMinutes ?? null,
        JSON.stringify(recipe),
        recipe.version,
        recipe.updatedAt,
        recipe.id,
        expectedVersion,
      )
      .run();

    if (result.meta.changes !== 1) {
      throw new RecipeVersionConflictError(recipe.id, expectedVersion);
    }

    return recipe;
  }

  async recordVersion(recipe: Recipe, changeSummary?: string): Promise<void> {
    await this.database
      .prepare(
        `INSERT INTO recipe_versions (
          id,
          recipe_id,
          version,
          recipe_json,
          change_summary,
          created_at
        ) VALUES (?, ?, ?, ?, ?, ?)`,
      )
      .bind(
        `${recipe.id}:v${recipe.version}`,
        recipe.id,
        recipe.version,
        JSON.stringify(recipe),
        changeSummary ?? null,
        recipe.updatedAt,
      )
      .run();
  }

  async softDelete(id: string, deletedAt: string): Promise<boolean> {
    const result = await this.database
      .prepare(
        `UPDATE recipes
        SET deleted_at = ?, updated_at = ?
        WHERE id = ? AND deleted_at IS NULL`,
      )
      .bind(deletedAt, deletedAt, id)
      .run();

    return result.meta.changes === 1;
  }
}

function toRecipeSummary(recipe: Recipe) {
  return {
    slug: createRecipeSlug(recipe.title) || recipe.id,
  };
}

function rowToRecipe(row: RecipeRow): Recipe {
  return typeof row.recipe_json === "string"
    ? (JSON.parse(row.recipe_json) as Recipe)
    : row.recipe_json;
}
