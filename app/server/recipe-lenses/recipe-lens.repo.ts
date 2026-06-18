import type {
  RecipeLens,
  RecipeLensInput,
  RecipeLensKey,
  RecipeLensSummary,
} from "~/modules/recipe-lenses";

export type RecipeLensRepositoryStatement = {
  bind(...values: unknown[]): RecipeLensRepositoryStatement;
  run(): Promise<{ meta: { changes: number } }>;
  first<T>(): Promise<T | null>;
  all<T>(): Promise<{ results: T[] }>;
};

export type RecipeLensRepositoryDatabase = {
  prepare(query: string): RecipeLensRepositoryStatement;
};

type RecipeLensRow = {
  id: string;
  recipe_id: string;
  lens_key: RecipeLensKey;
  notes: string;
  recipe_draft_json: string | RecipeLens["recipeDraft"];
  created_at: string;
  updated_at: string;
};

type RecipeLensSummaryRow = Omit<RecipeLensRow, "recipe_draft_json">;

export class RecipeLensRepository {
  constructor(private readonly database: RecipeLensRepositoryDatabase) {}

  async listByRecipeId(recipeId: string): Promise<RecipeLens[]> {
    const result = await this.database
      .prepare(
        `SELECT
          id,
          recipe_id,
          lens_key,
          notes,
          recipe_draft_json,
          created_at,
          updated_at
        FROM recipe_lenses
        WHERE recipe_id = ?
        ORDER BY lens_key ASC`,
      )
      .bind(recipeId)
      .all<RecipeLensRow>();

    return result.results.map(rowToRecipeLens);
  }

  async listSummariesByRecipeId(recipeId: string): Promise<RecipeLensSummary[]> {
    const result = await this.database
      .prepare(
        `SELECT
          id,
          recipe_id,
          lens_key,
          notes,
          created_at,
          updated_at
        FROM recipe_lenses
        WHERE recipe_id = ?
        ORDER BY lens_key ASC`,
      )
      .bind(recipeId)
      .all<RecipeLensSummaryRow>();

    return result.results.map(rowToRecipeLensSummary);
  }

  async getByRecipeIdAndKey(
    recipeId: string,
    lensKey: RecipeLensKey,
  ): Promise<RecipeLens | null> {
    const row = await this.database
      .prepare(
        `SELECT
          id,
          recipe_id,
          lens_key,
          notes,
          recipe_draft_json,
          created_at,
          updated_at
        FROM recipe_lenses
        WHERE recipe_id = ? AND lens_key = ?
        LIMIT 1`,
      )
      .bind(recipeId, lensKey)
      .first<RecipeLensRow>();

    return row ? rowToRecipeLens(row) : null;
  }

  async upsert(input: RecipeLensInput, now: string): Promise<RecipeLens> {
    const existing = await this.getByRecipeIdAndKey(input.recipeId, input.lensKey);
    const lens: RecipeLens = {
      ...input,
      id: existing?.id ?? `${input.recipeId}:${input.lensKey}`,
      createdAt: existing?.createdAt ?? now,
      updatedAt: now,
    };

    await this.database
      .prepare(
        `INSERT INTO recipe_lenses (
          id,
          recipe_id,
          lens_key,
          notes,
          recipe_draft_json,
          created_at,
          updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(recipe_id, lens_key) DO UPDATE SET
          notes = excluded.notes,
          recipe_draft_json = excluded.recipe_draft_json,
          updated_at = excluded.updated_at`,
      )
      .bind(
        lens.id,
        lens.recipeId,
        lens.lensKey,
        lens.notes,
        JSON.stringify(lens.recipeDraft),
        lens.createdAt,
        lens.updatedAt,
      )
      .run();

    return lens;
  }

  async delete(recipeId: string, lensKey: RecipeLensKey): Promise<boolean> {
    const result = await this.database
      .prepare(
        `DELETE FROM recipe_lenses
        WHERE recipe_id = ? AND lens_key = ?`,
      )
      .bind(recipeId, lensKey)
      .run();

    return result.meta.changes === 1;
  }
}

function rowToRecipeLensSummary(row: RecipeLensSummaryRow): RecipeLensSummary {
  return {
    id: row.id,
    recipeId: row.recipe_id,
    lensKey: row.lens_key,
    notes: row.notes,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function rowToRecipeLens(row: RecipeLensRow): RecipeLens {
  return {
    id: row.id,
    recipeId: row.recipe_id,
    lensKey: row.lens_key,
    notes: row.notes,
    recipeDraft:
      typeof row.recipe_draft_json === "string"
        ? JSON.parse(row.recipe_draft_json)
        : row.recipe_draft_json,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}
