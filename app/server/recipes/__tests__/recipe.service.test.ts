import { describe, expect, it, vi } from "vitest";
import { ZodError } from "zod";

import {
  validRecipeFixture,
  validRecipeWithoutImageFixture,
  type Recipe,
  type RecipeInput,
} from "~/modules/recipe-domain";

import {
  RecipeService,
  type RecipeServiceRepository,
} from "../recipe.service";
import { RecipeVersionConflictError } from "../recipe.repo";

describe("RecipeService", () => {
  it("validates recipe input before create", async () => {
    const repository = createRepositoryDouble();
    const service = new RecipeService(repository);
    const invalidRecipe = {
      ...validRecipeFixture,
      ingredients: [],
    } as unknown as RecipeInput;

    await expect(service.create(invalidRecipe)).rejects.toBeInstanceOf(ZodError);
    expect(repository.create).not.toHaveBeenCalled();
  });

  it("validates repository output on create", async () => {
    const repository = createRepositoryDouble({
      create: async () =>
        ({
          ...validRecipeFixture,
          directions: [],
        }) as Recipe,
    });
    const service = new RecipeService(repository);

    await expect(service.create(validRecipeFixture)).rejects.toBeInstanceOf(
      ZodError,
    );
  });

  it("validates list and get outputs through recipe-domain", async () => {
    const repository = createRepositoryDouble();
    const service = new RecipeService(repository);

    expect(await service.list()).toEqual([validRecipeFixture]);
    expect(await service.listSummaries()).toEqual([
      {
        id: validRecipeFixture.id,
        title: validRecipeFixture.title,
        description: validRecipeFixture.description,
        yield: validRecipeFixture.yield,
        times: validRecipeFixture.times,
        imageUrl: validRecipeFixture.imageUrl,
        source: validRecipeFixture.source,
        tags: validRecipeFixture.tags,
        version: validRecipeFixture.version,
        createdAt: validRecipeFixture.createdAt,
        updatedAt: validRecipeFixture.updatedAt,
      },
    ]);
    expect(await service.getById(validRecipeFixture.id)).toEqual(validRecipeFixture);
    expect(await service.getManyByIds([validRecipeFixture.id])).toEqual([
      validRecipeFixture,
    ]);
    expect(repository.list).toHaveBeenCalledOnce();
    expect(repository.listSummaries).toHaveBeenCalledOnce();
    expect(repository.getById).toHaveBeenCalledWith(validRecipeFixture.id);
    expect(repository.getManyByIds).toHaveBeenCalledWith([validRecipeFixture.id]);
  });

  it("updates with expected version and records the updated version", async () => {
    const updatedRecipe: Recipe = {
      ...validRecipeWithoutImageFixture,
      imageUrl: "https://images.example.com/chilled-dessert.jpg",
      version: 2,
      updatedAt: "2026-05-27T10:00:00.000Z",
    };
    const update = vi.fn(async () => updatedRecipe);
    const repository = createRepositoryDouble({
      update,
    });
    const service = new RecipeService(repository);

    await expect(
      service.update(updatedRecipe, 1, "Added image URL"),
    ).resolves.toEqual(updatedRecipe);
    expect(update).toHaveBeenCalledWith(updatedRecipe, 1);
    expect(repository.recordVersion).toHaveBeenCalledWith(
      updatedRecipe,
      "Added image URL",
    );
  });

  it("rejects stale version writes and does not record a version", async () => {
    const repository = createRepositoryDouble({
      update: async () => {
        throw new RecipeVersionConflictError(validRecipeFixture.id, 99);
      },
    });
    const service = new RecipeService(repository);

    await expect(service.update(validRecipeFixture, 99)).rejects.toBeInstanceOf(
      RecipeVersionConflictError,
    );
    expect(repository.recordVersion).not.toHaveBeenCalled();
  });
});

function createRepositoryDouble(
  overrides: Partial<RecipeServiceRepository> = {},
): RecipeServiceRepository {
  return {
    create: vi.fn(async (recipe: Recipe) => recipe),
    list: vi.fn(async () => [validRecipeFixture]),
    listSummaries: vi.fn(async () => [
      {
        id: validRecipeFixture.id,
        title: validRecipeFixture.title,
        description: validRecipeFixture.description,
        yield: validRecipeFixture.yield,
        times: validRecipeFixture.times,
        imageUrl: validRecipeFixture.imageUrl,
        source: validRecipeFixture.source,
        tags: validRecipeFixture.tags,
        version: validRecipeFixture.version,
        createdAt: validRecipeFixture.createdAt,
        updatedAt: validRecipeFixture.updatedAt,
      },
    ]),
    getById: vi.fn(async () => validRecipeFixture),
    getManyByIds: vi.fn(async () => [validRecipeFixture]),
    update: vi.fn(async (recipe: Recipe) => recipe),
    recordVersion: vi.fn(async () => undefined),
    softDelete: vi.fn(async () => true),
    ...overrides,
  };
}
