import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  buildCacheKey,
  checkFoodSafety,
  applyFoodSafetyFilter,
  computeDiff,
  parseImprovedRecipeJson,
  buildSystemPrompt,
  buildUserPrompt,
  estimateTokens,
  DAILY_QUOTA,
  PROMPT_VERSION,
  WORKERS_AI_TOKEN_LIMIT,
  type RecipeInput,
  type ImprovedRecipe,
} from "../ai-improve.server";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeRecipe(overrides: Partial<RecipeInput> = {}): RecipeInput {
  return {
    id: "rec-1",
    title: "Simple Pasta",
    description: "Quick weeknight pasta",
    directionsText: "1. Boil water.\n2. Cook pasta.\n3. Add sauce.",
    notes: "Use salted water.",
    contentHash: "abc123",
    ingredients: [
      {
        sortOrder: 0,
        groupName: null,
        quantityRaw: "2",
        unitRaw: "cups",
        name: "pasta",
        notes: null,
        isGroupHeader: false,
      },
      {
        sortOrder: 1,
        groupName: null,
        quantityRaw: "1",
        unitRaw: "cup",
        name: "marinara sauce",
        notes: "jarred",
        isGroupHeader: false,
      },
    ],
    ...overrides,
  };
}

function makeImproved(overrides: Partial<ImprovedRecipe> = {}): ImprovedRecipe {
  return {
    title: "Simple Pasta",
    description: "Quick weeknight pasta",
    // matches what computeDiff builds from makeRecipe() ingredients (no comma before notes)
    ingredients: ["2 cups pasta", "1 cup marinara sauce jarred"],
    directions: "1. Boil water.\n2. Cook pasta.\n3. Add sauce.",
    notes: "Use salted water.",
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// buildCacheKey
// ---------------------------------------------------------------------------

describe("buildCacheKey", () => {
  it("generates a deterministic key from contentHash, profileId, promptVersion", () => {
    const key = buildCacheKey("hash1", "profile-a", 1);
    expect(key).toBe("ai-improve:hash1:profile-a:v1");
  });

  it("includes PROMPT_VERSION constant correctly", () => {
    const key = buildCacheKey("h", "p", PROMPT_VERSION);
    expect(key).toContain(`v${PROMPT_VERSION}`);
  });

  it("different hashes produce different keys", () => {
    const k1 = buildCacheKey("hashA", "p", 1);
    const k2 = buildCacheKey("hashB", "p", 1);
    expect(k1).not.toBe(k2);
  });
});

// ---------------------------------------------------------------------------
// checkFoodSafety
// ---------------------------------------------------------------------------

describe("checkFoodSafety", () => {
  it("returns null for safe text", () => {
    expect(checkFoodSafety("Cook chicken to 165°F internal temperature.")).toBeNull();
  });

  it("flags raw egg near child", () => {
    expect(checkFoodSafety("Serve raw egg mayonnaise to children")).not.toBeNull();
  });

  it("flags child near raw egg (reversed order)", () => {
    expect(checkFoodSafety("For kids: raw egg")).not.toBeNull();
  });

  it("flags undercooked pork", () => {
    expect(checkFoodSafety("Leave pork undercooked for tenderness")).not.toBeNull();
  });

  it("flags pork served pink", () => {
    expect(checkFoodSafety("The pork should be pink in the center")).not.toBeNull();
  });

  it("flags raw chicken", () => {
    expect(checkFoodSafety("Add raw chicken to the salad")).not.toBeNull();
  });

  it("does not flag properly cooked pork", () => {
    expect(checkFoodSafety("Cook pork to 145°F then rest.")).toBeNull();
  });

  it("does not flag cooked chicken", () => {
    expect(checkFoodSafety("Use cooked chicken breast")).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// applyFoodSafetyFilter
// ---------------------------------------------------------------------------

describe("applyFoodSafetyFilter", () => {
  it("returns safe=true for clean improved recipe", () => {
    const result = applyFoodSafetyFilter(makeImproved());
    expect(result.safe).toBe(true);
    expect(result.flaggedPattern).toBeNull();
  });

  it("returns safe=false when directions contain unsafe content", () => {
    const result = applyFoodSafetyFilter(
      makeImproved({ directions: "Leave pork undercooked for juiciness" })
    );
    expect(result.safe).toBe(false);
    expect(result.flaggedPattern).not.toBeNull();
  });

  it("returns safe=false when notes contain unsafe content", () => {
    const result = applyFoodSafetyFilter(
      makeImproved({ notes: "Serve raw egg mousse to toddlers" })
    );
    expect(result.safe).toBe(false);
  });

  it("returns safe=false when ingredient contains unsafe content", () => {
    const result = applyFoodSafetyFilter(
      makeImproved({ ingredients: ["raw chicken breast", "lettuce"] })
    );
    expect(result.safe).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// parseImprovedRecipeJson
// ---------------------------------------------------------------------------

describe("parseImprovedRecipeJson", () => {
  it("parses valid JSON", () => {
    const raw = JSON.stringify({
      title: "My Recipe",
      description: "Tasty",
      ingredients: ["1 cup flour", "2 eggs"],
      directions: "1. Mix.\n2. Bake.",
      notes: "Optional garnish",
    });
    const result = parseImprovedRecipeJson(raw);
    expect(result.title).toBe("My Recipe");
    expect(result.ingredients).toHaveLength(2);
  });

  it("strips markdown code fences", () => {
    const raw = "```json\n" + JSON.stringify({
      title: "T",
      description: "D",
      ingredients: ["a"],
      directions: "Do it.",
      notes: "",
    }) + "\n```";
    const result = parseImprovedRecipeJson(raw);
    expect(result.title).toBe("T");
  });

  it("throws on missing title", () => {
    const raw = JSON.stringify({ description: "D", ingredients: [], directions: "go", notes: "" });
    expect(() => parseImprovedRecipeJson(raw)).toThrow();
  });

  it("throws on non-array ingredients", () => {
    const raw = JSON.stringify({ title: "T", description: "D", ingredients: "bad", directions: "go", notes: "" });
    expect(() => parseImprovedRecipeJson(raw)).toThrow();
  });

  it("throws on invalid JSON", () => {
    expect(() => parseImprovedRecipeJson("not json")).toThrow();
  });
});

// ---------------------------------------------------------------------------
// computeDiff
// ---------------------------------------------------------------------------

describe("computeDiff", () => {
  it("marks no-change fields as unchanged", () => {
    const recipe = makeRecipe();
    const improved = makeImproved();
    const diff = computeDiff(recipe, improved);
    expect(diff.title.changed).toBe(false);
    expect(diff.description.changed).toBe(false);
    expect(diff.directions.changed).toBe(false);
    expect(diff.notes.changed).toBe(false);
    expect(diff.ingredients.changed).toBe(false);
  });

  it("detects changed title", () => {
    const recipe = makeRecipe();
    const improved = makeImproved({ title: "Improved Pasta" });
    const diff = computeDiff(recipe, improved);
    expect(diff.title.changed).toBe(true);
    expect(diff.title.original).toBe("Simple Pasta");
    expect(diff.title.improved).toBe("Improved Pasta");
  });

  it("detects changed ingredients", () => {
    const recipe = makeRecipe();
    const improved = makeImproved({ ingredients: ["3 cups pasta", "2 cups sauce"] });
    const diff = computeDiff(recipe, improved);
    expect(diff.ingredients.changed).toBe(true);
    expect(diff.ingredients.improved).toEqual(["3 cups pasta", "2 cups sauce"]);
  });

  it("detects changed directions", () => {
    const recipe = makeRecipe();
    const improved = makeImproved({ directions: "1. Salt water.\n2. Cook." });
    const diff = computeDiff(recipe, improved);
    expect(diff.directions.changed).toBe(true);
  });

  it("skips group header ingredients in original list", () => {
    const recipe = makeRecipe({
      ingredients: [
        { sortOrder: 0, groupName: null, quantityRaw: null, unitRaw: null, name: "PRODUCE", notes: null, isGroupHeader: true },
        { sortOrder: 1, groupName: null, quantityRaw: "1", unitRaw: "lb", name: "tomatoes", notes: null, isGroupHeader: false },
      ],
    });
    const improved = makeImproved({ ingredients: ["1 lb tomatoes"] });
    const diff = computeDiff(recipe, improved);
    expect(diff.ingredients.original).toEqual(["1 lb tomatoes"]);
    expect(diff.ingredients.changed).toBe(false);
  });

  it("treats null description as empty string for comparison", () => {
    const recipe = makeRecipe({ description: null });
    const improved = makeImproved({ description: "" });
    const diff = computeDiff(recipe, improved);
    expect(diff.description.changed).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// buildSystemPrompt / buildUserPrompt
// ---------------------------------------------------------------------------

describe("buildSystemPrompt", () => {
  it("includes the profile system prompt", () => {
    const result = buildSystemPrompt("Focus on healthy cooking.");
    expect(result).toContain("Focus on healthy cooking.");
  });

  it("includes JSON schema instruction", () => {
    const result = buildSystemPrompt("Base prompt.");
    expect(result).toContain('"title"');
    expect(result).toContain('"ingredients"');
  });
});

describe("buildUserPrompt", () => {
  it("includes recipe title and ingredients", () => {
    const recipe = makeRecipe();
    const prompt = buildUserPrompt(recipe);
    expect(prompt).toContain("Simple Pasta");
    expect(prompt).toContain("pasta");
    expect(prompt).toContain("marinara sauce");
  });

  it("excludes group headers from ingredient list", () => {
    const recipe = makeRecipe({
      ingredients: [
        { sortOrder: 0, groupName: null, quantityRaw: null, unitRaw: null, name: "PRODUCE", notes: null, isGroupHeader: true },
        { sortOrder: 1, groupName: null, quantityRaw: "1", unitRaw: null, name: "tomato", notes: null, isGroupHeader: false },
      ],
    });
    const prompt = buildUserPrompt(recipe);
    expect(prompt).toContain("tomato");
    expect(prompt).not.toContain("PRODUCE");
  });

  it("handles null description and notes gracefully", () => {
    const recipe = makeRecipe({ description: null, notes: null });
    expect(() => buildUserPrompt(recipe)).not.toThrow();
  });
});

// ---------------------------------------------------------------------------
// estimateTokens
// ---------------------------------------------------------------------------

describe("estimateTokens", () => {
  it("estimates tokens as ceil(length / 4)", () => {
    expect(estimateTokens("abcd")).toBe(1);
    expect(estimateTokens("abcde")).toBe(2);
    expect(estimateTokens("")).toBe(0);
  });

  it("WORKERS_AI_TOKEN_LIMIT is 6000", () => {
    expect(WORKERS_AI_TOKEN_LIMIT).toBe(6000);
  });
});

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

describe("constants", () => {
  it("DAILY_QUOTA is 5", () => {
    expect(DAILY_QUOTA).toBe(5);
  });

  it("PROMPT_VERSION is a positive integer", () => {
    expect(PROMPT_VERSION).toBeGreaterThan(0);
    expect(Number.isInteger(PROMPT_VERSION)).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// checkAndIncrementQuota (with KV stub)
// ---------------------------------------------------------------------------

describe("checkAndIncrementQuota", () => {
  let kvStore: Map<string, string>;
  let kv: KVNamespace;

  beforeEach(() => {
    kvStore = new Map();
    kv = {
      get: vi.fn(async (key: string) => kvStore.get(key) ?? null),
      put: vi.fn(async (key: string, value: string) => { kvStore.set(key, value); }),
      delete: vi.fn(),
      list: vi.fn(),
      getWithMetadata: vi.fn(),
    } as unknown as KVNamespace;
  });

  it("allows first call and increments to 1", async () => {
    const { checkAndIncrementQuota } = await import("../ai-improve.server");
    const result = await checkAndIncrementQuota(kv, "user-1", "2026-04-26");
    expect(result.allowed).toBe(true);
    expect(result.used).toBe(1);
  });

  it("allows calls up to DAILY_QUOTA", async () => {
    const { checkAndIncrementQuota } = await import("../ai-improve.server");
    kvStore.set("ai-quota:user-1:2026-04-26", String(DAILY_QUOTA - 1));
    const result = await checkAndIncrementQuota(kv, "user-1", "2026-04-26");
    expect(result.allowed).toBe(true);
  });

  it("blocks calls beyond DAILY_QUOTA", async () => {
    const { checkAndIncrementQuota } = await import("../ai-improve.server");
    kvStore.set("ai-quota:user-1:2026-04-26", String(DAILY_QUOTA));
    const result = await checkAndIncrementQuota(kv, "user-1", "2026-04-26");
    expect(result.allowed).toBe(false);
    expect(result.used).toBe(DAILY_QUOTA);
  });
});

// ---------------------------------------------------------------------------
// getQuotaUsed
// ---------------------------------------------------------------------------

describe("getQuotaUsed", () => {
  it("returns 0 when no key exists", async () => {
    const { getQuotaUsed } = await import("../ai-improve.server");
    const kv = {
      get: vi.fn(async () => null),
    } as unknown as KVNamespace;
    const used = await getQuotaUsed(kv, "user-1", "2026-04-26");
    expect(used).toBe(0);
  });

  it("returns the stored count", async () => {
    const { getQuotaUsed } = await import("../ai-improve.server");
    const kv = {
      get: vi.fn(async () => "3"),
    } as unknown as KVNamespace;
    const used = await getQuotaUsed(kv, "user-1", "2026-04-26");
    expect(used).toBe(3);
  });
});
