import { describe, expect, it } from "vitest";

import { validRecipeFixture } from "~/modules/recipe-domain";
import type { Recipe } from "~/modules/recipe-domain";

import { getRecipeService } from "../recipe.runtime";
import type {
  RecipeRepositoryDatabase,
  RecipeRepositoryStatement,
} from "../recipe.repo";

describe("recipe runtime persistence", () => {
  it("uses a bound D1 recipe database in development", async () => {
    const database = new RuntimeFakeRecipeD1Database();
    const service = getRecipeService(createRuntimeContext("development", database));
    const recipe = {
      ...validRecipeFixture,
      id: "runtime-persisted-recipe",
      title: "Runtime Persisted Recipe",
    };

    await service.create(recipe);

    expect(database.rows.get(recipe.id)).toMatchObject({
      title: "Runtime Persisted Recipe",
    });
    expect(await service.getById(recipe.id)).toMatchObject({
      id: recipe.id,
      title: "Runtime Persisted Recipe",
    });
  });

  it("seeds missing development fixture recipes into a bound D1 database", async () => {
    const database = new RuntimeFakeRecipeD1Database();
    const service = getRecipeService(createRuntimeContext("development", database));

    await service.list();

    expect(database.rows.size).toBeGreaterThan(800);
    expect(database.rows.get("classic-sundae-bombe")).toMatchObject({
      title: "Classic Sundae Bombe",
    });
  });

  it("does not fall back to memory storage outside development", () => {
    expect(() => getRecipeService(createRuntimeContext("production"))).toThrow(
      "Recipe persistence is not configured. Bind RECIPE_DB before running outside development.",
    );
  });
});

function createRuntimeContext(
  environment: string,
  database?: RecipeRepositoryDatabase,
) {
  return {
    cloudflare: {
      ctx: {},
      env: {
        ENVIRONMENT: environment,
        ...(database ? { RECIPE_DB: database } : {}),
      },
    },
  };
}

class RuntimeFakeRecipeD1Database implements RecipeRepositoryDatabase {
  readonly rows = new Map<string, Recipe>();

  prepare(query: string): RecipeRepositoryStatement {
    return new RuntimeFakeRecipeD1PreparedStatement(this, query);
  }
}

class RuntimeFakeRecipeD1PreparedStatement implements RecipeRepositoryStatement {
  private values: unknown[] = [];

  constructor(
    private readonly database: RuntimeFakeRecipeD1Database,
    private readonly query: string,
  ) {}

  bind(...values: unknown[]): RecipeRepositoryStatement {
    this.values = values;

    return this;
  }

  async run(): Promise<{ meta: { changes: number } }> {
    const normalizedQuery = normalizeSql(this.query);

    if (normalizedQuery.startsWith("INSERT INTO recipes")) {
      const recipe = JSON.parse(String(this.values[19])) as Recipe;
      this.database.rows.set(recipe.id, recipe);

      return { meta: { changes: 1 } };
    }

    throw new Error(`Unhandled fake D1 run query: ${normalizedQuery}`);
  }

  async first<T>(): Promise<T | null> {
    const normalizedQuery = normalizeSql(this.query);

    if (normalizedQuery.startsWith("SELECT recipe_json FROM recipes WHERE id")) {
      const recipe = this.database.rows.get(String(this.values[0]));

      return recipe ? ({ recipe_json: JSON.stringify(recipe) } as T) : null;
    }

    throw new Error(`Unhandled fake D1 first query: ${normalizedQuery}`);
  }

  async all<T>(): Promise<{ results: T[] }> {
    const normalizedQuery = normalizeSql(this.query);

    if (normalizedQuery.startsWith("SELECT recipe_json FROM recipes WHERE deleted_at")) {
      return {
        results: [...this.database.rows.values()]
          .sort((firstRecipe, secondRecipe) =>
            firstRecipe.title.localeCompare(secondRecipe.title),
          )
          .map((recipe) => ({ recipe_json: JSON.stringify(recipe) })) as T[],
      };
    }

    if (normalizedQuery.startsWith("SELECT id, title, description")) {
      return {
        results: [...this.database.rows.values()]
          .sort((firstRecipe, secondRecipe) =>
            firstRecipe.title.localeCompare(secondRecipe.title),
          )
          .map(recipeToSummaryRow) as T[],
      };
    }

    if (normalizedQuery.startsWith("SELECT recipe_json FROM recipes WHERE id IN")) {
      const ids = new Set(this.values.map(String));

      return {
        results: [...this.database.rows.values()]
          .filter((recipe) => ids.has(recipe.id))
          .map((recipe) => ({ recipe_json: JSON.stringify(recipe) })) as T[],
      };
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
