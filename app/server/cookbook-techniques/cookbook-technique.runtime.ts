import {
  getCloudflareRuntimeContext,
  type RuntimeLoadContext,
} from "~/server/runtime-context";

import {
  CookbookTechniqueRepository,
  type CookbookTechniqueRepositoryDatabase,
} from "./cookbook-technique.repo";
import { CookbookTechniqueService } from "./cookbook-technique.service";

type MaybeD1Env = Record<string, unknown> & {
  DB?: CookbookTechniqueRepositoryDatabase;
  RECIPE_DB?: CookbookTechniqueRepositoryDatabase;
};

export function getCookbookTechniqueService(
  context: RuntimeLoadContext,
): CookbookTechniqueService {
  const env = getCloudflareRuntimeContext(context).env as unknown as MaybeD1Env;
  const database = env.RECIPE_DB ?? env.DB;

  if (!database) {
    throw new Error("Technique persistence is not configured. Bind RECIPE_DB.");
  }

  return new CookbookTechniqueService(new CookbookTechniqueRepository(database));
}
