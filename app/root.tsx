import {
  isRouteErrorResponse,
  Link,
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
const clerkLocalization = {
  signIn: {
    start: {
      subtitle: "",
      title: "Sign in to ProjectSpice",
    },
  },
  signUp: {
    start: {
      subtitle: "",
      title: "Create your ProjectSpice account",
    },
  },
};

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
  isPublicAuthRoute: boolean;
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
        isPublicAuthRoute: true,
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
      isPublicAuthRoute: false,
      libraryDrawer: null,
    };
  }

  const query = parseRecipeLibraryQuery(request.url);
  const recipes = await getRecipeService(context).listSummaries();

  return {
    authBypassed,
    isPublicAuthRoute: false,
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
  const { authBypassed, isPublicAuthRoute, libraryDrawer } = loaderData as RootAppData;

  if (isPublicAuthRoute) {
    const authPage = (
      <PublicRouteFrame>
        <Outlet />
      </PublicRouteFrame>
    );

    return authBypassed ? (
      authPage
    ) : (
      <ClerkProvider loaderData={loaderData} localization={clerkLocalization}>
        {authPage}
      </ClerkProvider>
    );
  }

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

  return authBypassed ? (
    shell
  ) : (
    <ClerkProvider loaderData={loaderData} localization={clerkLocalization}>
      {shell}
    </ClerkProvider>
  );
}

function PublicRouteFrame({ children }: { children: React.ReactNode }) {
  return (
    <main className="public-route-frame">
      <div className="public-route-brand" aria-label="ProjectSpice">
        <span className="brand-mark" aria-hidden="true">PS</span>
        <strong>ProjectSpice</strong>
      </div>
      {children}
    </main>
  );
}

export function ErrorBoundary({ error }: Route.ErrorBoundaryProps) {
  let title = "Something went wrong";
  let message = "Please try again or return to the home page.";
  let actionLabel = "Go home";
  const actionHref = "/sign-in";

  if (isRouteErrorResponse(error)) {
    title = error.status === 404 ? "Page not found" : `Error ${error.status}`;
    message =
      error.status === 404
        ? "The requested page could not be found."
        : error.statusText || message;
  } else if (import.meta.env.DEV && error instanceof Error) {
    message = error.message;
    actionLabel = "Go to sign in";
  }

  return (
    <main className="plain-message-page">
      <section className="plain-message" aria-labelledby="error-title">
        {isRouteErrorResponse(error) && error.status === 404 ? (
          <p className="plain-message-code">404</p>
        ) : null}
        <h1 id="error-title">{title}</h1>
        <p>{message}</p>
        <Link className="plain-message-link" to={actionHref}>
          {actionLabel}
        </Link>
      </section>
    </main>
  );
}
