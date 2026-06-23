import { Link } from "react-router";

import type { Route } from "./+types/techniques";
import { requireAuthenticatedUser } from "~/server/auth";
import { getCookbookTechniqueService } from "~/server/cookbook-techniques";
import { useShellCommand } from "~/modules/ui-shell/AppShell";
import { RecipeImage } from "~/modules/ui-shell/primitives";

export function meta(_args: Route.MetaArgs) {
  return [{ title: "Techniques | ProjectSpice" }];
}

export async function loader({ request, context, params }: Route.LoaderArgs) {
  await requireAuthenticatedUser({ request, context, params });

  const techniques = await getCookbookTechniqueService(context).listSummaries();

  return { techniques };
}

export default function TechniquesIndex({ loaderData }: Route.ComponentProps) {
  const techniques = loaderData.techniques;

  useShellCommand({
    title: "Techniques",
    eyebrow: "Cookbook reference",
  });

  return (
    <div className="library-page">
      <section className="library-results" aria-labelledby="techniques-heading">
        <div className="results-header">
          <div>
            <h2 id="techniques-heading">
              {techniques.length === 1
                ? "1 technique"
                : `${techniques.length} techniques`}
            </h2>
          </div>
        </div>

        <div className="recipe-card-grid">
          {techniques.map((technique) => (
            <article className="recipe-card technique-library-card" key={technique.id}>
              <Link
                aria-label={technique.title}
                className="recipe-card-image-link"
                to={`/techniques/${technique.slug}`}
              >
                <RecipeImage
                  className="recipe-card-image"
                  src={technique.imageUrl}
                  title={technique.title}
                />
              </Link>
              <div className="recipe-card-copy">
                <div>
                  <h3>
                    <Link to={`/techniques/${technique.slug}`}>{technique.title}</Link>
                  </h3>
                </div>
              </div>
            </article>
          ))}
        </div>
      </section>
    </div>
  );
}
