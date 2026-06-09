import { describe, expect, it } from "vitest";

import { getDisplayImageSrc } from "../primitives";

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
