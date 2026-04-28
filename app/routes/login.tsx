import { Form, redirect } from "react-router";
import { eq } from "drizzle-orm";
import type { Route } from "./+types/login";
import { createDb, schema } from "~/db";
import { verifyPassword, createUserSession, getUserId } from "~/lib/auth.server";

export function meta() {
  return [{ title: "Sign In — ProjectSpice" }];
}

export async function loader({ request, context }: Route.LoaderArgs) {
  const userId = await getUserId(request, context);
  if (userId) throw redirect("/");
  return null;
}

export async function action({ request, context }: Route.ActionArgs) {
  const formData = await request.formData();
  const email = formData.get("email");
  const password = formData.get("password");

  if (typeof email !== "string" || typeof password !== "string") {
    return { error: "Invalid form submission." };
  }

  const { db } = createDb(context.cloudflare.env.DB);
  const user = await db.query.users.findFirst({
    where: eq(schema.users.email, email.toLowerCase().trim()),
  });

  // Same error for unknown email vs wrong password to avoid user enumeration
  if (!user || !(await verifyPassword(password, user.passwordHash))) {
    return { error: "Invalid email or password." };
  }

  const redirectTo = user.onboardingCompletedAt ? "/" : "/onboarding";
  return createUserSession(request, context, user.id, redirectTo);
}

export default function Login({ actionData }: Route.ComponentProps) {
  return (
    <main className="min-h-screen bg-paper px-4 py-10 text-ink">
      <div className="mx-auto grid min-h-[calc(100vh-5rem)] w-full max-w-5xl items-center gap-8 lg:grid-cols-[1fr_24rem]">
        <section className="hidden space-y-5 lg:block">
          <div className="flex h-14 w-14 items-center justify-center rounded-lg bg-primary text-lg font-semibold text-primary-foreground">
            PS
          </div>
          <div className="max-w-xl space-y-3">
            <p className="text-xs font-semibold uppercase text-ink-3">Family cookbook</p>
            <h1 className="ps-display text-5xl text-ink">ProjectSpice</h1>
            <p className="text-base text-ink-3">
              Keep recipes, shopping, imports, and cooking memories organized in one calm kitchen workspace.
            </p>
          </div>
        </section>

        <section className="ps-surface w-full p-6 shadow-[var(--shadow-2)]">
          <div className="mb-6 space-y-2">
            <div className="flex items-center gap-3 lg:hidden">
              <span className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary text-sm font-semibold text-primary-foreground">
                PS
              </span>
              <span className="text-lg font-semibold text-ink">ProjectSpice</span>
            </div>
            <h2 className="ps-display text-2xl text-ink">Sign in</h2>
            <p className="text-sm text-ink-3">Return to your recipe library and cooking plan.</p>
          </div>

          <Form method="post" className="flex flex-col gap-4">
            {actionData?.error ? (
              <p
                role="alert"
                className="rounded-md border border-err/30 bg-err/10 px-3 py-2 text-sm text-err"
              >
                {actionData.error}
              </p>
            ) : null}
            <div className="flex flex-col gap-1">
              <label htmlFor="email" className="text-sm font-medium text-ink">
                Email
              </label>
              <input
                id="email"
                name="email"
                type="email"
                required
                autoComplete="email"
                autoFocus
                className="ps-control border border-rule bg-paper px-3 text-sm text-ink placeholder:text-ink-4 focus-visible:ps-focus-ring"
              />
            </div>
            <div className="flex flex-col gap-1">
              <label htmlFor="password" className="text-sm font-medium text-ink">
                Password
              </label>
              <input
                id="password"
                name="password"
                type="password"
                required
                autoComplete="current-password"
                className="ps-control border border-rule bg-paper px-3 text-sm text-ink placeholder:text-ink-4 focus-visible:ps-focus-ring"
              />
            </div>
            <button
              type="submit"
              className="ps-control mt-2 border border-transparent bg-primary px-4 text-sm font-medium text-primary-foreground transition-colors hover:opacity-90 focus-visible:ps-focus-ring"
            >
              Sign In
            </button>
          </Form>
        </section>
      </div>
    </main>
  );
}
