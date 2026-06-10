import type { Recipe } from "~/modules/recipe-domain";
import { getCookbookChapterOverrides } from "~/modules/library/cookbook-chapter-overrides";

export const recipeLibrarySortOptions = ["recent", "title", "time", "rating"] as const;
export const recipeLibrarySortDirectionOptions = ["asc", "desc"] as const;
export const recipeLibraryViewOptions = ["cards", "grid", "list"] as const;
export const maxRecipeTags = 12;
export const websiteFacetMinimumRecipeCount = 3;
export const otherWebsitesFacetValue = "Other websites";
const internalFixtureTags = new Set(["seed", "chilled dessert"]);
const knownCookbookSourceNames = new Set([
  "Julie Taboulie's Lebanese Kitchen",
]);

export type RecipeLibrarySort = (typeof recipeLibrarySortOptions)[number];
export type RecipeLibrarySortDirection =
  (typeof recipeLibrarySortDirectionOptions)[number];
export type RecipeLibraryView = (typeof recipeLibraryViewOptions)[number];
export type RecipeLibraryFacet = "tag" | "source" | "cookbook" | "website";

export type RecipeLibraryFacetOption = {
  count: number;
  href: string;
  id: string;
  label: string;
  selected: boolean;
  value: string;
};

export type RecipeLibraryFacetGroup = {
  id: RecipeLibraryFacet;
  label: string;
  options: RecipeLibraryFacetOption[];
};

export type RecipeLibraryChapterNode = RecipeLibraryFacetOption;

export type RecipeLibraryCookbookNode = RecipeLibraryFacetOption & {
  chapters: RecipeLibraryChapterNode[];
};

export type RecipeLibraryAuthorNode = RecipeLibraryFacetOption & {
  cookbooks: RecipeLibraryCookbookNode[];
};

export type RecipeLibraryActiveFilter = {
  href: string;
  id: string;
  label: string;
};

export type RecipeSourceFilterLink = {
  href: string;
  label: string;
};

export type RecipeLibraryQuery = {
  chapters: string[];
  cookbooks: string[];
  direction: RecipeLibrarySortDirection;
  favorite: boolean;
  q: string;
  sort: RecipeLibrarySort;
  sources: string[];
  tags: string[];
  topRated: boolean;
  view: RecipeLibraryView;
  websites: string[];
};

export function parseRecipeLibraryQuery(url: string): RecipeLibraryQuery {
  const searchParams = new URL(url).searchParams;
  const sort = searchParams.get("sort");
  const direction = searchParams.get("dir");
  const view = searchParams.get("view");
  const safeSort = isRecipeLibrarySort(sort) ? sort : "recent";
  const favorite = searchParams.get("favorite") === "1";

  return {
    chapters: parseQueryList(searchParams.getAll("chapter")),
    cookbooks: parseQueryList(searchParams.getAll("cookbook")),
    direction: isRecipeLibrarySortDirection(direction)
      ? direction
      : getDefaultSortDirection(safeSort),
    favorite,
    q: searchParams.get("q")?.trim() ?? "",
    sort: safeSort,
    sources: parseQueryList(searchParams.getAll("source")),
    tags: parseQueryList(searchParams.getAll("tag")),
    topRated: !favorite && searchParams.get("topRated") === "1",
    view: isRecipeLibraryView(view) ? view : "grid",
    websites: parseQueryList(searchParams.getAll("website")),
  };
}

export function getRecipeLibraryResults(
  recipes: readonly Recipe[],
  query: RecipeLibraryQuery,
): Recipe[] {
  const websiteCounts = getWebsiteCounts(recipes);
  const terms = query.q
    .toLowerCase()
    .split(/\s+/)
    .filter(Boolean);

  const filteredRecipes =
    terms.length === 0 &&
    query.tags.length === 0 &&
    query.chapters.length === 0 &&
    query.sources.length === 0 &&
    query.cookbooks.length === 0 &&
    query.websites.length === 0 &&
    !query.favorite &&
    !query.topRated
      ? [...recipes]
      : recipes.filter((recipe) => {
          const haystack = [
            recipe.title,
            recipe.description,
            recipe.yield?.notes,
            recipe.source?.name,
            ...recipe.tags,
          ]
            .filter(Boolean)
            .join(" ")
            .toLowerCase();

          return (
            terms.every((term) => haystack.includes(term)) &&
            (!query.favorite || recipe.favorite === true) &&
            (!query.topRated || (recipe.rating ?? -1) >= 8) &&
            matchesSelectedValues(recipe.tags, query.tags) &&
            matchesSelectedValues(getCookbookChapterLabelsForRecipe(recipe), query.chapters) &&
            matchesSelectedValues([getSourceTypeLabel(recipe)], query.sources) &&
            matchesSelectedValues([getCookbookLabel(recipe)].filter(Boolean), query.cookbooks) &&
            matchesSelectedWebsites(recipe, query.websites, websiteCounts)
          );
        });

  return filteredRecipes.sort((left, right) =>
    compareRecipes(left, right, query.sort, query.direction),
  );
}

