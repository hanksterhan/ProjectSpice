import { Form, Link } from "react-router";
import { eq } from "drizzle-orm";
import type { Route } from "./+types/change-password";
import { createDb, schema } from "~/db";
import { hashPassword, verifyPassword, requireUser } from "~/lib/auth.server";

export function meta() {
  return [{ title: "Change Password — ProjectSpice" }];
}

export async function loader({ request, context }: Route.LoaderArgs) {
  const user = await requireUser(request, context);
  return { name: user.name };
}

export async function action({ request, context }: Route.ActionArgs) {
  const user = await requireUser(request, context);
  const formData = await request.formData();
  const currentPassword = formData.get("currentPassword");
  const newPassword = formData.get("newPassword");
  const confirmPassword = formData.get("confirmPassword");

  if (
    typeof currentPassword !== "string" ||
    typeof newPassword !== "string" ||
    typeof confirmPassword !== "string"
  ) {
    return { error: "Invalid form submission." };
  }

  if (newPassword.length < 8) {
    return { error: "New password must be at least 8 characters." };
  }

  if (newPassword !== confirmPassword) {
    return { error: "New passwords do not match." };
  }

  const { db } = createDb(context.cloudflare.env.DB);
  const fullUser = await db.query.users.findFirst({
    where: eq(schema.users.id, user.id),
  });

  if (!fullUser || !(await verifyPassword(currentPassword, fullUser.passwordHash))) {
    return { error: "Current password is incorrect." };
  }

  await db
    .update(schema.users)
    .set({ passwordHash: await hashPassword(newPassword) })
    .where(eq(schema.users.id, user.id));

  return { success: true as const };
}

export default function ChangePassword({
  loaderData,
  actionData,
}: Route.ComponentProps) {
  return (
    <main className="min-h-screen bg-paper px-4 py-10 text-ink">
      <div className="mx-auto flex min-h-[calc(100vh-5rem)] w-full max-w-md items-center">
        <section className="ps-surface w-full p-6 shadow-[var(--shadow-2)]">
          <div className="mb-6 space-y-2">
            <Link to="/settings" className="text-sm font-medium text-ink-3 hover:text-ink">
              Back to settings
            </Link>
            <h1 className="ps-display text-2xl text-ink">Change Password</h1>
            <p className="text-sm text-ink-3">
              Signed in as {loaderData.name}
            </p>
          </div>
          {actionData && "success" in actionData ? (
            <p
              role="status"
              className="mb-4 rounded-md border border-ok/30 bg-ok/10 px-3 py-2 text-sm text-ok"
            >
              Password updated successfully.
            </p>
          ) : null}
          <Form method="post" className="flex flex-col gap-4">
            {actionData && "error" in actionData ? (
              <p
                role="alert"
                className="rounded-md border border-err/30 bg-err/10 px-3 py-2 text-sm text-err"
              >
                {actionData.error}
              </p>
            ) : null}
            <div className="flex flex-col gap-1">
              <label htmlFor="currentPassword" className="text-sm font-medium text-ink">
                Current Password
              </label>
              <input
                id="currentPassword"
                name="currentPassword"
                type="password"
                required
                autoComplete="current-password"
                className="ps-control border border-rule bg-paper px-3 text-sm text-ink placeholder:text-ink-4 focus-visible:ps-focus-ring"
              />
            </div>
            <div className="flex flex-col gap-1">
              <label htmlFor="newPassword" className="text-sm font-medium text-ink">
                New Password
              </label>
              <input
                id="newPassword"
                name="newPassword"
                type="password"
                required
                minLength={8}
                autoComplete="new-password"
                className="ps-control border border-rule bg-paper px-3 text-sm text-ink placeholder:text-ink-4 focus-visible:ps-focus-ring"
              />
            </div>
            <div className="flex flex-col gap-1">
              <label htmlFor="confirmPassword" className="text-sm font-medium text-ink">
                Confirm New Password
              </label>
              <input
                id="confirmPassword"
                name="confirmPassword"
                type="password"
                required
                minLength={8}
                autoComplete="new-password"
                className="ps-control border border-rule bg-paper px-3 text-sm text-ink placeholder:text-ink-4 focus-visible:ps-focus-ring"
              />
            </div>
            <button
              type="submit"
              className="ps-control mt-2 border border-transparent bg-primary px-4 text-sm font-medium text-primary-foreground transition-colors hover:opacity-90 focus-visible:ps-focus-ring"
            >
              Update Password
            </button>
          </Form>
        </section>
      </div>
    </main>
  );
}
