import { describe, expect, it } from "vitest";

import { seedRecipes } from "~/modules/recipe-domain";
import {
  addRecipeTags,
  getActiveLibraryFilters,
  getRecipeCookbookTree,
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
      favorite: false,
      q: "mango",
      sort: "time",
      sources: ["Cookbook"],
      tags: ["chilled dessert"],
      topRated: false,
      view: "list",
    });

    expect(parseRecipeLibraryQuery("https://spice.test/?view=grid")).toMatchObject({
      view: "grid",
    });

    expect(
      parseRecipeLibraryQuery("https://spice.test/?favorite=1&topRated=1"),
    ).toMatchObject({
      favorite: true,
      topRated: false,
    });

    expect(parseRecipeLibraryQuery("https://spice.test/?sort=unknown&view=wide")).toEqual({
      cookbooks: [],
      direction: "desc",
      favorite: false,
      q: "",
      sort: "recent",
      sources: [],
      tags: [],
      topRated: false,
      view: "grid",
    });
  });

  it("filters across title, description, tags, yield, and source text", () => {
    const results = getRecipeLibraryResults(seedRecipes, {
      q: "mango chilled",
      cookbooks: [],
      direction: "asc",
      favorite: false,
      sort: "title",
      sources: [],
      tags: [],
      topRated: false,
      view: "cards",
    });

    expect(results.map((recipe) => recipe.id)).toEqual(["mango-yogurt-mousse"]);
  });

  it("filters by tag, source, and cookbook facets", () => {
    const results = getRecipeLibraryResults(seedRecipes, {
      cookbooks: ["Claire Saffitz - Whats for Dessert"],
      direction: "asc",
      favorite: false,
      q: "",
      sort: "title",
      sources: ["Cookbook"],
      tags: ["chilled dessert"],
      topRated: false,
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
      favorite: false,
      q: "dessert",
      sort: "title",
      sources: [],
      tags: [],
      topRated: false,
      view: "cards",
    });
    const timeResults = getRecipeLibraryResults(seedRecipes, {
      cookbooks: [],
      direction: "asc",
      favorite: false,
      q: "dessert",
      sort: "time",
      sources: [],
      tags: [],
      topRated: false,
      view: "cards",
    });

    expect(titleResults[0]?.title.localeCompare(titleResults[1]?.title ?? "")).toBeLessThanOrEqual(
      0,
    );
    expect(timeResults[0]?.times?.totalMinutes).toBeLessThanOrEqual(
      timeResults[1]?.times?.totalMinutes ?? Number.MAX_SAFE_INTEGER,
    );
  });

  it("sorts in descending direction when requested", () => {
    const titleResults = getRecipeLibraryResults(seedRecipes, {
      cookbooks: [],
      direction: "desc",
      favorite: false,
      q: "dessert",
      sort: "title",
      sources: [],
      tags: [],
      topRated: false,
      view: "cards",
    });

    expect(
      titleResults[0]?.title.localeCompare(titleResults[1]?.title ?? ""),
    ).toBeGreaterThanOrEqual(0);
  });

  it("filters favorites and top-rated recipes and sorts by rating", () => {
    const recipes = [
      { ...seedRecipes[0], id: "favorite-nine", favorite: true, rating: 9 },
      { ...seedRecipes[1], id: "favorite-seven", favorite: true, rating: 7 },
      { ...seedRecipes[2], id: "regular-ten", favorite: false, rating: 10 },
    ];

    expect(
      getRecipeLibraryResults(recipes, parseRecipeLibraryQuery("https://spice.test/?favorite=1"))
        .map((recipe) => recipe.id)
        .sort(),
    ).toEqual(["favorite-nine", "favorite-seven"]);
    expect(
      getRecipeLibraryResults(recipes, parseRecipeLibraryQuery("https://spice.test/?topRated=1"))
        .map((recipe) => recipe.id)
        .sort(),
    ).toEqual(["favorite-nine", "regular-ten"]);
    expect(
      getRecipeLibraryResults(recipes, parseRecipeLibraryQuery("https://spice.test/?sort=rating"))
        .map((recipe) => recipe.id),
    ).toEqual(["regular-ten", "favorite-nine", "favorite-seven"]);
  });

  it("builds cookbook and tag facets with active filter links", () => {
    const query = parseRecipeLibraryQuery(
      "https://spice.test/?source=Cookbook&tag=seed",
    );
    const facets = getRecipeLibraryFacets(seedRecipes, query);
    const activeFilters = getActiveLibraryFilters(query);

    expect(facets.map((facet) => facet.id)).toEqual(["tag"]);
    expect(activeFilters.map((filter) => filter.label)).toEqual([
      "Source: Cookbook",
      "seed",
    ]);
  });

  it("builds expandable cookbook trees with chapter links", () => {
    const query = parseRecipeLibraryQuery("https://spice.test/");
    const tree = getRecipeCookbookTree(seedRecipes, query);
    const joshua = tree.find((author) => author.label === "Joshua Weissman");
    const unapologetic = joshua?.cookbooks.find(
      (cookbook) => cookbook.label === "An Unapologetic Cookbook",
    );
    const staples = unapologetic?.chapters.find(
      (chapter) => chapter.label === "Staples From Scratch",
    );

    expect(joshua?.cookbooks.map((cookbook) => cookbook.label)).toEqual([
      "An Unapologetic Cookbook",
      "Texture Over Taste",
    ]);
    expect(staples?.href).toBe(
      "/?tag=Staples+From+Scratch&cookbook=Joshua+Weissman+-+An+Unapologetic+Cookbook",
    );
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
