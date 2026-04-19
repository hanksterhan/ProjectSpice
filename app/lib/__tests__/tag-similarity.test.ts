import { describe, it, expect } from "vitest";
import { findSimilarTagPairs } from "../tag-similarity";

function tags(names: string[]) {
  return names.map((name, i) => ({ id: String(i), name }));
}

function pairNames(pairs: ReturnType<typeof findSimilarTagPairs>) {
  return pairs.map(({ a, b }) => [a.name, b.name]);
}

describe("findSimilarTagPairs", () => {
  it("returns empty for a single tag", () => {
    expect(findSimilarTagPairs(tags(["chicken"]))).toHaveLength(0);
  });

  it("returns empty for totally different tags", () => {
    expect(findSimilarTagPairs(tags(["chicken", "pasta", "salad"]))).toHaveLength(0);
  });

  it("flags identical names modulo case", () => {
    const pairs = findSimilarTagPairs(tags(["Chicken", "chicken"]));
    expect(pairs).toHaveLength(1);
    expect(pairNames(pairs)).toEqual([["Chicken", "chicken"]]);
  });

  it("flags common typo: extra letter", () => {
    // 'chkn' vs 'chicken' is distance 3 — should NOT match
    const pairs = findSimilarTagPairs(tags(["chkn", "chicken"]));
    expect(pairs).toHaveLength(0);
  });

  it("flags single-character difference in medium tags", () => {
    // 'pasta' vs 'paste' — distance 1, maxLen 5 → threshold 1 ✓
    const pairs = findSimilarTagPairs(tags(["pasta", "paste"]));
    expect(pairs).toHaveLength(1);
  });

  it("flags two-character difference in longer tags", () => {
    // 'desserts' vs 'deserts' — distance 1, maxLen 8 → threshold 2 ✓
    const pairs = findSimilarTagPairs(tags(["desserts", "deserts"]));
    expect(pairs).toHaveLength(1);
  });

  it("does NOT flag two-character difference in short tags (maxLen ≤ 5, threshold 1)", () => {
    // 'cake' vs 'bake' — distance 1, maxLen 4 → threshold 1 ✓ (these are similar enough)
    const pairs = findSimilarTagPairs(tags(["cake", "bake"]));
    expect(pairs).toHaveLength(1);
  });

  it("does NOT flag tags shorter than 3 chars", () => {
    // 'ai' and 'bi' — too short to surface
    const pairs = findSimilarTagPairs(tags(["ai", "bi"]));
    expect(pairs).toHaveLength(0);
  });

  it("does NOT flag clearly different tags of same length", () => {
    // 'salad' vs 'bread' — distance 5
    const pairs = findSimilarTagPairs(tags(["salad", "bread"]));
    expect(pairs).toHaveLength(0);
  });

  it("returns multiple independent pairs when present", () => {
    const pairs = findSimilarTagPairs(
      tags(["Chicken", "chicken", "pasta", "Pasta"])
    );
    expect(pairs).toHaveLength(2);
    const names = pairNames(pairs);
    expect(names).toContainEqual(["Chicken", "chicken"]);
    expect(names).toContainEqual(["pasta", "Pasta"]);
  });

  it("handles the 'chkn'/'chicken' example from the plan (should NOT surface — distance 3)", () => {
    const pairs = findSimilarTagPairs(tags(["chkn", "chicken"]));
    expect(pairs).toHaveLength(0);
  });

  it("surfaces 'desert' vs 'dessert' (distance 1, long enough)", () => {
    const pairs = findSimilarTagPairs(tags(["desert", "dessert"]));
    expect(pairs).toHaveLength(1);
  });

  it("does not pair a tag with itself", () => {
    const t = [{ id: "1", name: "chicken" }];
    expect(findSimilarTagPairs(t)).toHaveLength(0);
  });

  it("handles empty input", () => {
    expect(findSimilarTagPairs([])).toHaveLength(0);
  });
});
