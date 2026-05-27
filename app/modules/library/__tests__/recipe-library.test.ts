import { describe, expect, it } from "vitest";

import { seedRecipes } from "~/modules/recipe-domain";
import {
  getRecipeLibraryResults,
  parseRecipeLibraryQuery,
} from "~/modules/library/recipe-library";

describe("recipe library query helpers", () => {
  it("parses URL-backed search, sort, and view state with safe defaults", () => {
    expect(
      parseRecipeLibraryQuery("https://spice.test/?q=  mango  &sort=time&view=list"),
    ).toEqual({
      q: "mango",
      sort: "time",
      view: "list",
    });

    expect(parseRecipeLibraryQuery("https://spice.test/?sort=unknown&view=wide")).toEqual({
      q: "",
      sort: "recent",
      view: "cards",
    });
  });

  it("filters across title, description, tags, yield, and source text", () => {
    const results = getRecipeLibraryResults(seedRecipes, {
      q: "mango chilled",
      sort: "title",
      view: "cards",
    });

    expect(results.map((recipe) => recipe.id)).toEqual(["mango-yogurt-mousse"]);
  });

  it("sorts matching recipes by title and total time", () => {
    const titleResults = getRecipeLibraryResults(seedRecipes, {
      q: "dessert",
      sort: "title",
      view: "cards",
    });
    const timeResults = getRecipeLibraryResults(seedRecipes, {
      q: "dessert",
      sort: "time",
      view: "cards",
    });

    expect(titleResults[0]?.title).toBe("Classic Sundae Bombe");
    expect(timeResults[0]?.times?.totalMinutes).toBeLessThanOrEqual(
      timeResults[1]?.times?.totalMinutes ?? Number.MAX_SAFE_INTEGER,
    );
  });
});