export function getRecipeLibraryFacets(
  recipes: readonly Recipe[],
  query: RecipeLibraryQuery,
): RecipeLibraryFacetGroup[] {
  const groups = [
    {
      id: "website",
      label: "Websites",
      options: getWebsiteFacetOptions(recipes, query),
    },
    {
      id: "tag",
      label: "Tags",
      options: getFacetOptions(recipes, query, "tag", getVisibleTagLabels),
    },
  ] satisfies RecipeLibraryFacetGroup[];

  return groups.filter((group) => group.options.length > 0);
}

export function getRecipeCookbookTree(
  recipes: readonly Recipe[],
  query: RecipeLibraryQuery,
): RecipeLibraryAuthorNode[] {
  const authors = new Map<
    string,
    {
      cookbooks: Map<
        string,
        {
          chapters: Map<string, number>;
          count: number;
        }
      >;
      count: number;
    }
  >();

  for (const recipe of recipes) {
    const cookbook = getCookbookLabel(recipe);

    if (!cookbook) {
      continue;
    }

    const author = getCookbookAuthorLabel(cookbook);
    const authorGroup = authors.get(author) ?? {
      cookbooks: new Map<string, { chapters: Map<string, number>; count: number }>(),
      count: 0,
    };
    const cookbookGroup = authorGroup.cookbooks.get(cookbook) ?? {
      chapters: new Map<string, number>(),
      count: 0,
    };
    const chapterLabels = getCookbookChapterLabels(recipe, author, cookbook);

    authorGroup.count += 1;
    cookbookGroup.count += 1;

    for (const chapter of chapterLabels) {
      cookbookGroup.chapters.set(chapter, (cookbookGroup.chapters.get(chapter) ?? 0) + 1);
    }

    authorGroup.cookbooks.set(cookbook, cookbookGroup);
    authors.set(author, authorGroup);
  }

  return [...authors.entries()]
    .map(([author, authorGroup]) => {
      const cookbookLabels = [...authorGroup.cookbooks.keys()];
      const authorHref = getLibraryQueryHref({
        ...query,
        cookbooks: cookbookLabels,
        chapters: [],
        tags: [],
      });
      const cookbooks = [...authorGroup.cookbooks.entries()]
        .map(([cookbook, cookbookGroup]) => ({
          count: cookbookGroup.count,
          href: getLibraryQueryHref({
            ...query,
            cookbooks: [cookbook],
            chapters: [],
            tags: [],
          }),
          id: `cookbook:${cookbook}`,
          label: getCookbookTitleLabel(cookbook),
          selected:
            query.cookbooks.includes(cookbook) &&
            query.tags.length === 0 &&
            query.chapters.length === 0,
          value: cookbook,
          chapters: [...cookbookGroup.chapters.entries()]
            .map(([chapter, count]) => ({
              count,
              href: getLibraryQueryHref({
                ...query,
                chapters: [chapter],
                cookbooks: [cookbook],
                tags: [],
              }),
              id: `chapter:${cookbook}:${chapter}`,
              label: chapter,
              selected: query.cookbooks.includes(cookbook) && query.chapters.includes(chapter),
              value: chapter,
            }))
            .sort((left, right) => right.count - left.count || left.label.localeCompare(right.label)),
        }))
        .sort((left, right) => right.count - left.count || left.label.localeCompare(right.label));

      return {
        count: authorGroup.count,
        href: authorHref,
        id: `author:${author}`,
        label: author,
        selected:
          cookbookLabels.length > 0 &&
          query.tags.length === 0 &&
          query.chapters.length === 0 &&
          cookbookLabels.every((cookbook) => query.cookbooks.includes(cookbook)),
        value: author,
        cookbooks,
      };
    })
    .sort((left, right) => right.count - left.count || left.label.localeCompare(right.label));
}

