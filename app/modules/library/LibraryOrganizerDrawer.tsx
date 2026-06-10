import { useEffect, useState } from "react";
import {
  BookOpen,
  ChevronRight,
  Clock,
  Folder,
  Globe2,
  Heart,
  History,
  LayoutGrid,
  Search,
  Star,
  Tags,
  Type,
} from "lucide-react";
import { Form, Link, useNavigate } from "react-router";

import {
  getActiveLibraryFilters,
  getDefaultSortDirection,
  getLibraryQueryHref,
  getRecipeCookbookTree,
  getRecipeLibraryFacets,
  type RecipeLibraryFacet,
  type RecipeLibraryQuery,
} from "~/modules/library/recipe-library";

type LibraryOrganizerDrawerProps = {
  activeFilters: ReturnType<typeof getActiveLibraryFilters>;
  cookbookTree: ReturnType<typeof getRecipeCookbookTree>;
  facets: ReturnType<typeof getRecipeLibraryFacets>;
  hasSearch: boolean;
  query: RecipeLibraryQuery;
};

export function LibraryOrganizerDrawer({
  activeFilters,
  cookbookTree,
  facets,
  hasSearch,
  query,
}: LibraryOrganizerDrawerProps) {
  const navigate = useNavigate();
  const [searchValue, setSearchValue] = useState(query.q);

  useEffect(() => {
    setSearchValue(query.q);
  }, [query.q]);

  useEffect(() => {
    if (searchValue === query.q) {
      return;
    }

    const timeout = window.setTimeout(() => {
      navigate(getLibraryQueryHref({ ...query, q: searchValue }), { replace: true });
    }, 250);

    return () => window.clearTimeout(timeout);
  }, [navigate, query, searchValue]);

  return (
    <div className="library-drawer-organizer">
      <Form className="drawer-filter-form" action="/" method="get" role="search">
        <label className="drawer-search-field">
          <span className="sr-only">Search</span>
          <Search className="drawer-search-icon" aria-hidden="true" />
          <input
            type="search"
            name="q"
            placeholder="Search recipes"
            value={searchValue}
            onChange={(event) => setSearchValue(event.currentTarget.value)}
          />
        </label>
        <input type="hidden" name="view" value={query.view} />
        {query.favorite ? <input type="hidden" name="favorite" value="1" /> : null}
        {query.topRated ? <input type="hidden" name="topRated" value="1" /> : null}
        {query.sort !== "recent" ? (
          <input type="hidden" name="sort" value={query.sort} />
        ) : null}
        {query.direction !== getDefaultSortDirection(query.sort) ? (
          <input type="hidden" name="dir" value={query.direction} />
        ) : null}
        {query.tags.map((tag) => (
          <input key={`tag:${tag}`} type="hidden" name="tag" value={tag} />
        ))}
        {query.chapters.map((chapter) => (
          <input key={`chapter:${chapter}`} type="hidden" name="chapter" value={chapter} />
        ))}
        {query.sources.map((source) => (
          <input key={`source:${source}`} type="hidden" name="source" value={source} />
        ))}
        {query.websites.map((website) => (
          <input key={`website:${website}`} type="hidden" name="website" value={website} />
        ))}
        {query.cookbooks.map((cookbook) => (
          <input key={`cookbook:${cookbook}`} type="hidden" name="cookbook" value={cookbook} />
        ))}
        <FilterStateChips
          activeFilters={activeFilters}
          hasSearch={hasSearch}
          query={query}
        />
      </Form>

      <LibraryModePicker query={query} />

      <div className="drawer-facet-list">
        <CookbookTree tree={cookbookTree} />

        {facets.map((group) => (
          <CollapsibleFacetGroup group={group} key={group.id} />
        ))}
      </div>
    </div>
  );
}

function CollapsibleFacetGroup({
  group,
}: {
  group: ReturnType<typeof getRecipeLibraryFacets>[number];
}) {
  const hasSelectedOption = group.options.some((option) => option.selected);
  const [isOpen, setIsOpen] = useState(hasSelectedOption);

  useEffect(() => {
    if (hasSelectedOption) {
      setIsOpen(true);
    }
  }, [hasSelectedOption]);

  return (
    <section
      className={
        isOpen
          ? "facet-group collapsible-facet-group open"
          : "facet-group collapsible-facet-group"
      }
    >
      <button
        aria-expanded={isOpen}
        className="facet-group-header facet-group-toggle-button"
        onClick={() => setIsOpen((open) => !open)}
        type="button"
      >
        <div className="drawer-section-title">
          <ChevronRight className="drawer-icon tree-chevron" />
          <LibraryFacetIcon id={group.id} />
          <h3>{group.label}</h3>
        </div>
        <span>{group.options.length}</span>
      </button>
      {isOpen ? (
        <div className="facet-options">
          {group.options.map((option) => (
            <Link
              className={option.selected ? "facet-option selected" : "facet-option"}
              key={option.id}
              to={option.href}
            >
              <span className="facet-option-label">
                <span aria-hidden="true" className="facet-option-indent" />
                <span>{option.label}</span>
              </span>
              <strong>{option.count}</strong>
            </Link>
          ))}
        </div>
      ) : null}
    </section>
  );
}

