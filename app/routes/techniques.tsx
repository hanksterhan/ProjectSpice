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
    <div className="techniques-page">
      <section className="technique-results" aria-labelledby="techniques-heading">
        <div className="results-header">
          <div>
            <h2 id="techniques-heading">
              {techniques.length === 1
                ? "1 technique"
                : `${techniques.length} techniques`}
            </h2>
          </div>
        </div>

        <div className="technique-grid">
          {techniques.map((technique) => (
            <article className="technique-card" key={technique.id}>
              <Link
                aria-label={technique.title}
                className="technique-card-image-link"
                to={`/techniques/${technique.slug}`}
              >
                <RecipeImage
                  className="technique-card-image"
                  src={technique.imageUrl}
                  title={technique.title}
                />
              </Link>
              <div className="technique-card-copy">
                <div className="technique-card-kicker">
                  <span>{formatTechniqueType(technique.type)}</span>
                  {technique.pageNumber ? <span>Page {technique.pageNumber}</span> : null}
                </div>
                <h3>
                  <Link to={`/techniques/${technique.slug}`}>{technique.title}</Link>
                </h3>
                {technique.summary ? <p>{technique.summary}</p> : null}
                <p className="technique-source">{technique.sourceName}</p>
              </div>
            </article>
          ))}
        </div>
      </section>
    </div>
  );
}

function formatTechniqueType(value: string): string {
  return value.replace("-", " ");
}
