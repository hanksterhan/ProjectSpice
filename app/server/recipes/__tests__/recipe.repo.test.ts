import { describe, expect, it } from "vitest";

import {
  validRecipeFixture,
  validRecipeWithoutImageFixture,
} from "~/modules/recipe-domain";
import type { Recipe } from "~/modules/recipe-domain";

import {
  RecipeRepository,
  RecipeVersionConflictError,
  type RecipeRepositoryDatabase,
} from "../recipe.repo";

describe("RecipeRepository", () => {
  it("creates, lists, and gets recipes by id", async () => {
    const repository = new RecipeRepository(new FakeRecipeD1Database());

    await repository.create(validRecipeFixture);
    await repository.create({
      ...validRecipeWithoutImageFixture,
      id: "lemony-white-bean-toasts",
      title: "Lemony White Bean Toasts",
    });

    expect((await repository.list()).map((recipe) => recipe.title)).toEqual([
      "Lemony White Bean Toasts",
      "Weeknight Sesame Chicken Bowls",
    ]);
    expect((await repository.listSummaries()).map((recipe) => recipe.title)).toEqual([
      "Lemony White Bean Toasts",
      "Weeknight Sesame Chicken Bowls",
    ]);
    expect(await repository.getManyByIds([validRecipeFixture.id])).toEqual([
      validRecipeFixture,
    ]);
    expect(await repository.getById(validRecipeFixture.id)).toMatchObject({
      id: validRecipeFixture.id,
      title: validRecipeFixture.title,
    });
  });

  it("creates duplicate recipe titles without slug collisions", async () => {
    const repository = new RecipeRepository(new FakeRecipeD1Database());

    await repository.create({
      ...validRecipeFixture,
      id: "first-chocolate-cake",
      title: "Chocolate Cake",
    });
    await repository.create({
      ...validRecipeWithoutImageFixture,
      id: "second-chocolate-cake",
      title: "Chocolate Cake",
    });

    expect((await repository.list()).map((recipe) => recipe.id)).toEqual([
      "first-chocolate-cake",
      "second-chocolate-cake",
    ]);
  });


  it("persists optional image URLs on create and update", async () => {
    const repository = new RecipeRepository(new FakeRecipeD1Database());
    await repository.create(validRecipeWithoutImageFixture);

    expect(await repository.getById(validRecipeWithoutImageFixture.id)).not.toHaveProperty(
      "imageUrl",
    );

    const updatedRecipe: Recipe = {
      ...validRecipeWithoutImageFixture,
      imageUrl: "https://images.example.com/updated-dessert.jpg",
      version: 2,
      updatedAt: "2026-05-27T08:00:00.000Z",
    };

    await repository.update(updatedRecipe, 1);

    expect(await repository.getById(updatedRecipe.id)).toMatchObject({
      imageUrl: "https://images.example.com/updated-dessert.jpg",
      version: 2,
    });
  });

  it("updates only when the expected version matches", async () => {
    const repository = new RecipeRepository(new FakeRecipeD1Database());
    await repository.create(validRecipeFixture);

    const updatedRecipe: Recipe = {
      ...validRecipeFixture,
      title: "Updated Sesame Chicken Bowls",
      version: 2,
      updatedAt: "2026-05-27T08:00:00.000Z",
    };

    await expect(repository.update(updatedRecipe, 99)).rejects.toBeInstanceOf(
      RecipeVersionConflictError,
    );

    expect(await repository.getById(validRecipeFixture.id)).toMatchObject({
      title: "Weeknight Sesame Chicken Bowls",
      version: 1,
    });

    await repository.update(updatedRecipe, 1);

    expect(await repository.getById(validRecipeFixture.id)).toMatchObject({
      title: "Updated Sesame Chicken Bowls",
      version: 2,
    });
  });

  it("records recipe versions with change summaries", async () => {
    const database = new FakeRecipeD1Database();
    const repository = new RecipeRepository(database);
    const updatedRecipe: Recipe = {
      ...validRecipeFixture,
      version: 2,
      updatedAt: "2026-05-27T08:00:00.000Z",
    };

    await repository.recordVersion(updatedRecipe, "Updated timing");

    expect(database.versions).toEqual([
      {
        id: "weeknight-sesame-chicken-bowls:v2",
        recipeId: "weeknight-sesame-chicken-bowls",
        version: 2,
        recipe: updatedRecipe,
        changeSummary: "Updated timing",
        createdAt: "2026-05-27T08:00:00.000Z",
      },
    ]);
  });

  it("soft deletes recipes from list and get queries", async () => {
    const repository = new RecipeRepository(new FakeRecipeD1Database());
    await repository.create(validRecipeFixture);

    expect(await repository.softDelete(validRecipeFixture.id, "2026-05-27T09:00:00.000Z")).toBe(
      true,
    );
    expect(await repository.softDelete(validRecipeFixture.id, "2026-05-27T09:00:00.000Z")).toBe(
      false,
    );
    expect(await repository.getById(validRecipeFixture.id)).toBeNull();
    expect(await repository.list()).toEqual([]);
  });
});

type FakeRecipeRow = {
  recipe: Recipe;
  version: number;
  deletedAt: string | null;
};

class FakeRecipeD1Database implements RecipeRepositoryDatabase {
  readonly rows = new Map<string, FakeRecipeRow>();
  readonly slugs = new Set<string>();
  readonly versions: Array<{
    id: string;
    recipeId: string;
    version: number;
    recipe: Recipe;
    changeSummary: string | null;
    createdAt: string;
  }> = [];

