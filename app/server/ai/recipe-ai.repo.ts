import type { RecipeDraft } from "~/modules/recipe-domain";

import type { AiRunOperation, AiRunStatus } from "../db/schema";

export type RecipeAiRunRepositoryStatement = {
  bind(...values: unknown[]): RecipeAiRunRepositoryStatement;
  run(): Promise<{ meta: { changes: number } }>;
};

export type RecipeAiRunRepositoryDatabase = {
  prepare(query: string): RecipeAiRunRepositoryStatement;
};

export type RecipeAiRunRecord = {
  id: string;
  recipeId?: string;
  operation: AiRunOperation;
  provider: string;
  model: string;
  prompt: Record<string, unknown>;
  response?: Record<string, unknown>;
  draftRecipe?: RecipeDraft;
  status: AiRunStatus;
  error?: string;
  changeSummary?: string[];
  createdAt: string;
};

export class RecipeAiRunRepository {
  constructor(private readonly database: RecipeAiRunRepositoryDatabase) {}

  async record(run: RecipeAiRunRecord): Promise<void> {
    await this.database
      .prepare(
        `INSERT INTO ai_runs (
          id,
          recipe_id,
          operation,
          provider,
          model,
          prompt_json,
          response_json,
          draft_recipe_json,
          status,
          error,
          change_summary,
          created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .bind(
        run.id,
        run.recipeId ?? null,
        run.operation,
        run.provider,
        run.model,
        JSON.stringify(run.prompt),
        run.response ? JSON.stringify(run.response) : null,
        run.draftRecipe ? JSON.stringify(run.draftRecipe) : null,
        run.status,
        run.error ?? null,
        run.changeSummary ? JSON.stringify(run.changeSummary) : null,
        run.createdAt,
      )
      .run();
  }
}
