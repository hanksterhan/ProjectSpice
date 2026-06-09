import {
  isRouteErrorResponse,
  Links,
  Meta,
  Outlet,
  Scripts,
  ScrollRestoration,
  useLoaderData,
} from "react-router";

import type { Route } from "./+types/root";
import { AppShell } from "./modules/ui-shell/AppShell";
import { LibraryOrganizerDrawer } from "./modules/library/LibraryOrganizerDrawer";
import {
  getActiveLibraryFilters,
  getRecipeCookbookTree,
  getRecipeLibraryFacets,
  parseRecipeLibraryQuery,
} from "./modules/library/recipe-library";
import { getRecipeService } from "./server/recipes/recipe.runtime";
import "./app.css";

export function meta(_args: Route.MetaArgs) {
  return [
    { title: "ProjectSpice" },
    {
      name: "description",
      content: "A small AI-native recipe workbench for creating and refining recipes.",
    },
  ];
}

export async function loader({ request, context }: Route.LoaderArgs) {
  const query = parseRecipeLibraryQuery(request.url);
  const recipes = await getRecipeService(context).list();

  return {
    libraryDrawer: {
      activeFilters: getActiveLibraryFilters(query),
      cookbookTree: getRecipeCookbookTree(recipes, query),
      facets: getRecipeLibraryFacets(recipes, query),
      hasSearch: query.q.length > 0,
      query,
    },
  };
}

export function Layout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <head>
        <meta charSet="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <script
          dangerouslySetInnerHTML={{
            __html:
              "try{var t=localStorage.getItem('projectspice-theme');if(t==='dark'||t==='light'){document.documentElement.dataset.theme=t;document.documentElement.style.colorScheme=t;}}catch(e){}",
          }}
        />
        <Meta />
        <Links />
      </head>
      <body>
        {children}
        <ScrollRestoration />
        <Scripts />
      </body>
    </html>
  );
}

export default function App() {
  const { libraryDrawer } = useLoaderData<typeof loader>();

  return (
    <AppShell
      defaultDrawer={{
        title: "Organize Library",
        content: <LibraryOrganizerDrawer {...libraryDrawer} />,
      }}
    >
      <Outlet />
    </AppShell>
  );
}

export function ErrorBoundary({ error }: Route.ErrorBoundaryProps) {
  let title = "Something went wrong";
  let message = "ProjectSpice could not render this page.";

  if (isRouteErrorResponse(error)) {
    title = error.status === 404 ? "Page not found" : `Error ${error.status}`;
    message = error.statusText || message;
  } else if (import.meta.env.DEV && error instanceof Error) {
    message = error.message;
  }

  return (
    <main className="app-frame">
      <section className="empty-state" aria-labelledby="error-title">
        <h1 id="error-title">{title}</h1>
        <p>{message}</p>
      </section>
    </main>
  );
}
