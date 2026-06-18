import {
  recipeLensInputSchema,
  recipeLensKeySchema,
  recipeLensSchema,
  type RecipeLens,
  type RecipeLensInput,
  type RecipeLensKey,
} from "~/modules/recipe-lenses";

import { RecipeLensRepository } from "./recipe-lens.repo";

export type RecipeLensServiceRepository = Pick<
  RecipeLensRepository,
  "listByRecipeId" | "getByRecipeIdAndKey" | "upsert" | "delete"
>;

export class RecipeLensService {
  constructor(private readonly repository: RecipeLensServiceRepository) {}

  async listByRecipeId(recipeId: string): Promise<RecipeLens[]> {
    const lenses = await this.repository.listByRecipeId(recipeId);

    return lenses.map((lens) => recipeLensSchema.parse(lens));
  }

  async getByRecipeIdAndKey(
    recipeId: string,
    lensKey: RecipeLensKey,
  ): Promise<RecipeLens | null> {
    const parsedLensKey = recipeLensKeySchema.parse(lensKey);
    const lens = await this.repository.getByRecipeIdAndKey(recipeId, parsedLensKey);

    return lens ? recipeLensSchema.parse(lens) : null;
  }

  async upsert(input: RecipeLensInput, now: string): Promise<RecipeLens> {
    const parsedInput = recipeLensInputSchema.parse(input);
    const lens = await this.repository.upsert(parsedInput, now);

    return recipeLensSchema.parse(lens);
  }

  async delete(recipeId: string, lensKey: RecipeLensKey): Promise<boolean> {
    return this.repository.delete(recipeId, recipeLensKeySchema.parse(lensKey));
  }
}
