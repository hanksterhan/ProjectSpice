import { describe, expect, it } from "vitest";

import { seedRecipes } from "~/modules/recipe-domain";
import {
  addRecipeTags,
  getActiveLibraryFilters,
  getRecipeLibraryFacets,
  getRecipeLibraryResults,
  parseBulkTagText,
  parseRecipeLibraryQuery,
  removeRecipeTags,
} from "~/modules/library/recipe-library";

describe("recipe library query helpers", () => {
  it("parses URL-backed search, sort, and view state with safe defaults", () => {
    expect(
      parseRecipeLibraryQuery(
        "https://spice.test/?q=  mango  &sort=time&dir=desc&view=list&tag=chilled%20dessert&source=Cookbook&cookbook=Whats%20for%20Dessert",
      ),
    ).toEqual({
      cookbooks: ["Whats for Dessert"],
      direction: "desc",
      q: "mango",
      sort: "time",
      sources: ["Cookbook"],
      tags: ["chilled dessert"],
      view: "list",
    });

    expect(parseRecipeLibraryQuery("https://spice.test/?sort=unknown&view=wide")).toEqual({
      cookbooks: [],
      direction: "desc",
      q: "",
      sort: "recent",
      sources: [],
      tags: [],
      view: "cards",
    });
  });

  it("filters across title, description, tags, yield, and source text", () => {
    const results = getRecipeLibraryResults(seedRecipes, {
      q: "mango chilled",
      cookbooks: [],
      direction: "asc",
      sort: "title",
      sources: [],
      tags: [],
      view: "cards",
    });

    expect(results.map((recipe) => recipe.id)).toEqual(["mango-yogurt-mousse"]);
  });

  it("filters by tag, source, and cookbook facets", () => {
    const results = getRecipeLibraryResults(seedRecipes, {
      cookbooks: ["Claire Saffitz - Whats for Dessert"],
      direction: "asc",
      q: "",
      sort: "title",
      sources: ["Cookbook"],
      tags: ["chilled dessert"],
      view: "cards",
    });

    expect(results.length).toBeGreaterThan(1);
    expect(
      results.every(
        (recipe) => recipe.source?.name === "Claire Saffitz - Whats for Dessert",
      ),
    ).toBe(true);
  });

  it("sorts matching recipes by title and total time", () => {
    const titleResults = getRecipeLibraryResults(seedRecipes, {
      cookbooks: [],
      direction: "asc",
      q: "dessert",
      sort: "title",
      sources: [],
      tags: [],
      view: "cards",
    });
    const timeResults = getRecipeLibraryResults(seedRecipes, {
      cookbooks: [],
      direction: "asc",
      q: "dessert",
      sort: "time",
      sources: [],
      tags: [],
      view: "cards",
    });

    expect(titleResults[0]?.title).toBe("Classic Sundae Bombe");
    expect(timeResults[0]?.times?.totalMinutes).toBeLessThanOrEqual(
      timeResults[1]?.times?.totalMinutes ?? Number.MAX_SAFE_INTEGER,
    );
  });

  it("sorts in descending direction when requested", () => {
    const titleResults = getRecipeLibraryResults(seedRecipes, {
      cookbooks: [],
      direction: "desc",
      q: "dessert",
      sort: "title",
      sources: [],
      tags: [],
      view: "cards",
    });

    expect(titleResults[0]?.title).toBe("Tiramisu-y Icebox Cake");
  });

  it("builds source, cookbook, and tag facets with active filter links", () => {
    const query = parseRecipeLibraryQuery(
      "https://spice.test/?source=Cookbook&tag=seed",
    );
    const facets = getRecipeLibraryFacets(seedRecipes, query);
    const activeFilters = getActiveLibraryFilters(query);

    expect(facets.find((facet) => facet.id === "source")?.options[0]).toMatchObject({
      label: "Cookbook",
      selected: true,
    });
    expect(facets.find((facet) => facet.id === "cookbook")?.options[0]?.label).toBe(
      "Claire Saffitz - Whats for Dessert",
    );
    expect(activeFilters.map((filter) => filter.label)).toEqual([
      "Source: Cookbook",
      "seed",
    ]);
  });

  it("keeps the full tag facet list for scalable vertical browsing", () => {
    const manyTags = Array.from({ length: 24 }, (_, index) => `tag-${index + 1}`);
    const facets = getRecipeLibraryFacets(
      [
        {
          ...seedRecipes[0],
          tags: manyTags,
        },
      ],
      parseRecipeLibraryQuery("https://spice.test/"),
    );

    expect(facets.find((facet) => facet.id === "tag")?.options).toHaveLength(
      manyTags.length,
    );
  });

  it("normalizes bulk tag text and adds or removes tags without duplication", () => {
    const tags = parseBulkTagText(" Favorite, weeknight, Favorite ");
    const recipeWithTags = addRecipeTags(seedRecipes[0], tags);
    const recipeWithoutTags = removeRecipeTags(recipeWithTags, ["Favorite"]);

    expect(tags).toEqual(["Favorite", "weeknight"]);
    expect(recipeWithTags.tags.filter((tag) => tag === "Favorite")).toHaveLength(1);
    expect(recipeWithoutTags.tags).not.toContain("Favorite");
  });
});
