import { Link } from "react-router";

import type { Route } from "./+types/techniques.$slug";
import type { CookbookTechniqueBlock } from "~/server/cookbook-epub";
import { useShellCommand } from "~/modules/ui-shell/AppShell";
import { RecipeImage } from "~/modules/ui-shell/primitives";
import { requireAuthenticatedUser } from "~/server/auth";
import { getCookbookTechniqueService } from "~/server/cookbook-techniques";

export function meta({ data }: Route.MetaArgs) {
  return [{ title: `${data?.technique.title ?? "Technique"} | ProjectSpice` }];
}

export async function loader({ params, request, context }: Route.LoaderArgs) {
  await requireAuthenticatedUser({ request, context, params });

  const technique = await getCookbookTechniqueService(context).getBySlug(params.slug);

  if (!technique) {
    throw new Response("Technique not found", { status: 404 });
  }

  return { technique };
}

export default function TechniqueDetail({ loaderData }: Route.ComponentProps) {
  const technique = loaderData.technique;

  useShellCommand({
    backHref: "/techniques",
    backLabel: "Techniques",
    eyebrow: technique.sourceName,
    title: technique.title,
  });

  return (
    <article className="technique-detail-page">
      <header className="technique-detail-header">
        <div>
          <p className="recipe-kicker">
            {formatTechniqueType(technique.type)}
            {technique.pageNumber ? ` · Page ${technique.pageNumber}` : ""}
          </p>
          <h1>{technique.title}</h1>
          {technique.summary ? <p>{technique.summary}</p> : null}
        </div>
        <RecipeImage
          className="technique-detail-image"
          src={technique.imageUrl}
          title={technique.title}
        />
      </header>

      <section className="technique-blocks" aria-label="Technique details">
        {technique.blocks.map((block, index) => (
          <TechniqueBlock block={block} key={`${block.type}-${index}`} />
        ))}
      </section>

      <footer className="technique-detail-footer">
        <Link className="button button-secondary" to="/techniques">
          Back to Techniques
        </Link>
      </footer>
    </article>
  );
}

function TechniqueBlock({ block }: { block: CookbookTechniqueBlock }) {
  if (block.type === "heading") {
    return <h2>{block.text}</h2>;
  }

  if (block.type === "paragraph") {
    return <p>{block.text}</p>;
  }

  if (block.type === "list") {
    return (
      <ul className="technique-list">
        {block.items.map((item) => (
          <li key={item}>{item}</li>
        ))}
      </ul>
    );
  }

  if (block.type === "callout") {
    return (
      <aside className="technique-callout">
        {block.title ? <h2>{block.title}</h2> : null}
        {block.body.map((text) => (
          <p key={text}>{text}</p>
        ))}
      </aside>
    );
  }

  return (
    <div className="technique-table-wrap">
      <table className="technique-table">
        {block.headers.length > 0 ? (
          <thead>
            <tr>
              {block.headers.map((header) => (
                <th key={header}>{header}</th>
              ))}
            </tr>
          </thead>
        ) : null}
        <tbody>
          {block.rows.map((row, rowIndex) => (
            <tr key={row.join("|") || rowIndex}>
              {row.map((cell, cellIndex) => (
                <td key={`${rowIndex}-${cellIndex}`}>{cell}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function formatTechniqueType(value: string): string {
  return value.replace("-", " ");
}
