import { describe, expect, it, vi } from "vitest";
import { ZodError } from "zod";

import { validRecipeDraftFixture } from "~/modules/recipe-domain";
import type { RecipeLens } from "~/modules/recipe-lenses";

import {
  RecipeLensService,
  type RecipeLensServiceRepository,
} from "../recipe-lens.service";

const validLens: RecipeLens = {
  id: "weeknight-sesame-chicken-bowls:quick",
  recipeId: "weeknight-sesame-chicken-bowls",
  lensKey: "quick",
  notes: "Uses one pan and trims inactive time.",
  recipeDraft: validRecipeDraftFixture,
  createdAt: "2026-06-18T08:00:00.000Z",
  updatedAt: "2026-06-18T08:00:00.000Z",
};

describe("RecipeLensService", () => {
  it("validates repository output", async () => {
    const service = new RecipeLensService(
      createRepositoryDouble({
        listByRecipeId: vi.fn(async () => [
          {
            ...validLens,
            recipeDraft: {
              ...validLens.recipeDraft,
              directions: [],
            },
          } as RecipeLens,
        ]),
      }),
    );

    await expect(service.listByRecipeId(validLens.recipeId)).rejects.toBeInstanceOf(
      ZodError,
    );
  });

  it("upserts and deletes known built-in lens keys", async () => {
    const repository = createRepositoryDouble();
    const service = new RecipeLensService(repository);

    await expect(
      service.upsert(
        {
          recipeId: validLens.recipeId,
          lensKey: "quick",
          notes: validLens.notes,
          recipeDraft: validLens.recipeDraft,
        },
        validLens.updatedAt,
      ),
    ).resolves.toEqual(validLens);

    expect(repository.upsert).toHaveBeenCalledWith(
      {
        recipeId: validLens.recipeId,
        lensKey: "quick",
        notes: validLens.notes,
        recipeDraft: validLens.recipeDraft,
      },
      validLens.updatedAt,
    );
    expect(await service.delete(validLens.recipeId, "quick")).toBe(true);
  });
});

function createRepositoryDouble(
  overrides: Partial<RecipeLensServiceRepository> = {},
): RecipeLensServiceRepository {
  return {
    listByRecipeId: vi.fn(async () => [validLens]),
    listSummariesByRecipeId: vi.fn(async () => [
      {
        id: validLens.id,
        recipeId: validLens.recipeId,
        lensKey: validLens.lensKey,
        notes: validLens.notes,
        createdAt: validLens.createdAt,
        updatedAt: validLens.updatedAt,
      },
    ]),
    getByRecipeIdAndKey: vi.fn(async () => validLens),
    upsert: vi.fn(async () => validLens),
    delete: vi.fn(async () => true),
    ...overrides,
  };
}
