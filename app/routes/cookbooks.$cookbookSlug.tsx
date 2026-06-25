import { Link } from "react-router";

import type { Route } from "./+types/cookbooks.$cookbookSlug";
import {
  getLibraryQueryHref,
  getRecipeCookbooks,
  getRecipeLibraryResults,
  parseRecipeLibraryQuery,
} from "~/modules/library/recipe-library";
import { getRecipeDetailPath } from "~/modules/recipe-viewer/recipe-detail";
import { RecipeImage } from "~/modules/ui-shell/primitives";
import { useShellCommand } from "~/modules/ui-shell/AppShell";
import { requireAuthenticatedUser } from "~/server/auth";
import { getRecipeService } from "~/server/recipes/recipe.runtime";
import { getUserPreferenceService } from "~/server/user-preferences";

export function meta({ data }: Route.MetaArgs) {
  return [
    {
      title: data?.cookbook
        ? `${data.cookbook.title} | ProjectSpice`
        : "Cookbook | ProjectSpice",
    },
  ];
}

export async function loader({ request, context, params }: Route.LoaderArgs) {
  const user = await requireAuthenticatedUser({ request, context, params });
  const query = parseRecipeLibraryQuery(request.url);
  const libraryPreferences = await getUserPreferenceService(context).getLibraryPreferences(
    user.userId,
  );
  const allRecipes = await getRecipeService(context).listSummaries();
  const cookbooks = getRecipeCookbooks(allRecipes, query, libraryPreferences);
  const cookbook = cookbooks.find((candidate) => candidate.slug === params.cookbookSlug);

  if (!cookbook) {
    throw new Response("Cookbook not found", { status: 404 });
  }

  const cookbookQuery = {
    ...query,
    chapters: [],
    cookbooks: [cookbook.value],
    direction: "asc" as const,
    hideCookbooks: false,
    page: 1,
    sort: "title" as const,
    tags: [],
  };
  const recipes = getRecipeLibraryResults(allRecipes, cookbookQuery, libraryPreferences);

  return { cookbook, recipes };
}

export default function CookbookDetail({ loaderData }: Route.ComponentProps) {
  const { cookbook, recipes } = loaderData;
  const cookbookLibraryHref = getLibraryQueryHref({
    ...parseRecipeLibraryQuery("https://spice.local/"),
    cookbooks: [cookbook.value],
  });

  useShellCommand({
    title: cookbook.title,
    eyebrow: cookbook.author ?? "Cookbook",
  });

  return (
    <div className="library-page">
      <section className="cookbook-reader-page" aria-labelledby="cookbook-heading">
        <div className="cookbook-reader-hero">
          <RecipeImage
            className="cookbook-reader-cover"
            src={cookbook.coverImageUrl}
            title={cookbook.title}
          />
          <div className="cookbook-reader-copy">
            <Link className="back-link" to="/cookbooks">
              Back to cookbooks
            </Link>
            <h2 id="cookbook-heading">{cookbook.title}</h2>
            {cookbook.author ? <p>{cookbook.author}</p> : null}
            <div className="cookbook-reader-stats">
              <span>{recipes.length === 1 ? "1 recipe" : `${recipes.length} recipes`}</span>
              <span>
                {cookbook.chapters.length === 1
                  ? "1 chapter"
                  : `${cookbook.chapters.length} chapters`}
              </span>
            </div>
          </div>
        </div>

        {cookbook.chapters.length > 0 ? (
          <section className="cookbook-chapter-list" aria-labelledby="cookbook-chapters-heading">
            <h3 id="cookbook-chapters-heading">Chapters</h3>
            <nav aria-label={`${cookbook.title} chapters`}>
              {cookbook.chapters.map((chapter, index) => (
                <Link
                  aria-label={`Chapter ${index + 1}: ${chapter.label}, ${
                    chapter.count === 1 ? "1 recipe" : `${chapter.count} recipes`
                  }`}
                  key={chapter.id}
                  to={chapter.href}
                >
                  <span className="cookbook-chapter-number">
                    {String(index + 1).padStart(2, "0")}
                  </span>
                  <span className="cookbook-chapter-title">{chapter.label}</span>
                  <strong>{chapter.count === 1 ? "1 recipe" : `${chapter.count} recipes`}</strong>
                </Link>
              ))}
            </nav>
          </section>
        ) : null}

        <div className="cookbook-reader-section-header">
          <h3>Recipes</h3>
          <Link to={cookbookLibraryHref}>View in library</Link>
        </div>

        <div className="recipe-dense-grid cookbook-recipe-grid">
          {recipes.map((recipe) => (
            <article className="recipe-grid-tile" key={recipe.id}>
              <Link className="recipe-grid-image-link" to={getRecipeDetailPath(recipe)}>
                <RecipeImage
                  className="recipe-grid-image"
                  src={recipe.imageUrl}
                  title={recipe.title}
                />
              </Link>
              <h3>
                <Link to={getRecipeDetailPath(recipe)}>{recipe.title}</Link>
              </h3>
            </article>
          ))}
        </div>
      </section>
    </div>
  );
}