function FilterStateChips({
  activeFilters,
  hasSearch,
  query,
}: {
  activeFilters: ReturnType<typeof getActiveLibraryFilters>;
  hasSearch: boolean;
  query: RecipeLibraryQuery;
}) {
  const hasAnyFilter =
    hasSearch ||
    activeFilters.length > 0 ||
    query.favorite ||
    query.topRated;

  if (!hasAnyFilter) {
    return (
      <div className="drawer-filter-state" aria-label="Current filters">
        <span className="filter-state-empty">All recipes</span>
      </div>
    );
  }

  return (
    <div className="drawer-filter-state active" aria-label="Current filters">
      {hasSearch ? (
        <Link
          className="active-filter-chip"
          to={getLibraryQueryHref({ ...query, q: "" })}
        >
          Search: {query.q}
          <span aria-hidden="true">x</span>
        </Link>
      ) : null}
      {activeFilters.map((filter) => (
        <Link className="active-filter-chip" key={filter.id} to={filter.href}>
          {filter.label}
          <span aria-hidden="true">x</span>
        </Link>
      ))}
      {query.favorite ? (
        <Link
          className="active-filter-chip"
          to={getLibraryQueryHref({ ...query, favorite: false })}
        >
          Favorites
          <span aria-hidden="true">x</span>
        </Link>
      ) : null}
      {query.topRated ? (
        <Link
          className="active-filter-chip"
          to={getLibraryQueryHref({ ...query, topRated: false })}
        >
          Top rated
          <span aria-hidden="true">x</span>
        </Link>
      ) : null}
      <Link className="active-filter-chip clear" to={getClearFiltersHref(query)}>
        Clear
      </Link>
    </div>
  );
}

