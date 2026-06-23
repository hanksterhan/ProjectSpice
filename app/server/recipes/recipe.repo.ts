import type {
  Recipe,
  RecipeSourceType,
  RecipeSummary,
} from "~/modules/recipe-domain";
import type {
  RecipeLibrarySort,
  RecipeLibrarySortDirection,
} from "~/modules/library/recipe-library";
import {
  createRecipeSlug,
  getCookCount,
  getLastCookedDate,
} from "~/modules/recipe-domain";

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

type RecipeSummaryRow = {
  id: string;
  title: string;
  description: string | null;
  image_url: string | null;
  source_type: RecipeSourceType | null;
  source_name: string | null;
  source_url: string | null;
  tags_json: string | string[];
  yield_quantity: number | null;
  yield_unit: string | null;
  yield_notes: string | null;
  prep_minutes: number | null;
  cook_minutes: number | null;
  total_minutes: number | null;
  favorite: boolean | number;
  rating: number | null;
  version: number;
  created_at: string;
  updated_at: string;
};

export type RecipeSummaryPageOptions = {
  direction: RecipeLibrarySortDirection;
  limit: number;
  offset: number;
  sort: RecipeLibrarySort;
};

type RecipeCountRow = {
  count: number;
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
          favorite,
          rating,
          cook_count,
          last_cooked_on,
          recipe_json,
          version,
          created_at,
          updated_at,
          deleted_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
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
        recipe.favorite === true ? 1 : 0,
        recipe.rating ?? null,
        getCookCount(recipe),
        getLastCookedDate(recipe) ?? null,
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

  async listSummaries(): Promise<RecipeSummary[]> {
    const result = await this.database
      .prepare(
        `SELECT
          id,
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
          favorite,
          rating,
          version,
          created_at,
          updated_at
        FROM recipes
        WHERE deleted_at IS NULL
        ORDER BY title COLLATE NOCASE ASC`,
      )
      .all<RecipeSummaryRow>();

    return result.results.map(rowToRecipeSummary);
  }

  async countSummaries(): Promise<number> {
    const row = await this.database
      .prepare(
        `SELECT COUNT(*) AS count
        FROM recipes
        WHERE deleted_at IS NULL`,
      )
      .first<RecipeCountRow>();

    return row?.count ?? 0;
  }

  async listSummaryPage(options: RecipeSummaryPageOptions): Promise<RecipeSummary[]> {
    const result = await this.database
      .prepare(
        `SELECT
          id,
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
          favorite,
          rating,
          version,
          created_at,
          updated_at
        FROM recipes
        WHERE deleted_at IS NULL
        ORDER BY ${getRecipeSummaryOrderBy(options)}
        LIMIT ? OFFSET ?`,
      )
      .bind(options.limit, options.offset)
      .all<RecipeSummaryRow>();

    return result.results.map(rowToRecipeSummary);
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

  async getManyByIds(ids: string[]): Promise<Recipe[]> {
    if (ids.length === 0) {
      return [];
    }

    const placeholders = ids.map(() => "?").join(", ");
    const result = await this.database
      .prepare(
        `SELECT recipe_json
        FROM recipes
        WHERE id IN (${placeholders}) AND deleted_at IS NULL`,
      )
      .bind(...ids)
      .all<RecipeRow>();

    return result.results.map(rowToRecipe);
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
          favorite = ?,
          rating = ?,
          cook_count = ?,
          last_cooked_on = ?,
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
        recipe.favorite === true ? 1 : 0,
        recipe.rating ?? null,
        getCookCount(recipe),
        getLastCookedDate(recipe) ?? null,
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

function getRecipeSummaryOrderBy(options: RecipeSummaryPageOptions): string {
  const direction = options.direction === "asc" ? "ASC" : "DESC";

  if (options.sort === "title") {
    return `title COLLATE NOCASE ${direction}, id ASC`;
  }

  if (options.sort === "time") {
    return `COALESCE(total_minutes, 2147483647) ${direction}, title COLLATE NOCASE ASC, id ASC`;
  }

  if (options.sort === "rating") {
    return `COALESCE(rating, -1) ${direction}, title COLLATE NOCASE ASC, id ASC`;
  }

  return `updated_at ${direction}, title COLLATE NOCASE ASC, id ASC`;
}

function toRecipeSummary(recipe: Recipe) {
  const titleSlug = createRecipeSlug(recipe.title);

  return {
    slug: titleSlug ? `${titleSlug}-${recipe.id}` : recipe.id,
  };
}

function rowToRecipe(row: RecipeRow): Recipe {
  return typeof row.recipe_json === "string"
    ? (JSON.parse(row.recipe_json) as Recipe)
    : row.recipe_json;
}

function rowToRecipeSummary(row: RecipeSummaryRow): RecipeSummary {
  return {
    id: row.id,
    title: row.title,
    ...(row.description ? { description: row.description } : {}),
    ...(row.image_url ? { imageUrl: row.image_url } : {}),
    ...(row.source_type
      ? {
          source: {
            type: row.source_type,
            ...(row.source_name ? { name: row.source_name } : {}),
            ...(row.source_url ? { url: row.source_url } : {}),
          },
        }
      : {}),
    tags: parseTags(row.tags_json),
    ...(row.yield_quantity || row.yield_unit || row.yield_notes
      ? {
          yield: {
            ...(row.yield_quantity ? { quantity: row.yield_quantity } : {}),
            ...(row.yield_unit ? { unit: row.yield_unit } : {}),
            ...(row.yield_notes ? { notes: row.yield_notes } : {}),
          },
        }
      : {}),
    ...(row.prep_minutes || row.cook_minutes || row.total_minutes
      ? {
          times: {
            ...(row.prep_minutes ? { prepMinutes: row.prep_minutes } : {}),
            ...(row.cook_minutes ? { cookMinutes: row.cook_minutes } : {}),
            ...(row.total_minutes ? { totalMinutes: row.total_minutes } : {}),
          },
        }
      : {}),
    ...(row.favorite ? { favorite: true } : {}),
    ...(row.rating !== null ? { rating: row.rating } : {}),
    version: row.version,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function parseTags(value: string | string[]): string[] {
  return typeof value === "string" ? (JSON.parse(value) as string[]) : value;
}
