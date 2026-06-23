import { describe, expect, it } from "vitest";

import { seedRecipes } from "~/modules/recipe-domain/seed-recipes.fixtures";
import {
  addRecipeTags,
  getActiveLibraryFilters,
  getRecipeCookbookTree,
  getRecipeLibraryFacets,
  getRecipeLibraryPage,
  getRecipeLibraryResults,
  getRecipeSourceFilterLink,
  otherWebsitesFacetValue,
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
      chapters: [],
      cookbooks: ["Whats for Dessert"],
      direction: "desc",
      favorite: false,
      page: 1,
      q: "mango",
      sort: "time",
      sources: ["Cookbook"],
      tags: ["chilled dessert"],
      topRated: false,
      view: "list",
      websites: [],
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
      chapters: [],
      cookbooks: [],
      direction: "desc",
      favorite: false,
      page: 1,
      q: "",
      sort: "recent",
      sources: [],
      tags: [],
      topRated: false,
      view: "grid",
      websites: [],
    });
  });

  it("caps visible library recipes by page while preserving total counts", () => {
    const recipes = Array.from({ length: 80 }, (_, index) => ({
      ...seedRecipes[index % seedRecipes.length],
      id: `recipe-${index}`,
    }));
    const firstPage = getRecipeLibraryPage(recipes, { page: 1 });
    const expandedPage = getRecipeLibraryPage(recipes, { page: 2 });

    expect(firstPage).toMatchObject({
      hasMore: true,
      totalCount: 80,
      visibleCount: 72,
    });
    expect(firstPage.recipes).toHaveLength(72);
    expect(expandedPage).toMatchObject({
      hasMore: false,
      totalCount: 80,
      visibleCount: 80,
    });
    expect(expandedPage.recipes).toHaveLength(80);
  });

  it("filters across title, description, tags, yield, and source text", () => {
    const results = getRecipeLibraryResults(seedRecipes, {
      chapters: [],
      q: "mango chilled",
      cookbooks: [],
      direction: "asc",
      favorite: false,
      sort: "title",
      sources: [],
      tags: [],
      topRated: false,
      view: "cards",
      websites: [],
    });

    expect(results.map((recipe) => recipe.id)).toEqual(["mango-yogurt-mousse"]);
  });

  it("filters by tag, source, and cookbook facets", () => {
    const results = getRecipeLibraryResults(seedRecipes, {
      chapters: [],
      cookbooks: ["Claire Saffitz - Whats for Dessert"],
      direction: "asc",
      favorite: false,
      q: "",
      sort: "title",
      sources: ["Cookbook"],
      tags: ["chilled dessert"],
      topRated: false,
      view: "cards",
      websites: [],
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
      chapters: [],
      cookbooks: [],
      direction: "asc",
      favorite: false,
      q: "dessert",
      sort: "title",
      sources: [],
      tags: [],
      topRated: false,
      view: "cards",
      websites: [],
    });
    const timeResults = getRecipeLibraryResults(seedRecipes, {
      chapters: [],
      cookbooks: [],
      direction: "asc",
      favorite: false,
      q: "dessert",
      sort: "time",
      sources: [],
      tags: [],
      topRated: false,
      view: "cards",
      websites: [],
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
      chapters: [],
      cookbooks: [],
      direction: "desc",
      favorite: false,
      q: "dessert",
      sort: "title",
      sources: [],
      tags: [],
      topRated: false,
      view: "cards",
      websites: [],
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
      "https://spice.test/?source=Cookbook&tag=weeknight",
    );
    const facets = getRecipeLibraryFacets(
      [
        {
          ...seedRecipes[0],
          source: { type: "manual" },
          tags: ["weeknight"],
        },
      ],
      query,
    );
    const activeFilters = getActiveLibraryFilters(query);

    expect(facets.map((facet) => facet.id)).toEqual(["tag"]);
    expect(activeFilters.map((filter) => filter.label)).toEqual([
      "Source: Cookbook",
      "weeknight",
    ]);
  });

  it("keeps cookbook hierarchy labels out of tag facets", () => {
    const facets = getRecipeLibraryFacets(
      seedRecipes,
      parseRecipeLibraryQuery("https://spice.test/"),
    );
    const tagValues = facets
      .find((facet) => facet.id === "tag")
      ?.options.map((option) => option.value) ?? [];

    expect(tagValues).not.toContain("Joshua Weissman");
    expect(tagValues).not.toContain("Texture Over Taste");
    expect(tagValues).not.toContain("An Unapologetic Cookbook");
  });

  it("keeps website origins out of the cookbook tree", () => {
    const tree = getRecipeCookbookTree(
      seedRecipes,
      parseRecipeLibraryQuery("https://spice.test/"),
    );
    const authorLabels = tree.map((author) => author.label);

    expect(authorLabels).toContain("Joshua Weissman");
    expect(authorLabels).toContain("Claire Saffitz");
    expect(authorLabels).toContain("Julie Taboulie's Lebanese Kitchen");
    expect(authorLabels).not.toContain("cooking.nytimes.com");
    expect(authorLabels).not.toContain("mollybaz.com");
    expect(authorLabels).not.toContain("Paprika");
    expect(authorLabels).not.toContain("Ina Garten");
    expect(authorLabels).not.toContain("Julie Taboulie's Labnese Kitchen");
    expect(
      tree.find((author) => author.label === "Julie Taboulie's Lebanese Kitchen")?.count,
    ).toBe(15);
    expect(tree.length).toBeLessThan(15);
  });

  it("groups high-count websites separately from one-off website origins", () => {
    const query = parseRecipeLibraryQuery("https://spice.test/");
    const websiteFacet = getRecipeLibraryFacets(seedRecipes, query).find(
      (facet) => facet.id === "website",
    );

    expect(websiteFacet?.options.map((option) => option.value)).toContain(
      "cooking.nytimes.com",
    );
    expect(websiteFacet?.options.map((option) => option.value)).toContain(
      otherWebsitesFacetValue,
    );
    expect(websiteFacet?.options.find((option) => option.value === "ambitiouskitchen.com")).toBeUndefined();

    const nytResults = getRecipeLibraryResults(
      seedRecipes,
      parseRecipeLibraryQuery("https://spice.test/?website=cooking.nytimes.com"),
    );
    const otherResults = getRecipeLibraryResults(
      seedRecipes,
      parseRecipeLibraryQuery(`https://spice.test/?website=${encodeURIComponent(otherWebsitesFacetValue)}`),
    );

    expect(nytResults.length).toBeGreaterThan(50);
    expect(nytResults.every((recipe) => recipe.source?.name === "cooking.nytimes.com")).toBe(
      true,
    );
    expect(otherResults.length).toBeGreaterThan(0);
    expect(otherResults.every((recipe) => recipe.source?.name !== "cooking.nytimes.com")).toBe(
      true,
    );
  });

  it("builds source chips for cookbook and website origins", () => {
    const query = parseRecipeLibraryQuery("https://spice.test/");
    const cookbookRecipe = seedRecipes.find(
      (recipe) =>
        recipe.source?.name === "Joshua Weissman - Texture Over Taste",
    );
    const websiteRecipe = seedRecipes.find(
      (recipe) => recipe.source?.name === "cooking.nytimes.com",
    );

    expect(cookbookRecipe ? getRecipeSourceFilterLink(cookbookRecipe, query) : undefined).toMatchObject({
      href: "/?cookbook=Joshua+Weissman+-+Texture+Over+Taste",
      label: "Joshua Weissman - Texture Over Taste",
    });
    expect(websiteRecipe ? getRecipeSourceFilterLink(websiteRecipe, query) : undefined).toMatchObject({
      href: "/?website=cooking.nytimes.com",
      label: "cooking.nytimes.com",
    });
  });

  it("shortens cookbook active filter labels under the author tree", () => {
    const query = parseRecipeLibraryQuery(
      "https://spice.test/?cookbook=Joshua%20Weissman%20-%20An%20Unapologetic%20Cookbook",
    );

    expect(getActiveLibraryFilters(query).map((filter) => filter.label)).toEqual([
      "Cookbook: An Unapologetic Cookbook",
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
      "/?chapter=Staples+From+Scratch&cookbook=Joshua+Weissman+-+An+Unapologetic+Cookbook",
    );
  });

  it("keeps the full cookbook tree available while marking selected chapter filters", () => {
    const query = parseRecipeLibraryQuery(
      "https://spice.test/?chapter=Staples%20From%20Scratch&cookbook=Joshua%20Weissman%20-%20An%20Unapologetic%20Cookbook",
    );
    const tree = getRecipeCookbookTree(seedRecipes, query);
    const joshua = tree.find((author) => author.label === "Joshua Weissman");
    const unapologetic = joshua?.cookbooks.find(
      (cookbook) => cookbook.label === "An Unapologetic Cookbook",
    );
    const selectedChapter = unapologetic?.chapters.find(
      (chapter) => chapter.label === "Staples From Scratch",
    );

    expect(tree.map((author) => author.label)).toContain("Claire Saffitz");
    expect(joshua?.cookbooks.map((cookbook) => cookbook.label)).toEqual([
      "An Unapologetic Cookbook",
      "Texture Over Taste",
    ]);
    expect(unapologetic?.selected).toBe(false);
    expect(selectedChapter?.selected).toBe(true);
  });

  it("filters cookbook chapters separately from tags", () => {
    const results = getRecipeLibraryResults(
      seedRecipes,
      parseRecipeLibraryQuery(
        "https://spice.test/?chapter=Staples%20From%20Scratch&cookbook=Joshua%20Weissman%20-%20An%20Unapologetic%20Cookbook",
      ),
    );

    expect(results.length).toBeGreaterThan(0);
    expect(
      results.every(
        (recipe) =>
          recipe.source?.name === "Joshua Weissman - An Unapologetic Cookbook",
      ),
    ).toBe(true);
    expect(results.some((recipe) => recipe.tags.length > 0)).toBe(true);
  });

  it("uses explicit imported cookbook chapter markers outside tag facets", () => {
    const recipes = [
      {
        ...seedRecipes[0],
        id: "smoothie",
        source: {
          type: "imported" as const,
          name: "America's Test Kitchen - The Complete Guide to Healthy Drinks",
        },
        tags: ["Beverage", "chapter:Smoothies"],
      },
      {
        ...seedRecipes[1],
        id: "juice",
        source: {
          type: "imported" as const,
          name: "America's Test Kitchen - The Complete Guide to Healthy Drinks",
        },
        tags: ["Beverage", "chapter:Juices"],
      },
    ];
    const query = parseRecipeLibraryQuery("https://spice.test/");
    const tree = getRecipeCookbookTree(recipes, query);
    const cookbook = tree[0]?.cookbooks[0];
    const tagFacet = getRecipeLibraryFacets(recipes, query).find(
      (facet) => facet.id === "tag",
    );
    const smoothieResults = getRecipeLibraryResults(
      recipes,
      parseRecipeLibraryQuery(
        "https://spice.test/?chapter=Smoothies&cookbook=America%27s%20Test%20Kitchen%20-%20The%20Complete%20Guide%20to%20Healthy%20Drinks",
      ),
    );

    expect(cookbook?.chapters.map((chapter) => chapter.label).sort()).toEqual([
      "Juices",
      "Smoothies",
    ]);
    expect(cookbook?.chapters.find((chapter) => chapter.label === "Smoothies")?.href).toBe(
      "/?chapter=Smoothies&cookbook=America%27s+Test+Kitchen+-+The+Complete+Guide+to+Healthy+Drinks",
    );
    expect(tagFacet?.options.map((option) => option.value)).toEqual(["Beverage"]);
    expect(smoothieResults.map((recipe) => recipe.id)).toEqual(["smoothie"]);
  });

  it("keeps the full tag facet list for scalable vertical browsing", () => {
    const manyTags = Array.from({ length: 24 }, (_, index) => `tag-${index + 1}`);
    const facets = getRecipeLibraryFacets(
      [
        {
          ...seedRecipes[0],
          source: { type: "manual" },
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
