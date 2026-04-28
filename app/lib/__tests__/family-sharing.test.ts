import { describe, expect, it } from "vitest";
import {
  canManageRecipe,
  canPubliclyShareRecipe,
  canViewRecipe,
} from "../family-sharing";

describe("family sharing policy", () => {
  it("keeps private recipes owner-only", () => {
    const recipe = { userId: "henry", visibility: "private", sourceType: "manual" };

    expect(canViewRecipe(recipe, "henry")).toBe(true);
    expect(canViewRecipe(recipe, "mom")).toBe(false);
    expect(canManageRecipe(recipe, "mom")).toBe(false);
  });

  it("allows signed-in family members to view but not manage family recipes", () => {
    const recipe = { userId: "henry", visibility: "family", sourceType: "manual" };

    expect(canViewRecipe(recipe, "mom")).toBe(true);
    expect(canManageRecipe(recipe, "mom")).toBe(false);
  });

  it("blocks public signed-link posture for cookbook-derived PDF and EPUB imports", () => {
    expect(canPubliclyShareRecipe({ sourceType: "pdf" })).toBe(false);
    expect(canPubliclyShareRecipe({ sourceType: "epub" })).toBe(false);
    expect(canPubliclyShareRecipe({ sourceType: "paprika_binary" })).toBe(true);
  });
});
