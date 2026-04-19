import { describe, it, expect } from "vitest";
import { gzipSync, strToU8, zipSync } from "fflate";
import {
  parsePaprikaArchive,
  toTextPayload,
  normaliseDifficulty,
  parseServings,
  type PaprikaRecipeRaw,
} from "../paprika-binary-parser";

// ─── Helpers ─────────────────────────────────────────────────────────────────

function makeArchive(recipes: Partial<PaprikaRecipeRaw>[]): Uint8Array {
  const files: Record<string, Uint8Array> = {};
  for (const recipe of recipes) {
    const full: PaprikaRecipeRaw = {
      uid: "TEST-UID-1",
      name: "Test Recipe",
      ingredients: "1 cup flour",
      directions: "Mix and bake.",
      description: "",
      notes: "",
      categories: [],
      servings: "4",
      prep_time: "10 mins",
      cook_time: "20 mins",
      total_time: "30 mins",
      difficulty: "",
      rating: 3,
      source: "",
      source_url: "https://example.com",
      image_url: "",
      photo: "",
      photo_data: "",
      photo_hash: "",
      photo_large: null,
      photos: [],
      nutritional_info: "",
      created: "2024-01-01 00:00:00",
      hash: "abc123",
      ...recipe,
    };
    const json = JSON.stringify(full);
    const gzipped = gzipSync(strToU8(json));
    files[`${full.name}.paprikarecipe`] = gzipped;
  }
  return zipSync(files);
}

// ─── parsePaprikaArchive ─────────────────────────────────────────────────────

describe("parsePaprikaArchive", () => {
  it("parses a single-recipe archive", () => {
    const archive = makeArchive([{ uid: "AAA", name: "Chocolate Cake" }]);
    const results = parsePaprikaArchive(archive);
    expect(results).toHaveLength(1);
    expect(results[0].uid).toBe("AAA");
    expect(results[0].name).toBe("Chocolate Cake");
  });

  it("parses multiple recipes", () => {
    const archive = makeArchive([
      { uid: "A1", name: "Recipe A" },
      { uid: "B2", name: "Recipe B" },
      { uid: "C3", name: "Recipe C" },
    ]);
    const results = parsePaprikaArchive(archive);
    expect(results).toHaveLength(3);
    expect(results.map((r) => r.uid)).toEqual(expect.arrayContaining(["A1", "B2", "C3"]));
  });

  it("skips entries that do not end in .paprikarecipe", () => {
    const json = JSON.stringify({ uid: "X", name: "Fake" });
    const files: Record<string, Uint8Array> = {
      "README.txt": gzipSync(strToU8(json)),
      "recipe.paprikarecipe": gzipSync(strToU8(JSON.stringify({
        uid: "REAL", name: "Real Recipe", categories: [], photos: [],
        ingredients: "", directions: "",
      }))),
    };
    const archive = zipSync(files);
    const results = parsePaprikaArchive(archive);
    expect(results).toHaveLength(1);
    expect(results[0].uid).toBe("REAL");
  });

  it("skips recipes missing uid or name", () => {
    const archiveWithMissing = makeArchive([
      { uid: "", name: "No UID" },
      { uid: "VALID", name: "Valid Recipe" },
    ]);
    const results = parsePaprikaArchive(archiveWithMissing);
    expect(results).toHaveLength(1);
    expect(results[0].uid).toBe("VALID");
  });

  it("normalises missing arrays to empty arrays", () => {
    const json = JSON.stringify({ uid: "Z1", name: "Sparse", directions: "step 1" });
    const archive = zipSync({
      "Sparse.paprikarecipe": gzipSync(strToU8(json)),
    });
    const results = parsePaprikaArchive(archive);
    expect(results[0].categories).toEqual([]);
    expect(results[0].photos).toEqual([]);
    expect(results[0].ingredients).toBe("");
  });

  it("returns empty array for an archive with no .paprikarecipe entries", () => {
    const archive = zipSync({ "junk.txt": strToU8("hello") });
    const results = parsePaprikaArchive(archive);
    expect(results).toHaveLength(0);
  });

  it("silently skips malformed gzip entries", () => {
    const good = gzipSync(strToU8(JSON.stringify({ uid: "OK", name: "Good", categories: [], photos: [], ingredients: "", directions: "" })));
    const archive = zipSync({
      "bad.paprikarecipe": strToU8("not-gzip"),
      "good.paprikarecipe": good,
    });
    const results = parsePaprikaArchive(archive);
    expect(results).toHaveLength(1);
    expect(results[0].uid).toBe("OK");
  });
});

// ─── toTextPayload ────────────────────────────────────────────────────────────

describe("toTextPayload", () => {
  it("strips photo_data and photos fields", () => {
    const archive = makeArchive([{ uid: "P1", name: "Photo Recipe", photo_data: "base64data", photos: [{ filename: "a.jpg", data: "b64", name: "1", hash: "h" }] }]);
    const [recipe] = parsePaprikaArchive(archive);
    const text = toTextPayload(recipe);
    expect("photo_data" in text).toBe(false);
    expect("photos" in text).toBe(false);
    expect(text.uid).toBe("P1");
    expect(text.name).toBe("Photo Recipe");
  });

  it("preserves all non-photo fields", () => {
    const archive = makeArchive([{
      uid: "F1", name: "Full Recipe",
      categories: ["Italian", "Pasta"],
      rating: 4,
      prep_time: "15 mins",
    }]);
    const [recipe] = parsePaprikaArchive(archive);
    const text = toTextPayload(recipe);
    expect(text.categories).toEqual(["Italian", "Pasta"]);
    expect(text.rating).toBe(4);
    expect(text.prep_time).toBe("15 mins");
  });
});

// ─── normaliseDifficulty ──────────────────────────────────────────────────────

describe("normaliseDifficulty", () => {
  it("extracts text from parenthetical form", () => {
    expect(normaliseDifficulty("2 (Easy)")).toBe("Easy");
    expect(normaliseDifficulty("3 (Medium)")).toBe("Medium");
  });

  it("returns plain text as-is", () => {
    expect(normaliseDifficulty("Easy")).toBe("Easy");
    expect(normaliseDifficulty("Hard")).toBe("Hard");
  });

  it("returns null for empty or whitespace", () => {
    expect(normaliseDifficulty("")).toBeNull();
    expect(normaliseDifficulty("   ")).toBeNull();
  });
});

// ─── parseServings ────────────────────────────────────────────────────────────

describe("parseServings", () => {
  it("parses a plain integer", () => {
    expect(parseServings("4")).toEqual({ servings: 4, servingsUnit: null });
    expect(parseServings("10")).toEqual({ servings: 10, servingsUnit: null });
  });

  it("parses a number with a unit suffix", () => {
    const result = parseServings("12 cookies");
    expect(result.servings).toBe(12);
    expect(result.servingsUnit).toBe("cookies");
  });

  it("returns servingsUnit only for unparseable text", () => {
    const result = parseServings("Makes enough for one 9-inch pie");
    expect(result.servings).toBeNull();
    expect(result.servingsUnit).toBe("Makes enough for one 9-inch pie");
  });

  it("returns null for empty string", () => {
    expect(parseServings("")).toEqual({ servings: null, servingsUnit: null });
  });
});
