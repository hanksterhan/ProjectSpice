import { Form } from "react-router";
import type { Route } from "./+types/home";
import { getUser } from "~/lib/auth.server";

export function meta(_args: Route.MetaArgs) {
  return [
    { title: "ProjectSpice" },
    { name: "description", content: "Your personal recipe manager" },
  ];
}

export async function loader({ request, context }: Route.LoaderArgs) {
  const user = await getUser(request, context);
  return {
    environment: context.cloudflare.env.ENVIRONMENT,
    user: user ? { name: user.name, email: user.email } : null,
  };
}

export default function Home({ loaderData }: Route.ComponentProps) {
  return (
    <main className="min-h-screen flex flex-col items-center justify-center p-4">
      <div className="text-center max-w-lg">
        <h1 className="text-4xl font-bold mb-4">🌶️ ProjectSpice</h1>
        <p className="text-muted-foreground text-lg mb-8">
          Your personal recipe manager — coming soon.
        </p>
        {loaderData.user ? (
          <div className="flex flex-col items-center gap-3">
            <p className="text-sm text-muted-foreground">
              Signed in as <strong>{loaderData.user.name}</strong> (
              {loaderData.user.email})
            </p>
            <div className="flex gap-4 text-sm">
              <a
                href="/change-password"
                className="underline underline-offset-2 text-muted-foreground hover:text-foreground"
              >
                Change password
              </a>
              <Form method="post" action="/logout">
                <button
                  type="submit"
                  className="underline underline-offset-2 text-muted-foreground hover:text-foreground"
                >
                  Sign out
                </button>
              </Form>
            </div>
          </div>
        ) : (
          <a
            href="/login"
            className="rounded-md bg-primary text-primary-foreground px-5 py-2 text-sm font-medium hover:bg-primary/90 transition-colors"
          >
            Sign in
          </a>
        )}
        <p className="text-xs text-muted-foreground mt-10">
          Environment: {loaderData.environment}
        </p>
      </div>
    </main>
  );
}
