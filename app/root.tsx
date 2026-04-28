import {
  isRouteErrorResponse,
  Links,
  Meta,
  Outlet,
  Scripts,
  ScrollRestoration,
  useLocation,
} from "react-router";
import { useEffect } from "react";

import type { Route } from "./+types/root";
import "./app.css";
import { OfflineIndicator } from "~/components/offline-indicator";
import { OfflineLogSync } from "~/components/offline-log-sync";
import { Alert, Button } from "~/components/ui";

const DISPLAY_PREF_KEYS = {
  contrast: "spice_contrast_mode",
  fontSize: "spice_font_size",
  reducedMotion: "spice_reduced_motion",
} as const;

function applyDisplayPreferences() {
  const root = document.documentElement;
  const contrast = localStorage.getItem(DISPLAY_PREF_KEYS.contrast);
  const fontSize = localStorage.getItem(DISPLAY_PREF_KEYS.fontSize);
  const reducedMotion = localStorage.getItem(DISPLAY_PREF_KEYS.reducedMotion);

  if (contrast === "high" || contrast === "standard") {
    root.dataset.contrast = contrast;
  } else {
    delete root.dataset.contrast;
  }

  if (fontSize === "large" || fontSize === "extra-large") {
    root.dataset.fontSize = fontSize;
  } else {
    delete root.dataset.fontSize;
  }

  if (reducedMotion === "true") {
    root.dataset.reducedMotion = "true";
  } else {
    delete root.dataset.reducedMotion;
  }
}

export function meta(_args: Route.MetaArgs) {
  return [
    { title: "ProjectSpice" },
    { name: "description", content: "Your personal recipe manager" },
  ];
}

export function Layout({ children }: { children: React.ReactNode }) {
  const location = useLocation();

  useEffect(() => {
    if ("serviceWorker" in navigator) {
      navigator.serviceWorker.register("/sw.js", { scope: "/" }).catch(() => {});
    }
  }, []);

  useEffect(() => {
    applyDisplayPreferences();
    window.addEventListener("storage", applyDisplayPreferences);
    window.addEventListener("spice:display-preferences", applyDisplayPreferences);
    return () => {
      window.removeEventListener("storage", applyDisplayPreferences);
      window.removeEventListener("spice:display-preferences", applyDisplayPreferences);
    };
  }, []);

  useEffect(() => {
    if (location.pathname === "/login") {
      navigator.serviceWorker?.controller?.postMessage({ type: "CLEAR_RECIPE_CACHE" });
    }
  }, [location.pathname]);

  return (
    <html lang="en">
      <head>
        <meta charSet="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <Meta />
        <Links />
      </head>
      <body>
        <OfflineIndicator />
        <OfflineLogSync />
        {children}
        <ScrollRestoration />
        <Scripts />
      </body>
    </html>
  );
}

export default function App() {
  return <Outlet />;
}

export function ErrorBoundary({ error }: Route.ErrorBoundaryProps) {
  let message = "Something went wrong";
  let details = "An unexpected error occurred.";
  let stack: string | undefined;

  if (isRouteErrorResponse(error)) {
    message = error.status === 404 ? "Page not found" : `Error ${error.status}`;
    details =
      error.status === 404
        ? "The requested page could not be found."
        : error.statusText || details;
  } else if (import.meta.env.DEV && error && error instanceof Error) {
    details = error.message;
    stack = error.stack;
  }

  return (
    <main className="min-h-screen bg-paper px-4 py-16 text-ink">
      <div className="mx-auto max-w-2xl space-y-5">
        <div className="flex items-center gap-3">
          <span className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary text-sm font-semibold text-primary-foreground">
            PS
          </span>
          <div>
            <p className="text-sm font-semibold text-ink">ProjectSpice</p>
            <p className="text-xs text-ink-3">System feedback</p>
          </div>
        </div>

        <Alert
          tone={isRouteErrorResponse(error) && error.status === 404 ? "warning" : "danger"}
          title={message}
        >
          <p>{details}</p>
        </Alert>

        <Button type="button" onClick={() => window.history.back()}>
          Go back
        </Button>

        {stack && (
          <pre className="w-full overflow-x-auto rounded-md border border-rule bg-paper-3 p-4 text-sm text-ink-2">
            <code>{stack}</code>
          </pre>
        )}
      </div>
    </main>
  );
}
