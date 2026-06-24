import { Link } from "react-router";

import type { Route } from "./+types/not-found";
import { requireAuthenticatedUser } from "~/server/auth";

export function meta(_args: Route.MetaArgs) {
  return [{ title: "Page not found | ProjectSpice" }];
}

export async function loader({ request, context, params }: Route.LoaderArgs) {
  await requireAuthenticatedUser({ request, context, params });

  return null;
}

export default function NotFoundRoute() {
  return (
    <section className="not-found-route" aria-labelledby="not-found-title">
      <div className="plain-message">
        <p className="plain-message-code">404</p>
        <h1 id="not-found-title">Page not found</h1>
        <p>The requested page could not be found.</p>
        <Link className="plain-message-link" to="/">
          Go home
        </Link>
      </div>
    </section>
  );
}
