import { useEffect, useState } from "react";
import {
  BookOpen,
  ChevronRight,
  Clock,
  Eye,
  EyeOff,
  Globe2,
  Heart,
  History,
  House,
  LayoutGrid,
  Star,
  Tags,
  Type,
  Wrench,
} from "lucide-react";
import { Form, Link, NavLink } from "react-router";

import {
  getDefaultSortDirection,
  getCookbookDefaultVisibilityActionHref,
  getLibraryQueryHref,
  getRecipeCookbooks,
  getRecipeLibraryFacets,
  type RecipeLibraryFacet,
  type RecipeLibraryQuery,
} from "~/modules/library/recipe-library";
import { RecipeImage } from "~/modules/ui-shell/primitives";

type LibraryOrganizerDrawerProps = {
  cookbooks: ReturnType<typeof getRecipeCookbooks>;
  facets: ReturnType<typeof getRecipeLibraryFacets>;
  query: RecipeLibraryQuery;
};

export function LibraryOrganizerDrawer({
  cookbooks,
  facets,
  query,
}: LibraryOrganizerDrawerProps) {
  return (
    <div className="library-drawer-organizer">
      <LibraryModePicker query={query} />

      <div className="drawer-facet-list">
        <CookbookList cookbooks={cookbooks} query={query} />

        {facets.map((group) => (
          <CollapsibleFacetGroup group={group} key={group.id} />
        ))}

        <TechniqueNavigationLink />
      </div>
    </div>
  );
}