function CookbookTree({
  tree,
}: {
  tree: ReturnType<typeof getRecipeCookbookTree>;
}) {
  const hasSelectedCookbook = tree.some(
    (author) =>
      author.selected ||
      author.cookbooks.some(
        (cookbook) =>
          cookbook.selected ||
          cookbook.chapters.some((chapter) => chapter.selected),
      ),
  );
  const [isSectionOpen, setIsSectionOpen] = useState(
    hasSelectedCookbook || tree.length <= 6,
  );
  const [openNodeIds, setOpenNodeIds] = useState(() => getSelectedCookbookNodeIds(tree));

  useEffect(() => {
    if (hasSelectedCookbook) {
      setIsSectionOpen(true);
    }
  }, [hasSelectedCookbook]);

  useEffect(() => {
    const selectedNodeIds = getSelectedCookbookNodeIds(tree);

    if (selectedNodeIds.size === 0) {
      return;
    }

    setOpenNodeIds((currentNodeIds) => {
      const nextNodeIds = new Set(currentNodeIds);

      for (const nodeId of selectedNodeIds) {
        nextNodeIds.add(nodeId);
      }

      return nextNodeIds;
    });
  }, [tree]);

  function toggleNode(nodeId: string) {
    setOpenNodeIds((currentNodeIds) => {
      const nextNodeIds = new Set(currentNodeIds);

      if (nextNodeIds.has(nodeId)) {
        nextNodeIds.delete(nodeId);
      } else {
        nextNodeIds.add(nodeId);
      }

      return nextNodeIds;
    });
  }

  return (
    <details
      className="facet-group cookbook-tree collapsible-facet-group"
      open={isSectionOpen}
      onToggle={(event) => setIsSectionOpen(event.currentTarget.open)}
    >
      <summary className="facet-group-header">
        <div className="drawer-section-title">
          <ChevronRight className="drawer-icon tree-chevron" />
          <BookOpen className="drawer-icon" />
          <h3>Cookbooks</h3>
        </div>
        <span>{tree.length}</span>
      </summary>
      <div className="cookbook-tree-list">
        {tree.map((author) => {
          const authorNodeId = getCookbookNodeId("author", author.id);
          const isAuthorOpen = openNodeIds.has(authorNodeId);

          return (
            <div
              className={isAuthorOpen ? "cookbook-tree-node author open" : "cookbook-tree-node author"}
              key={author.id}
            >
              <div className={author.selected ? "cookbook-tree-row selected" : "cookbook-tree-row"}>
                <button
                  aria-expanded={isAuthorOpen}
                  aria-label={`${isAuthorOpen ? "Collapse" : "Expand"} ${author.label}`}
                  className="cookbook-tree-toggle"
                  onClick={() => toggleNode(authorNodeId)}
                  type="button"
                >
                  <ChevronRight className="drawer-icon tree-chevron" />
                </button>
                <Link className="cookbook-tree-filter" to={author.href}>
                  <span className="cookbook-tree-label">
                    <Folder className="drawer-icon tree-folder" />
                    <span>{author.label}</span>
                  </span>
                  <strong>{author.count}</strong>
                </Link>
              </div>
              {isAuthorOpen ? (
                <div className="cookbook-tree-children">
                  {author.cookbooks.map((cookbook) => {
                    const cookbookNodeId = getCookbookNodeId("cookbook", cookbook.id);
                    const isCookbookOpen = openNodeIds.has(cookbookNodeId);

                    return (
                      <div
                        className={
                          isCookbookOpen
                            ? "cookbook-tree-node cookbook open"
                            : "cookbook-tree-node cookbook"
                        }
                        key={cookbook.id}
                      >
                        <div
                          className={
                            cookbook.selected
                              ? "cookbook-tree-row selected"
                              : "cookbook-tree-row"
                          }
                        >
                          <button
                            aria-expanded={isCookbookOpen}
                            aria-label={`${isCookbookOpen ? "Collapse" : "Expand"} ${cookbook.label}`}
                            className="cookbook-tree-toggle"
                            onClick={() => toggleNode(cookbookNodeId)}
                            type="button"
                          >
                            <ChevronRight className="drawer-icon tree-chevron" />
                          </button>
                          <Link className="cookbook-tree-filter" to={cookbook.href}>
                            <span className="cookbook-tree-label">
                              <Folder className="drawer-icon tree-folder" />
                              <span>{cookbook.label}</span>
                            </span>
                            <strong>{cookbook.count}</strong>
                          </Link>
                        </div>
                        {isCookbookOpen ? (
                          <div className="cookbook-tree-children">
                            {cookbook.chapters.map((chapter) => (
                              <Link
                                className={
                                  chapter.selected ? "facet-option selected" : "facet-option"
                                }
                                key={chapter.id}
                                to={chapter.href}
                              >
                                <span className="facet-option-label">
                                  <span aria-hidden="true" className="facet-option-indent" />
                                  <span>{chapter.label}</span>
                                </span>
                                <strong>{chapter.count}</strong>
                              </Link>
                            ))}
                          </div>
                        ) : null}
                      </div>
                    );
                  })}
                </div>
              ) : null}
            </div>
          );
        })}
      </div>
    </details>
  );
}

function getSelectedCookbookNodeIds(
  tree: ReturnType<typeof getRecipeCookbookTree>,
): Set<string> {
  const nodeIds = new Set<string>();

  for (const author of tree) {
    const hasSelectedCookbook = author.cookbooks.some(
      (cookbook) =>
        cookbook.selected || cookbook.chapters.some((chapter) => chapter.selected),
    );

    if (author.selected || hasSelectedCookbook) {
      nodeIds.add(getCookbookNodeId("author", author.id));
    }

    for (const cookbook of author.cookbooks) {
      if (cookbook.selected || cookbook.chapters.some((chapter) => chapter.selected)) {
        nodeIds.add(getCookbookNodeId("cookbook", cookbook.id));
      }
    }
  }

  return nodeIds;
}

function getCookbookNodeId(type: "author" | "cookbook", id: string): string {
  return `${type}:${id}`;
}

