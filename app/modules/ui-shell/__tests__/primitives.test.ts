import { describe, expect, it } from "vitest";

import { getDisplayImageSrc, getRatingStarFillPercents } from "../primitives";

describe("getDisplayImageSrc", () => {
  it("serves Project Spice static assets from the current origin", () => {
    expect(
      getDisplayImageSrc(
        "https://spice.h6nk.dev/recipe-images/joshua-weissman/51-hour-focaccia.jpg",
      ),
    ).toBe("/recipe-images/joshua-weissman/51-hour-focaccia.jpg");
  });

  it("leaves external image URLs alone", () => {
    expect(getDisplayImageSrc("https://images.example.com/recipe.jpg")).toBe(
      "https://images.example.com/recipe.jpg",
    );
  });
});

describe("getRatingStarFillPercents", () => {
  it("maps 10-point ratings onto five stars with half-star support", () => {
    expect(getRatingStarFillPercents(9)).toEqual([100, 100, 100, 100, 50]);
    expect(getRatingStarFillPercents(10)).toEqual([100, 100, 100, 100, 100]);
    expect(getRatingStarFillPercents()).toEqual([0, 0, 0, 0, 0]);
  });

  it("clamps ratings to the supported range", () => {
    expect(getRatingStarFillPercents(-1)).toEqual([0, 0, 0, 0, 0]);
    expect(getRatingStarFillPercents(12)).toEqual([100, 100, 100, 100, 100]);
  });
});