function TechniqueNavigationLink() {
  return (
    <NavLink
      className={({ isActive }) =>
        isActive
          ? "facet-group-header drawer-navigation-link selected"
          : "facet-group-header drawer-navigation-link"
      }
      to="/techniques"
    >
      <div className="drawer-section-title">
        <span className="tree-chevron-spacer" aria-hidden="true" />
        <Wrench className="drawer-icon" />
        <h3>Techniques</h3>
      </div>
    </NavLink>
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

function CookbookList({
  cookbooks,
  query,
}: {
  cookbooks: ReturnType<typeof getRecipeCookbooks>;
  query: RecipeLibraryQuery;
}) {
  const hiddenCookbookCount = cookbooks.filter((cookbook) => !cookbook.defaultVisible).length;
  const hasSelectedCookbook = cookbooks.some(
    (cookbook) =>
      cookbook.selected || cookbook.chapters.some((chapter) => chapter.selected),
  );
  const [isSectionOpen, setIsSectionOpen] = useState(
    hasSelectedCookbook || cookbooks.length <= 12,
  );
  const [openNodeIds, setOpenNodeIds] = useState(() => getSelectedFlatCookbookNodeIds(cookbooks));

  useEffect(() => {
    if (hasSelectedCookbook) {
      setIsSectionOpen(true);
    }
  }, [hasSelectedCookbook]);

  useEffect(() => {
    const selectedNodeIds = getSelectedFlatCookbookNodeIds(cookbooks);

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
  }, [cookbooks]);

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

  if (cookbooks.length === 0) {
    return null;
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
          <h3>
            <NavLink
              className="drawer-section-title-link"
              onClick={(event) => event.stopPropagation()}
              to="/cookbooks"
            >
              Cookbooks
            </NavLink>
          </h3>
        </div>
        <span>{cookbooks.length}</span>
      </summary>
      {hiddenCookbookCount > 0 ? (
        <Form
          action={getCookbookDefaultVisibilityActionHref(query)}
          className="cookbook-default-reset-form"
          method="post"
        >
          <span>
            {hiddenCookbookCount === 1
              ? "1 cookbook hidden"
              : `${hiddenCookbookCount} cookbooks hidden`}
          </span>
          <input type="hidden" name="intent" value="reset-library" />
          <input type="hidden" name="redirectTo" value={getLibraryQueryHref(query)} />
          <button type="submit">Show all</button>
        </Form>
      ) : null}
      <div className="cookbook-tree-list title-first">
        {cookbooks.map((cookbook) => {
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
                    ? "cookbook-tree-row cookbook-title-row selected"
                    : "cookbook-tree-row cookbook-title-row"
                }
              >
                <button
                  aria-expanded={isCookbookOpen}
                  aria-label={`${isCookbookOpen ? "Collapse" : "Expand"} ${cookbook.title}`}
                  className="cookbook-tree-toggle"
                  onClick={() => toggleNode(cookbookNodeId)}
                  type="button"
                >
                  <ChevronRight className="drawer-icon tree-chevron" />
                </button>
                <Link
                  className="cookbook-tree-filter"
                  title={cookbook.author ? `${cookbook.title} by ${cookbook.author}` : cookbook.title}
                  to={cookbook.readerHref}
                >
                  <span className="cookbook-tree-label cookbook-title-label">
                    <RecipeImage
                      className="cookbook-drawer-cover"
                      src={cookbook.coverImageUrl}
                      title={cookbook.title}
                    />
                    <span>
                      <span>{cookbook.title}</span>
                      {cookbook.author ? <small>{cookbook.author}</small> : null}
                    </span>
                  </span>
                  <span className="cookbook-tree-count">{cookbook.count}</span>
                </Link>
                <Form
                  action={cookbook.visibilityHref}
                  className="cookbook-default-visibility-form"
                  method="post"
                >
                  <input type="hidden" name="cookbook" value={cookbook.value} />
                  <input
                    type="hidden"
                    name="visible"
                    value={cookbook.defaultVisible ? "0" : "1"}
                  />
                  <input
                    type="hidden"
                    name="redirectTo"
                    value={getLibraryQueryHref(query)}
                  />
                  <button
                    aria-label={
                      cookbook.defaultVisible
                        ? `Hide ${cookbook.title} from default library`
                        : `Show ${cookbook.title} in default library`
                    }
                    className={
                      cookbook.defaultVisible
                        ? "cookbook-default-visibility-toggle visible"
                        : "cookbook-default-visibility-toggle hidden"
                    }
                    title={
                      cookbook.defaultVisible
                        ? "Included in default library"
                        : "Hidden from default library"
                    }
                    type="submit"
                  >
                    {cookbook.defaultVisible ? (
                      <Eye aria-hidden="true" className="drawer-icon" />
                    ) : (
                      <EyeOff aria-hidden="true" className="drawer-icon" />
                    )}
                  </button>
                </Form>
              </div>
              {isCookbookOpen ? (
                <div className="cookbook-tree-children">
                  {cookbook.chapters.map((chapter) => (
                    <Link
                      className={chapter.selected ? "facet-option selected" : "facet-option"}
                      key={chapter.id}
                      title={chapter.label}
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
    </details>
  );
}

function getSelectedFlatCookbookNodeIds(
  cookbooks: ReturnType<typeof getRecipeCookbooks>,
): Set<string> {
  const nodeIds = new Set<string>();

  for (const cookbook of cookbooks) {
    if (cookbook.selected || cookbook.chapters.some((chapter) => chapter.selected)) {
      nodeIds.add(getCookbookNodeId("cookbook", cookbook.id));
    }
  }

  return nodeIds;
}

function getCookbookNodeId(type: "cookbook", id: string): string {
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
              className={
                isActive
                  ? "facet-option library-mode-option selected"
                  : "facet-option library-mode-option"
              }
              key={mode.id}
              title={
                isActive && mode.canToggleDirection
                  ? `Switch to ${getDirectionPillLabel(mode.sort, getNextSortDirection(query.direction))}`
                  : undefined
              }
              to={href}
            >
              <span className="facet-option-label">
                <span className="tree-chevron-spacer" aria-hidden="true" />
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
  if (id === "all-recipes") {
    return <House className="drawer-icon" />;
  }

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

  if (
    query.q.length === 0 &&
    query.tags.length === 0 &&
    query.chapters.length === 0 &&
    query.sources.length === 0 &&
    query.cookbooks.length === 0 &&
    query.websites.length === 0 &&
    !query.hideCookbooks &&
    query.sort === "recent" &&
    query.direction === getDefaultSortDirection("recent")
  ) {
    return "all-recipes";
  }

  return query.sort;
}

function getLibraryModes(query: RecipeLibraryQuery) {
  const modes: LibraryMode[] = [
    {
      id: "all-recipes",
      label: "All Recipes",
      reset: true,
      sort: "recent",
    },
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
  reset?: boolean;
  sort: RecipeLibraryQuery["sort"];
  topRated?: boolean;
};

function getLibraryModeHref(
  query: RecipeLibraryQuery,
  mode: {
    direction?: RecipeLibraryQuery["direction"];
    favorite?: boolean;
    reset?: boolean;
    sort: RecipeLibraryQuery["sort"];
    topRated?: boolean;
  },
) {
  if (mode.reset) {
    return getLibraryQueryHref({
      ...query,
      chapters: [],
      cookbooks: [],
      direction: getDefaultSortDirection("recent"),
      favorite: false,
      hideCookbooks: false,
      page: 1,
      q: "",
      sort: "recent",
      sources: [],
      tags: [],
      topRated: false,
      websites: [],
    });
  }

  return getLibraryQueryHref({
    ...query,
    direction: mode.direction ?? getDefaultSortDirection(mode.sort),
    favorite: mode.favorite ?? false,
    page: 1,
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