export function getActiveLibraryFilters(
  query: RecipeLibraryQuery,
): RecipeLibraryActiveFilter[] {
  return [
    ...query.sources.map((value) => ({
      href: getLibraryQueryHref(toggleFacetValue(query, "source", value)),
      id: `source:${value}`,
      label: `Source: ${value}`,
    })),
    ...query.websites.map((value) => ({
      href: getLibraryQueryHref(toggleFacetValue(query, "website", value)),
      id: `website:${value}`,
      label: `Website: ${value}`,
    })),
    ...query.cookbooks.map((value) => ({
      href: getLibraryQueryHref(toggleFacetValue(query, "cookbook", value)),
      id: `cookbook:${value}`,
      label: `Cookbook: ${getCookbookTitleLabel(value)}`,
    })),
    ...query.chapters.map((value) => ({
      href: getLibraryQueryHref({ ...query, chapters: toggleValue(query.chapters, value) }),
      id: `chapter:${value}`,
      label: `Chapter: ${value}`,
    })),
    ...query.tags.map((value) => ({
      href: getLibraryQueryHref(toggleFacetValue(query, "tag", value)),
      id: `tag:${value}`,
      label: value,
    })),
  ];
}

export function getRecipeSourceFilterLink(
  recipe: Recipe,
  query: RecipeLibraryQuery,
): RecipeSourceFilterLink | undefined {
  const cookbook = getCookbookLabel(recipe);

  if (cookbook) {
    return {
      href: getLibraryQueryHref({ ...query, cookbooks: [cookbook], websites: [] }),
      label: cookbook,
    };
  }

  const website = getWebsiteLabel(recipe);

  if (website) {
    return {
      href: getLibraryQueryHref({ ...query, cookbooks: [], websites: [website] }),
      label: website,
    };
  }

  return undefined;
}

export function getLibraryQueryHref(query: RecipeLibraryQuery): string {
  const params = new URLSearchParams();

  if (query.q) {
    params.set("q", query.q);
  }

  if (query.favorite) {
    params.set("favorite", "1");
  }

  if (!query.favorite && query.topRated) {
    params.set("topRated", "1");
  }

  for (const value of query.tags) {
    params.append("tag", value);
  }

  for (const value of query.chapters) {
    params.append("chapter", value);
  }

  for (const value of query.sources) {
    params.append("source", value);
  }

  for (const value of query.websites) {
    params.append("website", value);
  }

  for (const value of query.cookbooks) {
    params.append("cookbook", value);
  }

  if (query.sort !== "recent") {
    params.set("sort", query.sort);
  }

  if (query.direction !== getDefaultSortDirection(query.sort)) {
    params.set("dir", query.direction);
  }

  if (query.view !== "grid") {
    params.set("view", query.view);
  }

  const search = params.toString();

  return search ? `/?${search}` : "/";
}

export function toggleFacetValue(
  query: RecipeLibraryQuery,
  facet: RecipeLibraryFacet,
  value: string,
): RecipeLibraryQuery {
  if (facet === "tag") {
    return { ...query, tags: toggleValue(query.tags, value) };
  }

  if (facet === "source") {
    return { ...query, sources: toggleValue(query.sources, value) };
  }

  if (facet === "website") {
    return { ...query, websites: toggleValue(query.websites, value) };
  }

  return { ...query, cookbooks: toggleValue(query.cookbooks, value) };
}

export function parseBulkTagText(value: string): string[] {
  return [
    ...new Set(
      value
        .split(",")
        .map((tag) => normalizeTag(tag))
        .filter(Boolean),
    ),
  ];
}

export function addRecipeTags(recipe: Recipe, tags: string[]): Recipe {
  return {
    ...recipe,
    tags: [...new Set([...recipe.tags, ...tags])],
  };
}

export function removeRecipeTags(recipe: Recipe, tags: string[]): Recipe {
  const tagsToRemove = new Set(tags);

  return {
    ...recipe,
    tags: recipe.tags.filter((tag) => !tagsToRemove.has(normalizeTag(tag))),
  };
}

function compareRecipes(
  left: Recipe,
  right: Recipe,
  sort: RecipeLibrarySort,
  direction: RecipeLibrarySortDirection,
): number {
  const multiplier = direction === "asc" ? 1 : -1;

  if (sort === "title") {
    return left.title.localeCompare(right.title) * multiplier;
  }

  if (sort === "time") {
    return multiplier * (
      (left.times?.totalMinutes ?? Number.MAX_SAFE_INTEGER) -
      (right.times?.totalMinutes ?? Number.MAX_SAFE_INTEGER)
    );
  }

  if (sort === "rating") {
    return multiplier * ((left.rating ?? -1) - (right.rating ?? -1));
  }

  return left.updatedAt.localeCompare(right.updatedAt) * multiplier;
}

