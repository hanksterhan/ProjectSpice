import { getTableColumns, getTableName } from "drizzle-orm";
import { describe, expect, it } from "vitest";

import {
  aiRunOperations,
  aiRuns,
  aiRunStatuses,
  recipes,
  recipeVersions,
} from "../schema";

describe("db schema", () => {
  it("defines the persistence tables required by v1", () => {
    expect(getTableName(recipes)).toBe("recipes");
    expect(getTableName(recipeVersions)).toBe("recipe_versions");
    expect(getTableName(aiRuns)).toBe("ai_runs");
  });

  it("stores canonical recipe JSON with searchable recipe summary columns", () => {
    const columns = getTableColumns(recipes);

    expect(Object.keys(columns)).toEqual(
      expect.arrayContaining([
        "id",
        "slug",
        "title",
        "description",
        "imageUrl",
        "sourceType",
        "tagsJson",
        "prepMinutes",
        "cookMinutes",
        "totalMinutes",
        "favorite",
        "rating",
        "cookCount",
        "lastCookedOn",
        "recipeJson",
        "version",
        "deletedAt",
      ]),
    );
  });

  it("captures recipe versions and AI run audit records", () => {
    expect(Object.keys(getTableColumns(recipeVersions))).toEqual(
      expect.arrayContaining([
        "id",
        "recipeId",
        "version",
        "recipeJson",
        "changeSummary",
      ]),
    );
    expect(Object.keys(getTableColumns(aiRuns))).toEqual(
      expect.arrayContaining([
        "id",
        "recipeId",
        "operation",
        "provider",
        "model",
        "promptJson",
        "responseJson",
        "draftRecipeJson",
        "status",
        "error",
        "changeSummary",
      ]),
    );
  });

  it("narrows AI audit operations and statuses", () => {
    expect(aiRunOperations).toEqual(["generate", "transform"]);
    expect(aiRunStatuses).toEqual(["succeeded", "failed"]);
  });
});
