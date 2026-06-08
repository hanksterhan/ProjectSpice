import type { Recipe } from "~/modules/recipe-domain";

export const recipeLibrarySortOptions = ["recent", "title", "time"] as const;
export const recipeLibraryViewOptions = ["cards", "list"] as const;
export const maxRecipeTags = 12;

export type RecipeLibrarySort = (typeof recipeLibrarySortOptions)[number];
export type RecipeLibraryView = (typeof recipeLibraryViewOptions)[number];
export type RecipeLibraryFacet = "tag" | "source" | "cookbook";

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

export type RecipeLibraryActiveFilter = {
  href: string;
  id: string;
  label: string;
};

export type RecipeLibraryQuery = {
  cookbooks: string[];
  q: string;
  sort: RecipeLibrarySort;
  sources: string[];
  tags: string[];
  view: RecipeLibraryView;
};

export function parseRecipeLibraryQuery(url: string): RecipeLibraryQuery {
  const searchParams = new URL(url).searchParams;
  const sort = searchParams.get("sort");
  const view = searchParams.get("view");

  return {
    cookbooks: parseQueryList(searchParams.getAll("cookbook")),
    q: searchParams.get("q")?.trim() ?? "",
    sort: isRecipeLibrarySort(sort) ? sort : "recent",
    sources: parseQueryList(searchParams.getAll("source")),
    tags: parseQueryList(searchParams.getAll("tag")),
    view: isRecipeLibraryView(view) ? view : "cards",
  };
}

export function getRecipeLibraryResults(
  recipes: readonly Recipe[],
  query: RecipeLibraryQuery,
): Recipe[] {
  const terms = query.q
    .toLowerCase()
    .split(/\s+/)
    .filter(Boolean);

  const filteredRecipes =
    terms.length === 0 &&
    query.tags.length === 0 &&
    query.sources.length === 0 &&
    query.cookbooks.length === 0
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
            matchesSelectedValues(recipe.tags, query.tags) &&
            matchesSelectedValues([getSourceTypeLabel(recipe)], query.sources) &&
            matchesSelectedValues([getCookbookLabel(recipe)].filter(Boolean), query.cookbooks)
          );
        });

  return filteredRecipes.sort((left, right) =>
    compareRecipes(left, right, query.sort),
  );
}

export function getRecipeLibraryFacets(
  recipes: readonly Recipe[],
  query: RecipeLibraryQuery,
): RecipeLibraryFacetGroup[] {
  const groups: RecipeLibraryFacetGroup[] = [
    {
      id: "source",
      label: "Source",
      options: getFacetOptions(
        recipes,
        query,
        "source",
        (recipe) => [getSourceTypeLabel(recipe)],
      ),
    },
    {
      id: "cookbook",
      label: "Cookbooks",
      options: getFacetOptions(
        recipes,
        query,
        "cookbook",
        (recipe) => [getCookbookLabel(recipe)].filter(Boolean),
      ),
    },
    {
      id: "tag",
      label: "Tags",
      options: getFacetOptions(recipes, query, "tag", (recipe) => recipe.tags),
    },
  ];

  return groups.map((group) => ({
    ...group,
    options: group.options.slice(0, group.id === "tag" ? 12 : 8),
  }));
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
    ...query.cookbooks.map((value) => ({
      href: getLibraryQueryHref(toggleFacetValue(query, "cookbook", value)),
      id: `cookbook:${value}`,
      label: `Cookbook: ${value}`,
    })),
    ...query.tags.map((value) => ({
      href: getLibraryQueryHref(toggleFacetValue(query, "tag", value)),
      id: `tag:${value}`,
      label: value,
    })),
  ];
}

export function getLibraryQueryHref(query: RecipeLibraryQuery): string {
  const params = new URLSearchParams();

  if (query.q) {
    params.set("q", query.q);
  }

  for (const value of query.tags) {
    params.append("tag", value);
  }

  for (const value of query.sources) {
    params.append("source", value);
  }

  for (const value of query.cookbooks) {
    params.append("cookbook", value);
  }

  if (query.sort !== "recent") {
    params.set("sort", query.sort);
  }

  if (query.view !== "cards") {
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
): number {
  if (sort === "title") {
    return left.title.localeCompare(right.title);
  }

  if (sort === "time") {
    return (
      (left.times?.totalMinutes ?? Number.MAX_SAFE_INTEGER) -
      (right.times?.totalMinutes ?? Number.MAX_SAFE_INTEGER)
    );
  }

  return right.updatedAt.localeCompare(left.updatedAt);
}

function isRecipeLibrarySort(value: string | null): value is RecipeLibrarySort {
  return recipeLibrarySortOptions.includes(value as RecipeLibrarySort);
}

function isRecipeLibraryView(value: string | null): value is RecipeLibraryView {
  return recipeLibraryViewOptions.includes(value as RecipeLibraryView);
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

  return query.cookbooks;
}

function getSourceTypeLabel(recipe: Recipe): string {
  if (recipe.source?.type === "imported" && recipe.source.name) {
    return "Cookbook";
  }

  const sourceType = recipe.source?.type ?? "manual";

  return `${sourceType.slice(0, 1).toUpperCase()}${sourceType.slice(1)}`;
}

function getCookbookLabel(recipe: Recipe): string {
  return recipe.source?.type === "imported" ? (recipe.source.name ?? "") : "";
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
