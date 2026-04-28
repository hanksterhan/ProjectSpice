import { Form, redirect } from "react-router";
import { eq, count, and } from "drizzle-orm";
import type { Route } from "./+types/onboarding.cookbook-review";
import { requireUser } from "~/lib/auth.server";
import { createDb, schema } from "~/db";
import { Chip } from "~/components/ui";

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
  const archivedCount = cookbooks.filter((cb) => cb.archived).length;
  const activeCount = cookbooks.length - archivedCount;
  const recipeCount = cookbooks.reduce((total, cb) => total + cb.recipeCount, 0);

  return (
    <main className="min-h-screen bg-paper text-ink">
      <div className="mx-auto w-full max-w-5xl px-4 py-10 sm:px-6 lg:px-8">
        <div className="grid gap-8 lg:grid-cols-[18rem_minmax(0,1fr)]">
          <aside className="space-y-5">
            <div className="flex items-center gap-3">
              <span className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary text-sm font-semibold text-primary-foreground">
                PS
              </span>
              <div>
                <p className="text-sm font-semibold text-ink">ProjectSpice</p>
                <p className="text-xs text-ink-3">Migration review</p>
              </div>
            </div>

            <div className="space-y-3">
              <Chip tone="warning">Import confidence</Chip>
              <h1 className="ps-display text-3xl text-ink">Review Your Cookbooks</h1>
              <p className="text-sm text-ink-3">
                Your recipes are imported. Now choose which source cookbooks
                should stay visible in the default library. Archived cookbooks
                remain recoverable from filters and settings.
              </p>
            </div>

            <div className="grid gap-3 sm:grid-cols-3 lg:grid-cols-1">
              <ReviewMetric value={cookbooks.length} label="Cookbooks found" />
              <ReviewMetric value={recipeCount} label="Recipes imported" />
              <ReviewMetric value={activeCount} label="Visible by default" />
            </div>
          </aside>

          <Form method="post" className="space-y-5">
          {cookbooks.length === 0 ? (
            <div className="ps-surface px-5 py-12 text-center">
              <p className="text-sm font-medium text-ink">No cookbooks were found</p>
              <p className="mt-1 text-sm text-ink-3">
                You can still continue to your imported recipes.
              </p>
            </div>
          ) : (
            <>
              <div className="ps-surface overflow-hidden">
                <div className="grid grid-cols-[minmax(0,1fr)_7rem] border-b border-rule bg-paper-3 px-4 py-3 text-xs font-semibold uppercase text-ink-3">
                  <span>Cookbook source</span>
                  <span className="text-right">Archive</span>
                </div>
                {cookbooks.map((cb) => (
                  <label
                    key={cb.id}
                    className="grid cursor-pointer grid-cols-[minmax(0,1fr)_7rem] items-center gap-4 border-b border-rule px-4 py-3 transition-colors last:border-b-0 hover:bg-paper-3"
                  >
                    <input type="hidden" name="cookbookId" value={cb.id} />
                    <span className="min-w-0">
                      <span className="block truncate text-sm font-medium text-ink">
                        {cb.name}
                      </span>
                      <span className="mt-0.5 block text-xs text-ink-3">
                        {cb.recipeCount}{" "}
                        {cb.recipeCount === 1 ? "recipe" : "recipes"}
                      </span>
                    </span>
                    <span className="flex items-center justify-end gap-2">
                      <span className="text-xs text-ink-3">Hide</span>
                      <input
                        type="checkbox"
                        name="archive"
                        value={cb.id}
                        defaultChecked={cb.archived}
                        className="h-5 w-5 shrink-0 rounded border-rule accent-primary focus-visible:ps-focus-ring"
                        aria-label={`Archive ${cb.name}`}
                      />
                    </span>
                  </label>
                ))}
              </div>

              <div className="rounded-md border border-warn/30 bg-warn/10 px-4 py-3 text-sm text-warn">
                Checked sources are hidden by default. Use archived filters or
                cookbook settings later to bring them back.
              </div>
            </>
          )}

          <div className="flex flex-col gap-3 pt-2 sm:flex-row">
            <button
              type="submit"
              name="_intent"
              value="save"
              className="ps-control border border-transparent bg-primary px-6 text-sm font-medium text-primary-foreground transition-colors hover:opacity-90 focus-visible:ps-focus-ring"
            >
              Save & Go to My Recipes
            </button>
            <button
              type="submit"
              name="_intent"
              value="skip"
              className="ps-control border border-rule bg-paper-2 px-4 text-sm font-medium text-ink transition-colors hover:bg-paper-3 focus-visible:ps-focus-ring"
            >
              Skip
            </button>
          </div>
          </Form>
        </div>
      </div>
    </main>
  );
}

function ReviewMetric({ value, label }: { value: number; label: string }) {
  return (
    <div className="rounded-md border border-rule bg-paper-2 p-3">
      <p className="text-xl font-semibold text-ink">{value.toLocaleString()}</p>
      <p className="text-xs text-ink-3">{label}</p>
    </div>
  );
}
