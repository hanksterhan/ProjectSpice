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
    <main className="min-h-screen flex items-center justify-center p-4 bg-background">
      <div className="w-full max-w-sm">
        <h1 className="text-3xl font-bold text-center mb-2">🌶️ ProjectSpice</h1>
        <p className="text-center text-sm text-muted-foreground mb-8">
          Your personal recipe manager
        </p>
        <Form method="post" className="flex flex-col gap-4">
          {actionData?.error ? (
            <p
              role="alert"
              className="text-sm text-red-600 bg-red-50 rounded-md px-3 py-2"
            >
              {actionData.error}
            </p>
          ) : null}
          <div className="flex flex-col gap-1">
            <label htmlFor="email" className="text-sm font-medium">
              Email
            </label>
            <input
              id="email"
              name="email"
              type="email"
              required
              autoComplete="email"
              autoFocus
              className="rounded-md border border-input bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring"
            />
          </div>
          <div className="flex flex-col gap-1">
            <label htmlFor="password" className="text-sm font-medium">
              Password
            </label>
            <input
              id="password"
              name="password"
              type="password"
              required
              autoComplete="current-password"
              className="rounded-md border border-input bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring"
            />
          </div>
          <button
            type="submit"
            className="mt-2 rounded-md bg-primary text-primary-foreground px-4 py-2 text-sm font-medium hover:bg-primary/90 transition-colors"
          >
            Sign In
          </button>
        </Form>
      </div>
    </main>
  );
}
