import { Link } from "react-router";

import type { Route } from "./+types/cookbooks";
import {
  getRecipeCookbooks,
  parseRecipeLibraryQuery,
} from "~/modules/library/recipe-library";
import { RecipeImage } from "~/modules/ui-shell/primitives";
import { useShellCommand } from "~/modules/ui-shell/AppShell";
import { requireAuthenticatedUser } from "~/server/auth";
import { getRecipeService } from "~/server/recipes/recipe.runtime";
import { getUserPreferenceService } from "~/server/user-preferences";

export function meta(_args: Route.MetaArgs) {
  return [{ title: "Cookbooks | ProjectSpice" }];
}

export async function loader({ request, context, params }: Route.LoaderArgs) {
  const user = await requireAuthenticatedUser({ request, context, params });
  const query = parseRecipeLibraryQuery(request.url);
  const libraryPreferences = await getUserPreferenceService(context).getLibraryPreferences(
    user.userId,
  );
  const recipes = await getRecipeService(context).listSummaries();
  const cookbooks = getRecipeCookbooks(recipes, query, libraryPreferences);

  return { cookbooks };
}

export default function CookbooksIndex({ loaderData }: Route.ComponentProps) {
  const cookbooks = loaderData.cookbooks;

  useShellCommand({
    title: "Cookbooks",
    eyebrow: "Library shelf",
  });

  return (
    <div className="library-page">
      <section className="library-results" aria-labelledby="cookbooks-heading">
        <div className="results-header">
          <div>
            <h2 id="cookbooks-heading">
              {cookbooks.length === 1 ? "1 cookbook" : `${cookbooks.length} cookbooks`}
            </h2>
          </div>
        </div>

        <div className="cookbook-shelf-grid">
          {cookbooks.map((cookbook) => (
            <article className="cookbook-shelf-card" key={cookbook.id}>
              <Link
                aria-label={cookbook.title}
                className="cookbook-cover-link"
                to={cookbook.readerHref}
              >
                <RecipeImage
                  className="cookbook-cover-image"
                  src={cookbook.coverImageUrl}
                  title={cookbook.title}
                />
              </Link>
              <div className="cookbook-shelf-copy">
                <h3>
                  <Link to={cookbook.readerHref}>{cookbook.title}</Link>
                </h3>
                {cookbook.author ? <p>{cookbook.author}</p> : null}
                <span>{cookbook.count === 1 ? "1 recipe" : `${cookbook.count} recipes`}</span>
              </div>
            </article>
          ))}
        </div>
      </section>
    </div>
  );
}
