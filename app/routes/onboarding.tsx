import { Form, redirect } from "react-router";
import { eq } from "drizzle-orm";
import type { Route } from "./+types/onboarding";
import { requireUser } from "~/lib/auth.server";
import { createDb, schema } from "~/db";

export function meta() {
  return [{ title: "Welcome — ProjectSpice" }];
}

export async function loader({ request, context }: Route.LoaderArgs) {
  const user = await requireUser(request, context);
  const { db } = createDb(context.cloudflare.env.DB);
  const fullUser = await db.query.users.findFirst({
    where: eq(schema.users.id, user.id),
    columns: { onboardingCompletedAt: true },
  });
  if (fullUser?.onboardingCompletedAt) throw redirect("/");
  return { name: user.name };
}

// Handles path B: "start fresh" choices complete onboarding immediately.
export async function action({ request, context }: Route.ActionArgs) {
  const user = await requireUser(request, context);
  const formData = await request.formData();
  const redirectTo = (formData.get("redirectTo") as string) || "/recipes/new";

  const { db } = createDb(context.cloudflare.env.DB);
  await db
    .update(schema.users)
    .set({ onboardingCompletedAt: new Date() })
    .where(eq(schema.users.id, user.id));

  throw redirect(redirectTo);
}

export default function Onboarding({ loaderData }: Route.ComponentProps) {
  const firstName = loaderData.name.split(" ")[0];

  return (
    <main className="min-h-screen bg-background flex flex-col items-center justify-center p-4">
      <div className="w-full max-w-2xl space-y-8">
        <div className="text-center space-y-2">
          <div className="text-4xl mb-2">🌶️</div>
          <h1 className="text-3xl font-bold">Welcome, {firstName}!</h1>
          <p className="text-muted-foreground">
            Let's get your recipe library set up. How would you like to start?
          </p>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          {/* Path A: Paprika migration */}
          <a
            href="/imports/paprika"
            className="group rounded-xl border-2 border-border hover:border-primary bg-card p-6 flex flex-col gap-3 transition-colors text-left"
          >
            <div className="text-3xl">📦</div>
            <div>
              <h2 className="font-semibold text-lg group-hover:text-primary transition-colors">
                Import from Paprika
              </h2>
              <p className="text-sm text-muted-foreground mt-1">
                Migrate your existing Paprika library. Export as{" "}
                <code className="text-xs bg-muted px-1 py-0.5 rounded">
                  .paprikarecipes
                </code>{" "}
                and import all your recipes at once.
              </p>
            </div>
            <span className="text-xs font-medium text-primary mt-auto">
              Recommended for returning Paprika users →
            </span>
          </a>

          {/* Path B: Start fresh */}
          <div className="rounded-xl border-2 border-border bg-card p-6 flex flex-col gap-4">
            <div className="text-3xl">✍️</div>
            <div>
              <h2 className="font-semibold text-lg">Start Fresh</h2>
              <p className="text-sm text-muted-foreground mt-1">
                Add your first recipe by hand, via URL, or by pasting a
                ChatGPT-formatted recipe.
              </p>
            </div>
            <div className="flex flex-col gap-2 mt-auto">
              <Form method="post">
                <input type="hidden" name="redirectTo" value="/recipes/new" />
                <button
                  type="submit"
                  className="w-full rounded-md bg-primary text-primary-foreground px-4 py-2 text-sm font-medium hover:bg-primary/90 transition-colors"
                >
                  Add a Recipe Manually
                </button>
              </Form>
              <div className="flex gap-2">
                <button
                  disabled
                  title="Coming soon"
                  className="flex-1 rounded-md border px-3 py-2 text-xs font-medium text-muted-foreground bg-muted cursor-not-allowed opacity-60"
                >
                  From URL
                  <span className="ml-1 text-[10px] bg-amber-100 text-amber-700 rounded px-1">
                    soon
                  </span>
                </button>
                <button
                  disabled
                  title="Coming soon"
                  className="flex-1 rounded-md border px-3 py-2 text-xs font-medium text-muted-foreground bg-muted cursor-not-allowed opacity-60"
                >
                  GPT Paste
                  <span className="ml-1 text-[10px] bg-amber-100 text-amber-700 rounded px-1">
                    soon
                  </span>
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </main>
  );
}
