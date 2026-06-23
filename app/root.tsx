import {
  isRouteErrorResponse,
  Links,
  Meta,
  Outlet,
  Scripts,
  ScrollRestoration,
} from "react-router";
import { ClerkProvider } from "@clerk/react-router";
import {
  clerkMiddleware,
  rootAuthLoader,
} from "@clerk/react-router/server";

import type { Route } from "./+types/root";
import { AppShell } from "./modules/ui-shell/AppShell";
import { LibraryOrganizerDrawer } from "./modules/library/LibraryOrganizerDrawer";
import {
  getRecipeCookbookTree,
  getRecipeLibraryFacets,
  type RecipeLibraryAuthorNode,
  type RecipeLibraryFacetGroup,
  type RecipeLibraryQuery,
  parseRecipeLibraryQuery,
} from "./modules/library/recipe-library";
import {
  isAuthBypassEnabled,
  isPublicAuthPath,
  redirectToSignIn,
} from "./server/auth";
import { getRecipeService } from "./server/recipes/recipe.runtime";
import type { RuntimeLoadContext } from "./server/runtime-context";
import "./app.css";

const clerkAuthMiddleware = clerkMiddleware();

export const middleware: Route.MiddlewareFunction[] = [
  (args, next) =>
    isAuthBypassEnabled(args.context, args.request)
      ? next()
      : clerkAuthMiddleware(args, next),
];

type RootLibraryDrawerData = {
  cookbookTree: RecipeLibraryAuthorNode[];
  facets: RecipeLibraryFacetGroup[];
  query: RecipeLibraryQuery;
};

type RootAppData = {
  authBypassed: boolean;
  libraryDrawer: RootLibraryDrawerData | null;
};

export function meta(_args: Route.MetaArgs) {
  return [
    { title: "ProjectSpice" },
    {
      name: "description",
      content: "A small AI-native recipe workbench for creating and refining recipes.",
    },
  ];
}

export async function loader(args: Route.LoaderArgs) {
  if (isAuthBypassEnabled(args.context, args.request)) {
    return loadRootAppData(args.request, args.context, true);
  }

  return rootAuthLoader(args, async ({ request, context }) => {
    if (isPublicAuthPath(request.url)) {
      return {
        authBypassed: false,
        libraryDrawer: null,
      };
    }

    if (!isAuthBypassEnabled(context, request) && !request.auth.isAuthenticated) {
      throw redirectToSignIn(request);
    }

    return loadRootAppData(request, context, false);
  });
}

async function loadRootAppData(
  request: Request,
  context: RuntimeLoadContext,
  authBypassed: boolean,
): Promise<RootAppData> {
  const url = new URL(request.url);

  if (url.pathname === "/") {
    return {
      authBypassed,
      libraryDrawer: null,
    };
  }

  const query = parseRecipeLibraryQuery(request.url);
  const recipes = await getRecipeService(context).listSummaries();

  return {
    authBypassed,
    libraryDrawer: {
      cookbookTree: getRecipeCookbookTree(recipes, query),
      facets: getRecipeLibraryFacets(recipes, query),
      query,
    },
  };
}

export function Layout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
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

export default function App({ loaderData }: Route.ComponentProps) {
  const { authBypassed, libraryDrawer } = loaderData as RootAppData;
  const shell = (
    <AppShell
      authEnabled={!authBypassed}
      defaultDrawer={
        libraryDrawer
          ? {
              title: "Organize Library",
              content: <LibraryOrganizerDrawer {...libraryDrawer} />,
            }
          : null
      }
    >
      <Outlet />
    </AppShell>
  );

  return authBypassed ? shell : <ClerkProvider loaderData={loaderData}>{shell}</ClerkProvider>;
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