  prepare(query: string) {
    return new FakeRecipeD1PreparedStatement(this, query);
  }
}

class FakeRecipeD1PreparedStatement {
  private values: unknown[] = [];

  constructor(
    private readonly database: FakeRecipeD1Database,
    private readonly query: string,
  ) {}

  bind(...values: unknown[]) {
    this.values = values;
    return this;
  }

  async run() {
    const normalizedQuery = normalizeSql(this.query);

    if (normalizedQuery.startsWith("INSERT INTO recipes")) {
      const recipe = JSON.parse(String(this.values[19])) as Recipe;
      const slug = String(this.values[1]);

      if (this.database.slugs.has(slug)) {
        throw new Error(`UNIQUE constraint failed: recipes.slug (${slug})`);
      }

      this.database.slugs.add(slug);
      this.database.rows.set(recipe.id, {
        recipe,
        version: recipe.version,
        deletedAt: null,
      });

      return { meta: { changes: 1 } };
    }

    if (normalizedQuery.startsWith("UPDATE recipes SET slug")) {
      const recipe = JSON.parse(String(this.values[18])) as Recipe;
      const id = String(this.values[21]);
      const expectedVersion = Number(this.values[22]);
      const row = this.database.rows.get(id);

      if (!row || row.deletedAt || row.version !== expectedVersion) {
        return { meta: { changes: 0 } };
      }

      this.database.rows.set(id, {
        recipe,
        version: recipe.version,
        deletedAt: null,
      });

      return { meta: { changes: 1 } };
    }

    if (normalizedQuery.startsWith("UPDATE recipes SET deleted_at")) {
      const deletedAt = String(this.values[0]);
      const id = String(this.values[2]);
      const row = this.database.rows.get(id);

      if (!row || row.deletedAt) {
        return { meta: { changes: 0 } };
      }

      this.database.rows.set(id, {
        ...row,
        deletedAt,
        recipe: {
          ...row.recipe,
          updatedAt: deletedAt,
        },
      });

      return { meta: { changes: 1 } };
    }

    if (normalizedQuery.startsWith("INSERT INTO recipe_versions")) {
      this.database.versions.push({
        id: String(this.values[0]),
        recipeId: String(this.values[1]),
        version: Number(this.values[2]),
        recipe: JSON.parse(String(this.values[3])) as Recipe,
        changeSummary:
          typeof this.values[4] === "string" ? String(this.values[4]) : null,
        createdAt: String(this.values[5]),
      });

      return { meta: { changes: 1 } };
    }

    throw new Error(`Unhandled fake D1 run query: ${normalizedQuery}`);
  }

  async first<T>() {
    const normalizedQuery = normalizeSql(this.query);

    if (normalizedQuery.startsWith("SELECT recipe_json FROM recipes WHERE id")) {
      const id = String(this.values[0]);
      const row = this.database.rows.get(id);

      if (!row || row.deletedAt) {
        return null;
      }

      return { recipe_json: JSON.stringify(row.recipe) } as T;
    }

    throw new Error(`Unhandled fake D1 first query: ${normalizedQuery}`);
  }

  async all<T>() {
    const normalizedQuery = normalizeSql(this.query);

    if (normalizedQuery.startsWith("SELECT recipe_json FROM recipes WHERE deleted_at")) {
      const results = [...this.database.rows.values()]
        .filter((row) => !row.deletedAt)
        .sort((firstRow, secondRow) =>
          firstRow.recipe.title.localeCompare(secondRow.recipe.title),
        )
        .map((row) => ({ recipe_json: JSON.stringify(row.recipe) }));

      return { results } as T;
    }

    if (normalizedQuery.startsWith("SELECT id, title, description")) {
      const results = [...this.database.rows.values()]
        .filter((row) => !row.deletedAt)
        .sort((firstRow, secondRow) =>
          firstRow.recipe.title.localeCompare(secondRow.recipe.title),
        )
        .map((row) => recipeToSummaryRow(row.recipe));

      return { results } as T;
    }

    if (normalizedQuery.startsWith("SELECT recipe_json FROM recipes WHERE id IN")) {
      const ids = new Set(this.values.map(String));
      const results = [...this.database.rows.values()]
        .filter((row) => ids.has(row.recipe.id) && !row.deletedAt)
        .map((row) => ({ recipe_json: JSON.stringify(row.recipe) }));

      return { results } as T;
    }

    throw new Error(`Unhandled fake D1 all query: ${normalizedQuery}`);
  }
}

function recipeToSummaryRow(recipe: Recipe) {
  return {
    id: recipe.id,
    title: recipe.title,
    description: recipe.description ?? null,
    image_url: recipe.imageUrl ?? null,
    source_type: recipe.source?.type ?? null,
    source_name: recipe.source?.name ?? null,
    source_url: recipe.source?.url ?? null,
    tags_json: JSON.stringify(recipe.tags),
    yield_quantity: recipe.yield?.quantity ?? null,
    yield_unit: recipe.yield?.unit ?? null,
    yield_notes: recipe.yield?.notes ?? null,
    prep_minutes: recipe.times?.prepMinutes ?? null,
    cook_minutes: recipe.times?.cookMinutes ?? null,
    total_minutes: recipe.times?.totalMinutes ?? null,
    favorite: recipe.favorite === true ? 1 : 0,
    rating: recipe.rating ?? null,
    version: recipe.version,
    created_at: recipe.createdAt,
    updated_at: recipe.updatedAt,
  };
}

function normalizeSql(query: string): string {
  return query.replace(/\s+/g, " ").trim();
}