function isRecipeLibrarySort(value: string | null): value is RecipeLibrarySort {
  return recipeLibrarySortOptions.includes(value as RecipeLibrarySort);
}

function isRecipeLibrarySortDirection(
  value: string | null,
): value is RecipeLibrarySortDirection {
  return recipeLibrarySortDirectionOptions.includes(
    value as RecipeLibrarySortDirection,
  );
}

function isRecipeLibraryView(value: string | null): value is RecipeLibraryView {
  return recipeLibraryViewOptions.includes(value as RecipeLibraryView);
}

export function getDefaultSortDirection(
  sort: RecipeLibrarySort,
): RecipeLibrarySortDirection {
  return sort === "recent" || sort === "rating" ? "desc" : "asc";
}

function getFacetOptions(
  recipes: readonly Recipe[],
  query: RecipeLibraryQuery,
  facet: RecipeLibraryFacet,
  getValues: (recipe: Recipe) => string[],
): RecipeLibraryFacetOption[] {
  const counts = new Map<string, number>();

  for (const recipe of recipes) {
    for (const value of getValues(recipe).map(normalizeTag).filter(Boolean)) {
      counts.set(value, (counts.get(value) ?? 0) + 1);
    }
  }

  return [...counts.entries()]
    .map(([value, count]) => ({
      count,
      href: getLibraryQueryHref(toggleFacetValue(query, facet, value)),
      id: `${facet}:${value}`,
      label: value,
      selected: getSelectedValues(query, facet).includes(value),
      value,
    }))
    .sort((left, right) => right.count - left.count || left.label.localeCompare(right.label));
}

function getSelectedValues(
  query: RecipeLibraryQuery,
  facet: RecipeLibraryFacet,
): string[] {
  if (facet === "tag") {
    return query.tags;
  }

  if (facet === "source") {
    return query.sources;
  }

  if (facet === "website") {
    return query.websites;
  }

  return query.cookbooks;
}

function getSourceTypeLabel(recipe: Recipe): string {
  if (getCookbookLabel(recipe)) {
    return "Cookbook";
  }

  if (getWebsiteLabel(recipe)) {
    return "Website";
  }

  const sourceType = recipe.source?.type ?? "manual";

  return `${sourceType.slice(0, 1).toUpperCase()}${sourceType.slice(1)}`;
}

function getCookbookLabel(recipe: Recipe): string {
  if (recipe.source?.type !== "imported" || !recipe.source.name) {
    return "";
  }

  if (getWebsiteLabel(recipe)) {
    return "";
  }

  return isCookbookSourceName(recipe.source.name) ? recipe.source.name : "";
}

function getCookbookAuthorLabel(cookbook: string): string {
  return cookbook.split(" - ")[0]?.trim() || cookbook;
}

function getCookbookTitleLabel(cookbook: string): string {
  return cookbook.split(" - ").slice(1).join(" - ").trim() || cookbook;
}

function getCookbookChapterLabels(
  recipe: Recipe,
  author: string,
  cookbook: string,
): string[] {
  const chapterOverrides = getCookbookChapterOverrides(recipe);

  if (chapterOverrides.length > 0) {
    return chapterOverrides.map(normalizeTag).filter(Boolean);
  }

  const cookbookTitle = getCookbookTitleLabel(cookbook);
  const excludedTags = new Set([
    normalizeTag(author),
    normalizeTag(cookbook),
    normalizeTag(cookbookTitle),
    "Easy",
    "Medium",
    "Hard",
    ...internalFixtureTags,
  ]);

  return [
    ...new Set(
      recipe.tags
        .map(normalizeTag)
        .filter((tag) => tag && !excludedTags.has(tag)),
    ),
  ];
}

function getCookbookChapterLabelsForRecipe(recipe: Recipe): string[] {
  const cookbook = getCookbookLabel(recipe);

  if (!cookbook) {
    return [];
  }

  return getCookbookChapterLabels(
    recipe,
    getCookbookAuthorLabel(cookbook),
    cookbook,
  );
}

