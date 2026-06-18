import { describe, expect, it } from "vitest";

import { validRecipeDraftFixture } from "~/modules/recipe-domain";
import type { RecipeLens, RecipeLensKey } from "~/modules/recipe-lenses";

import {
  RecipeLensRepository,
  type RecipeLensRepositoryDatabase,
} from "../recipe-lens.repo";

describe("RecipeLensRepository", () => {
  it("upserts, lists, gets, and deletes recipe lenses", async () => {
    const repository = new RecipeLensRepository(new FakeRecipeLensD1Database());
    const now = "2026-06-18T08:00:00.000Z";

    await repository.upsert(
      {
        recipeId: "weeknight-sesame-chicken-bowls",
        lensKey: "quick",
        notes: "Uses one pan and trims inactive time.",
        recipeDraft: validRecipeDraftFixture,
      },
      now,
    );

    expect(await repository.listByRecipeId("weeknight-sesame-chicken-bowls")).toHaveLength(1);
    expect(await repository.listSummariesByRecipeId("weeknight-sesame-chicken-bowls")).toEqual([
      {
        id: "weeknight-sesame-chicken-bowls:quick",
        recipeId: "weeknight-sesame-chicken-bowls",
        lensKey: "quick",
        notes: "Uses one pan and trims inactive time.",
        createdAt: now,
        updatedAt: now,
      },
    ]);
    expect(
      await repository.getByRecipeIdAndKey("weeknight-sesame-chicken-bowls", "quick"),
    ).toMatchObject({
      lensKey: "quick",
      notes: "Uses one pan and trims inactive time.",
    });

    await repository.upsert(
      {
        recipeId: "weeknight-sesame-chicken-bowls",
        lensKey: "quick",
        notes: "Updated quick lens.",
        recipeDraft: {
          ...validRecipeDraftFixture,
          title: "Quick Sesame Chicken Bowls",
        },
      },
      "2026-06-18T09:00:00.000Z",
    );

    expect(await repository.listByRecipeId("weeknight-sesame-chicken-bowls")).toHaveLength(1);
    expect(
      await repository.getByRecipeIdAndKey("weeknight-sesame-chicken-bowls", "quick"),
    ).toMatchObject({
      notes: "Updated quick lens.",
      recipeDraft: { title: "Quick Sesame Chicken Bowls" },
      createdAt: now,
      updatedAt: "2026-06-18T09:00:00.000Z",
    });

    expect(await repository.delete("weeknight-sesame-chicken-bowls", "quick")).toBe(true);
    expect(await repository.delete("weeknight-sesame-chicken-bowls", "quick")).toBe(false);
    expect(await repository.listByRecipeId("weeknight-sesame-chicken-bowls")).toEqual([]);
  });
});

class FakeRecipeLensD1Database implements RecipeLensRepositoryDatabase {
  readonly lenses = new Map<string, RecipeLens>();

  prepare(query: string) {
    return new FakeRecipeLensD1PreparedStatement(this, query);
  }
}

class FakeRecipeLensD1PreparedStatement {
  private values: unknown[] = [];

  constructor(
    private readonly database: FakeRecipeLensD1Database,
    private readonly query: string,
  ) {}

  bind(...values: unknown[]) {
    this.values = values;
    return this;
  }

  async run() {
    const normalizedQuery = normalizeSql(this.query);

    if (normalizedQuery.startsWith("INSERT INTO recipe_lenses")) {
      const lens: RecipeLens = {
        id: String(this.values[0]),
        recipeId: String(this.values[1]),
        lensKey: this.values[2] as RecipeLensKey,
        notes: String(this.values[3]),
        recipeDraft: JSON.parse(String(this.values[4])),
        createdAt: String(this.values[5]),
        updatedAt: String(this.values[6]),
      };
      const mapKey = getMapKey(lens.recipeId, lens.lensKey);
      const existing = this.database.lenses.get(mapKey);

      this.database.lenses.set(mapKey, {
        ...lens,
        id: existing?.id ?? lens.id,
        createdAt: existing?.createdAt ?? lens.createdAt,
      });

      return { meta: { changes: 1 } };
    }

    if (normalizedQuery.startsWith("DELETE FROM recipe_lenses")) {
      const deleted = this.database.lenses.delete(
        getMapKey(String(this.values[0]), this.values[1] as RecipeLensKey),
      );

      return { meta: { changes: deleted ? 1 : 0 } };
    }

    throw new Error(`Unhandled fake D1 run query: ${normalizedQuery}`);
  }

  async first<T>() {
    const normalizedQuery = normalizeSql(this.query);

    if (
      normalizedQuery.startsWith("SELECT id, recipe_id") &&
      normalizedQuery.includes("recipe_draft_json")
    ) {
      const lens = this.database.lenses.get(
        getMapKey(String(this.values[0]), this.values[1] as RecipeLensKey),
      );

      return lens ? (lensToRow(lens) as T) : null;
    }

    throw new Error(`Unhandled fake D1 first query: ${normalizedQuery}`);
  }

  async all<T>() {
    const normalizedQuery = normalizeSql(this.query);

    if (normalizedQuery.startsWith("SELECT id, recipe_id")) {
      const recipeId = String(this.values[0]);
      const results = [...this.database.lenses.values()]
        .filter((lens) => lens.recipeId === recipeId)
        .map((lens) =>
          normalizedQuery.includes("recipe_draft_json")
            ? lensToRow(lens)
            : lensToSummaryRow(lens),
        );

      return { results } as T;
    }

    throw new Error(`Unhandled fake D1 all query: ${normalizedQuery}`);
  }
}

function lensToSummaryRow(lens: RecipeLens) {
  return {
    id: lens.id,
    recipe_id: lens.recipeId,
    lens_key: lens.lensKey,
    notes: lens.notes,
    created_at: lens.createdAt,
    updated_at: lens.updatedAt,
  };
}

function lensToRow(lens: RecipeLens) {
  return {
    id: lens.id,
    recipe_id: lens.recipeId,
    lens_key: lens.lensKey,
    notes: lens.notes,
    recipe_draft_json: JSON.stringify(lens.recipeDraft),
    created_at: lens.createdAt,
    updated_at: lens.updatedAt,
  };
}

function getMapKey(recipeId: string, lensKey: RecipeLensKey): string {
  return `${recipeId}:${lensKey}`;
}

function normalizeSql(query: string): string {
  return query.replace(/\s+/g, " ").trim();
}
