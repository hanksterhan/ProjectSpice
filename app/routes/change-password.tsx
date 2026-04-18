import { Form } from "react-router";
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
    <main className="min-h-screen flex items-center justify-center p-4 bg-background">
      <div className="w-full max-w-sm">
        <h1 className="text-2xl font-bold mb-1">Change Password</h1>
        <p className="text-sm text-muted-foreground mb-8">
          Hello, {loaderData.name}
        </p>
        {actionData && "success" in actionData ? (
          <p
            role="status"
            className="text-sm text-green-700 bg-green-50 rounded-md px-3 py-2 mb-4"
          >
            Password updated successfully.
          </p>
        ) : null}
        <Form method="post" className="flex flex-col gap-4">
          {actionData && "error" in actionData ? (
            <p
              role="alert"
              className="text-sm text-red-600 bg-red-50 rounded-md px-3 py-2"
            >
              {actionData.error}
            </p>
          ) : null}
          <div className="flex flex-col gap-1">
            <label htmlFor="currentPassword" className="text-sm font-medium">
              Current Password
            </label>
            <input
              id="currentPassword"
              name="currentPassword"
              type="password"
              required
              autoComplete="current-password"
              className="rounded-md border border-input bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring"
            />
          </div>
          <div className="flex flex-col gap-1">
            <label htmlFor="newPassword" className="text-sm font-medium">
              New Password
            </label>
            <input
              id="newPassword"
              name="newPassword"
              type="password"
              required
              minLength={8}
              autoComplete="new-password"
              className="rounded-md border border-input bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring"
            />
          </div>
          <div className="flex flex-col gap-1">
            <label htmlFor="confirmPassword" className="text-sm font-medium">
              Confirm New Password
            </label>
            <input
              id="confirmPassword"
              name="confirmPassword"
              type="password"
              required
              minLength={8}
              autoComplete="new-password"
              className="rounded-md border border-input bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring"
            />
          </div>
          <button
            type="submit"
            className="mt-2 rounded-md bg-primary text-primary-foreground px-4 py-2 text-sm font-medium hover:bg-primary/90 transition-colors"
          >
            Update Password
          </button>
          <a
            href="/"
            className="text-center text-sm text-muted-foreground hover:underline"
          >
            ← Back
          </a>
        </Form>
      </div>
    </main>
  );
}
