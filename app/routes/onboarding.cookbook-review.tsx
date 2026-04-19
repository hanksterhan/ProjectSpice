import { Form, redirect } from "react-router";
import { eq, count, and } from "drizzle-orm";
import type { Route } from "./+types/onboarding.cookbook-review";
import { requireUser } from "~/lib/auth.server";
import { createDb, schema } from "~/db";

export function meta() {
  return [{ title: "Review Cookbooks — ProjectSpice" }];
}

export async function loader({ request, context }: Route.LoaderArgs) {
  const user = await requireUser(request, context);
  const { db } = createDb(context.cloudflare.env.DB);

  const rows = await db
    .select({
      id: schema.cookbooks.id,
      name: schema.cookbooks.name,
      archived: schema.cookbooks.archived,
      recipeCount: count(schema.cookbookRecipes.recipeId),
    })
    .from(schema.cookbooks)
    .leftJoin(
      schema.cookbookRecipes,
      eq(schema.cookbooks.id, schema.cookbookRecipes.cookbookId)
    )
    .where(eq(schema.cookbooks.userId, user.id))
    .groupBy(schema.cookbooks.id)
    .orderBy(schema.cookbooks.name);

  return { cookbooks: rows };
}

export async function action({ request, context }: Route.ActionArgs) {
  const user = await requireUser(request, context);
  const formData = await request.formData();
  const intent = formData.get("_intent");

  const { db } = createDb(context.cloudflare.env.DB);

  if (intent !== "skip") {
    // Update archived status for each cookbook
    const allIds = formData.getAll("cookbookId") as string[];
    const archivedIds = new Set(formData.getAll("archive") as string[]);

    await Promise.all(
      allIds.map((id) =>
        db
          .update(schema.cookbooks)
          .set({ archived: archivedIds.has(id) })
          .where(
            and(
              eq(schema.cookbooks.id, id),
              eq(schema.cookbooks.userId, user.id)
            )
          )
      )
    );
  }

  await db
    .update(schema.users)
    .set({ onboardingCompletedAt: new Date() })
    .where(eq(schema.users.id, user.id));

  throw redirect("/recipes");
}

export default function CookbookReview({ loaderData }: Route.ComponentProps) {
  const { cookbooks } = loaderData;

  return (
    <main className="min-h-screen bg-background">
      <div className="max-w-2xl mx-auto px-4 py-10 space-y-8">
        <div className="space-y-2">
          <h1 className="text-2xl font-bold">Review Your Cookbooks</h1>
          <p className="text-muted-foreground text-sm">
            Your recipes have been imported. Archive any cookbooks you don't
            want cluttering your default view — you can always unarchive them
            later.
          </p>
        </div>

        <Form method="post" className="space-y-4">
          {cookbooks.length === 0 ? (
            <div className="rounded-lg border bg-muted/30 px-5 py-8 text-center text-sm text-muted-foreground">
              No cookbooks were found in your import.
            </div>
          ) : (
            <>
              <div className="rounded-lg border divide-y">
                {cookbooks.map((cb) => (
                  <label
                    key={cb.id}
                    className="flex items-center gap-4 px-4 py-3 hover:bg-muted/40 cursor-pointer select-none"
                  >
                    <input type="hidden" name="cookbookId" value={cb.id} />
                    <input
                      type="checkbox"
                      name="archive"
                      value={cb.id}
                      defaultChecked={cb.archived}
                      className="h-4 w-4 rounded border-input accent-primary shrink-0"
                      aria-label={`Archive ${cb.name}`}
                    />
                    <div className="flex-1 min-w-0">
                      <span className="font-medium text-sm truncate block">
                        {cb.name}
                      </span>
                      <span className="text-xs text-muted-foreground">
                        {cb.recipeCount}{" "}
                        {cb.recipeCount === 1 ? "recipe" : "recipes"}
                      </span>
                    </div>
                    <span className="text-xs text-muted-foreground shrink-0">
                      Archive
                    </span>
                  </label>
                ))}
              </div>

              <p className="text-xs text-muted-foreground">
                Checked cookbooks are hidden by default. Use "Show archived" in
                the recipe list to reveal them.
              </p>
            </>
          )}

          <div className="flex gap-3 pt-2">
            <button
              type="submit"
              name="_intent"
              value="save"
              className="rounded-md bg-primary text-primary-foreground px-6 py-2.5 text-sm font-medium hover:bg-primary/90 transition-colors"
            >
              Save & Go to My Recipes
            </button>
            <button
              type="submit"
              name="_intent"
              value="skip"
              className="rounded-md border px-4 py-2.5 text-sm hover:bg-muted transition-colors"
            >
              Skip
            </button>
          </div>
        </Form>
      </div>
    </main>
  );
}
