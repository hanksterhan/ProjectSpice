import { describe, expect, it } from "vitest";
import {
  buildWeeklyCadence,
  getAverageCooksPerWeek,
  getDormantRecipes,
  startOfUtcWeek,
} from "../cooking-stats";

describe("cooking stats helpers", () => {
  it("uses Monday as the UTC week start", () => {
    expect(startOfUtcWeek(new Date("2026-04-26T12:00:00Z")).toISOString()).toBe(
      "2026-04-20T00:00:00.000Z"
    );
    expect(startOfUtcWeek(new Date("2026-04-27T12:00:00Z")).toISOString()).toBe(
      "2026-04-27T00:00:00.000Z"
    );
  });

  it("fills missing weekly cadence buckets", () => {
    const points = buildWeeklyCadence(
      [
        { weekStart: "2026-04-06", cookCount: 2 },
        { weekStart: "2026-04-20", cookCount: 4 },
      ],
      new Date("2026-04-22T10:00:00Z"),
      3
    );

    expect(points).toEqual([
      { weekStart: "2026-04-06", cookCount: 2, label: "4/6" },
      { weekStart: "2026-04-13", cookCount: 0, label: "4/13" },
      { weekStart: "2026-04-20", cookCount: 4, label: "4/20" },
    ]);
    expect(getAverageCooksPerWeek(points)).toBe(2);
  });

  it("surfaces stale recipes by cook count then age", () => {
    const now = new Date("2026-04-28T00:00:00Z");
    const recipes = getDormantRecipes(
      [
        {
          id: "recent",
          title: "Recent",
          cookCount: 10,
          lastCookedAt: new Date("2026-04-10T00:00:00Z").getTime(),
        },
        {
          id: "favorite",
          title: "Favorite",
          cookCount: 5,
          lastCookedAt: new Date("2026-01-01T00:00:00Z").getTime(),
        },
        {
          id: "older",
          title: "Older",
          cookCount: 3,
          lastCookedAt: new Date("2025-11-01T00:00:00Z").getTime(),
        },
      ],
      now,
      60
    );

    expect(recipes.map((recipe) => recipe.id)).toEqual(["favorite", "older"]);
    expect(recipes[0].daysSinceCooked).toBe(117);
  });
});