function LibraryModePicker({ query }: { query: RecipeLibraryQuery }) {
  const activeModeId = getLibraryModeId(query);
  const modes = getLibraryModes(query);

  return (
    <section className="facet-group static-facet-group">
      <div className="facet-group-header static-facet-group-header">
        <div className="drawer-section-title">
          <span className="tree-chevron-spacer" aria-hidden="true" />
          <LayoutGrid className="drawer-icon" />
          <h3>Library Views</h3>
        </div>
        <span>{modes.length}</span>
      </div>
      <div className="facet-options">
        {modes.map((mode) => {
          const isActive = activeModeId === mode.id;
          const href =
            isActive && mode.canToggleDirection
              ? getLibraryModeHref(query, {
                  ...mode,
                  direction: getNextSortDirection(query.direction),
                })
              : mode.href;

          return (
            <Link
              className={isActive ? "facet-option selected" : "facet-option"}
              key={mode.id}
              title={
                isActive && mode.canToggleDirection
                  ? `Switch to ${getDirectionPillLabel(mode.sort, getNextSortDirection(query.direction))}`
                  : undefined
              }
              to={href}
            >
              <span className="facet-option-label">
                <LibraryModeIcon id={mode.id} />
                <span>{mode.label}</span>
              </span>
              {isActive ? (
                mode.canToggleDirection ? (
                  <strong className="mode-direction">
                    {getDirectionPillLabel(mode.sort, query.direction)}
                  </strong>
                ) : (
                  <span className="sr-only">Selected</span>
                )
              ) : null}
            </Link>
          );
        })}
      </div>
    </section>
  );
}

function LibraryFacetIcon({ id }: { id: RecipeLibraryFacet }) {
  if (id === "cookbook") {
    return <BookOpen className="drawer-icon" />;
  }

  if (id === "website" || id === "source") {
    return <Globe2 className="drawer-icon" />;
  }

  return <Tags className="drawer-icon" />;
}

function LibraryModeIcon({ id }: { id: string }) {
  if (id === "favorites") {
    return <Heart className="drawer-icon" />;
  }

  if (id === "top-rated") {
    return <Star className="drawer-icon" />;
  }

  if (id === "title") {
    return <Type className="drawer-icon" />;
  }

  if (id === "time") {
    return <Clock className="drawer-icon" />;
  }

  return <History className="drawer-icon" />;
}

function getLibraryModeId(query: RecipeLibraryQuery) {
  if (query.favorite) {
    return "favorites";
  }

  if (query.topRated) {
    return "top-rated";
  }

  return query.sort;
}

function getLibraryModes(query: RecipeLibraryQuery) {
  const modes: LibraryMode[] = [
    {
      id: "recent",
      canToggleDirection: true,
      label: "Most Recent",
      sort: "recent",
    },
    {
      id: "favorites",
      favorite: true,
      label: "Favorites",
      sort: "recent",
    },
    {
      id: "top-rated",
      label: "Top Rated",
      sort: "rating",
      topRated: true,
    },
    {
      id: "title",
      canToggleDirection: true,
      label: "Title",
      sort: "title",
    },
    {
      id: "time",
      canToggleDirection: true,
      label: "Total Time",
      sort: "time",
    },
  ];

  return modes.map((mode) => ({
    ...mode,
    href: getLibraryModeHref(query, mode),
  }));
}

type LibraryMode = {
  canToggleDirection?: boolean;
  favorite?: boolean;
  id: string;
  label: string;
  sort: RecipeLibraryQuery["sort"];
  topRated?: boolean;
};

function getLibraryModeHref(
  query: RecipeLibraryQuery,
  mode: {
    direction?: RecipeLibraryQuery["direction"];
    favorite?: boolean;
    sort: RecipeLibraryQuery["sort"];
    topRated?: boolean;
  },
) {
  return getLibraryQueryHref({
    ...query,
    direction: mode.direction ?? getDefaultSortDirection(mode.sort),
    favorite: mode.favorite ?? false,
    sort: mode.sort,
    topRated: mode.topRated ?? false,
  });
}

function getNextSortDirection(direction: RecipeLibraryQuery["direction"]) {
  return direction === "asc" ? "desc" : "asc";
}

function getDirectionPillLabel(
  sort: RecipeLibraryQuery["sort"],
  direction: RecipeLibraryQuery["direction"],
) {
  if (sort === "title") {
    return direction === "asc" ? "A-Z" : "Z-A";
  }

  if (sort === "time") {
    return direction === "asc" ? "Short" : "Long";
  }

  if (sort === "rating") {
    return direction === "asc" ? "Low" : "High";
  }

  return direction === "asc" ? "Oldest" : "Newest";
}

function getClearFiltersHref(query: RecipeLibraryQuery) {
  return getLibraryQueryHref({
    ...query,
    chapters: [],
    cookbooks: [],
    favorite: false,
    q: "",
    sources: [],
    tags: [],
    topRated: false,
    websites: [],
  });
}
