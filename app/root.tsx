import {
  isRouteErrorResponse,
  Links,
  Meta,
  Outlet,
  Scripts,
  ScrollRestoration,
} from "react-router";

import type { Route } from "./+types/root";
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

export function Layout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <head>
        <meta charSet="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
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
  return <Outlet />;
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
        <p className="eyebrow">ProjectSpice</p>
        <h1 id="error-title">{title}</h1>
        <p>{message}</p>
      </section>
    </main>
  );
}