function getVisibleTagLabels(recipe: Recipe): string[] {
  const tags = recipe.tags.map(normalizeTag).filter(Boolean);

  if (tags.length === 0) {
    return [];
  }

  const cookbook = getCookbookLabel(recipe);

  if (!cookbook) {
    return tags;
  }

  const cookbookTitle = getCookbookTitleLabel(cookbook);
  const hiddenTags = new Set([
    normalizeTag(getCookbookAuthorLabel(cookbook)),
    normalizeTag(cookbook),
    normalizeTag(cookbookTitle),
    "Easy",
    "Medium",
    "Hard",
    ...internalFixtureTags,
    ...getCookbookChapterLabelsForRecipe(recipe),
  ]);

  return tags.filter((tag) => !hiddenTags.has(tag));
}

function getWebsiteFacetOptions(
  recipes: readonly Recipe[],
  query: RecipeLibraryQuery,
): RecipeLibraryFacetOption[] {
  const counts = getWebsiteCounts(recipes);
  const options = [...counts.entries()]
    .filter(([, count]) => count >= websiteFacetMinimumRecipeCount)
    .map(([value, count]) => ({
      count,
      href: getLibraryQueryHref(toggleFacetValue(query, "website", value)),
      id: `website:${value}`,
      label: value,
      selected: query.websites.includes(value),
      value,
    }));
  const otherCount = [...counts.values()]
    .filter((count) => count < websiteFacetMinimumRecipeCount)
    .reduce((sum, count) => sum + count, 0);

  if (otherCount > 0) {
    options.push({
      count: otherCount,
      href: getLibraryQueryHref(
        toggleFacetValue(query, "website", otherWebsitesFacetValue),
      ),
      id: `website:${otherWebsitesFacetValue}`,
      label: otherWebsitesFacetValue,
      selected: query.websites.includes(otherWebsitesFacetValue),
      value: otherWebsitesFacetValue,
    });
  }

  return options.sort((left, right) => {
    if (left.value === otherWebsitesFacetValue) {
      return 1;
    }

    if (right.value === otherWebsitesFacetValue) {
      return -1;
    }

    return right.count - left.count || left.label.localeCompare(right.label);
  });
}

function getWebsiteCounts(recipes: readonly Recipe[]): Map<string, number> {
  const counts = new Map<string, number>();

  for (const recipe of recipes) {
    const website = getWebsiteLabel(recipe);

    if (!website) {
      continue;
    }

    counts.set(website, (counts.get(website) ?? 0) + 1);
  }

  return counts;
}

function getWebsiteLabel(recipe: Recipe): string {
  const sourceName = normalizeWebsiteSource(recipe.source?.name ?? "");

  if (sourceName) {
    return sourceName;
  }

  try {
    const hostname = recipe.source?.url ? new URL(recipe.source.url).hostname : "";

    return normalizeWebsiteSource(hostname);
  } catch {
    return "";
  }
}

function normalizeWebsiteSource(value: string): string {
  const trimmed = value.trim().toLowerCase().replace(/^https?:\/\//, "");
  const hostname = trimmed.split("/")[0]?.replace(/^www\./, "") ?? "";

  return isDomainLikeSource(hostname) ? hostname : "";
}

function isDomainLikeSource(value: string): boolean {
  return /^[a-z0-9-]+(?:\.[a-z0-9-]+)+$/i.test(value);
}

function isCookbookSourceName(value: string): boolean {
  return value.includes(" - ") || knownCookbookSourceNames.has(value);
}

function matchesSelectedWebsites(
  recipe: Recipe,
  selectedWebsites: string[],
  websiteCounts: Map<string, number>,
): boolean {
  if (selectedWebsites.length === 0) {
    return true;
  }

  const website = getWebsiteLabel(recipe);

  if (!website) {
    return false;
  }

  if (selectedWebsites.includes(website)) {
    return true;
  }

  return (
    selectedWebsites.includes(otherWebsitesFacetValue) &&
    (websiteCounts.get(website) ?? 0) < websiteFacetMinimumRecipeCount
  );
}

function matchesSelectedValues(values: string[], selectedValues: string[]): boolean {
  if (selectedValues.length === 0) {
    return true;
  }

  const normalizedValues = new Set(values.map(normalizeTag));

  return selectedValues.some((value) => normalizedValues.has(value));
}

function parseQueryList(values: string[]): string[] {
  return [...new Set(values.map((value) => normalizeTag(value)).filter(Boolean))];
}

function toggleValue(values: string[], value: string): string[] {
  const normalizedValue = normalizeTag(value);

  return values.includes(normalizedValue)
    ? values.filter((entry) => entry !== normalizedValue)
    : [...values, normalizedValue];
}

function normalizeTag(value: string): string {
  return value.trim().replace(/\s+/g, " ");
}
