import type { RecipeDraft } from "~/modules/recipe-domain";
import type {
  RecipeLens,
  RecipeLensInput,
  RecipeLensKey,
  RecipeLensSummary,
} from "~/modules/recipe-lenses";
import {
  getCloudflareRuntimeContext,
  type RuntimeLoadContext,
} from "~/server/runtime-context";

import {
  RecipeLensRepository,
  type RecipeLensRepositoryDatabase,
} from "./recipe-lens.repo";
import {
  RecipeLensService,
  type RecipeLensServiceRepository,
} from "./recipe-lens.service";

type MaybeD1Env = Record<string, unknown> & {
  DB?: RecipeLensRepositoryDatabase;
  ENVIRONMENT?: string;
  RECIPE_DB?: RecipeLensRepositoryDatabase;
  PROJECTSPICE_RECIPE_STORAGE?: string;
};

let memoryRepository: MemoryRecipeLensRepository | undefined;

export function getRecipeLensService(
  context: RuntimeLoadContext,
): RecipeLensService {
  const database = getBoundRecipeDatabase(context);

  if (database) {
    return new RecipeLensService(new RecipeLensRepository(database));
  }

  assertCanUseMemoryRecipeStorage(context);
  memoryRepository ??= new MemoryRecipeLensRepository();

  return new RecipeLensService(memoryRepository);
}

function getBoundRecipeDatabase(
  context: RuntimeLoadContext,
): RecipeLensRepositoryDatabase | undefined {
  const env = getCloudflareRuntimeContext(context).env as unknown as MaybeD1Env;

  if (
    env.PROJECTSPICE_RECIPE_STORAGE === "memory" ||
    process.env.PROJECTSPICE_RECIPE_STORAGE === "memory"
  ) {
    return undefined;
  }

  return env.RECIPE_DB ?? env.DB;
}

function assertCanUseMemoryRecipeStorage(context: RuntimeLoadContext): void {
  const env = getCloudflareRuntimeContext(context).env as unknown as MaybeD1Env;
  const environment = env.ENVIRONMENT ?? process.env.ENVIRONMENT;

  if (environment !== "development") {
    throw new Error(
      "Recipe lens persistence is not configured. Bind RECIPE_DB before running outside development.",
    );
  }
}

class MemoryRecipeLensRepository implements RecipeLensServiceRepository {
  private readonly lenses = new Map<string, RecipeLens>();

  async listByRecipeId(recipeId: string): Promise<RecipeLens[]> {
    return [...this.lenses.values()]
      .filter((lens) => lens.recipeId === recipeId)
      .map(cloneLens);
  }

  async listSummariesByRecipeId(recipeId: string): Promise<RecipeLensSummary[]> {
    return [...this.lenses.values()]
      .filter((lens) => lens.recipeId === recipeId)
      .map(toLensSummary);
  }

  async getByRecipeIdAndKey(
    recipeId: string,
    lensKey: RecipeLensKey,
  ): Promise<RecipeLens | null> {
    const lens = this.lenses.get(getLensMapKey(recipeId, lensKey));

    return lens ? cloneLens(lens) : null;
  }

  async upsert(input: RecipeLensInput, now: string): Promise<RecipeLens> {
    const mapKey = getLensMapKey(input.recipeId, input.lensKey);
    const existing = this.lenses.get(mapKey);
    const lens: RecipeLens = {
      ...input,
      id: existing?.id ?? `${input.recipeId}:${input.lensKey}`,
      createdAt: existing?.createdAt ?? now,
      updatedAt: now,
    };

    this.lenses.set(mapKey, cloneLens(lens));

    return cloneLens(lens);
  }

  async delete(recipeId: string, lensKey: RecipeLensKey): Promise<boolean> {
    return this.lenses.delete(getLensMapKey(recipeId, lensKey));
  }
}

function getLensMapKey(recipeId: string, lensKey: RecipeLensKey): string {
  return `${recipeId}:${lensKey}`;
}

function cloneLens(lens: RecipeLens): RecipeLens {
  return {
    ...lens,
    recipeDraft: JSON.parse(JSON.stringify(lens.recipeDraft)) as RecipeDraft,
  };
}

function toLensSummary(lens: RecipeLens): RecipeLensSummary {
  return {
    id: lens.id,
    recipeId: lens.recipeId,
    lensKey: lens.lensKey,
    notes: lens.notes,
    createdAt: lens.createdAt,
    updatedAt: lens.updatedAt,
  };
}
