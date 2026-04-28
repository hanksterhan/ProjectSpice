import { Form, Link, useNavigation } from "react-router";
import { redirect } from "react-router";
import { and, asc, eq, isNull } from "drizzle-orm";
import type { Route } from "./+types/cookbooks.$id";
import { requireUser } from "~/lib/auth.server";
import { createDb, schema } from "~/db";
import { appImageSrcSet, appImageUrl } from "~/lib/image-url";
import { AppShell } from "~/components/app-shell";
import { Chip, SectionHeader } from "~/components/ui";

export function meta({ data }: Route.MetaArgs) {
  const name = (data as { cookbook: { name: string } } | undefined)?.cookbook?.name ?? "Cookbook";
  return [{ title: `${name} — ProjectSpice` }];
}

// ─── Loader ────────────────────────────────────────────────────────────────────

export async function loader({ request, context, params }: Route.LoaderArgs) {
  const user = await requireUser(request, context);
  const { db } = createDb(context.cloudflare.env.DB);

  const [cookbook] = await db
    .select({
      id: schema.cookbooks.id,
      name: schema.cookbooks.name,
      description: schema.cookbooks.description,
      archived: schema.cookbooks.archived,
    })
    .from(schema.cookbooks)
    .where(
      and(
        eq(schema.cookbooks.id, params.id),
        eq(schema.cookbooks.userId, user.id)
      )
    );

  if (!cookbook) throw new Response("Not Found", { status: 404 });

  const recipes = await db
    .select({
      id: schema.recipes.id,
      title: schema.recipes.title,
      totalTimeMin: schema.recipes.totalTimeMin,
      imageKey: schema.recipes.imageKey,
      sortOrder: schema.cookbookRecipes.sortOrder,
    })
    .from(schema.cookbookRecipes)
    .innerJoin(schema.recipes, eq(schema.cookbookRecipes.recipeId, schema.recipes.id))
    .where(
      and(
        eq(schema.cookbookRecipes.cookbookId, params.id),
        isNull(schema.recipes.deletedAt)
      )
    )
    .orderBy(asc(schema.cookbookRecipes.sortOrder), asc(schema.recipes.title));

  return { user, cookbook, recipes };
}

// ─── Action ────────────────────────────────────────────────────────────────────

export async function action({ request, context, params }: Route.ActionArgs) {
  const user = await requireUser(request, context);
  const fd = await request.formData();
  const intent = String(fd.get("_intent") ?? "");
  const { db } = createDb(context.cloudflare.env.DB);

  // Verify ownership
  const [cookbook] = await db
    .select({ id: schema.cookbooks.id })
    .from(schema.cookbooks)
    .where(
      and(
        eq(schema.cookbooks.id, params.id),
        eq(schema.cookbooks.userId, user.id)
      )
    );
  if (!cookbook) throw new Response("Not Found", { status: 404 });

  if (intent === "remove-recipe") {
    const recipeId = String(fd.get("recipeId") ?? "");
    await db
      .delete(schema.cookbookRecipes)
      .where(
        and(
          eq(schema.cookbookRecipes.cookbookId, params.id),
          eq(schema.cookbookRecipes.recipeId, recipeId)
        )
      );
    return redirect(`/cookbooks/${params.id}`);
  }

  return { error: "Unknown action." };
}

// ─── Component ─────────────────────────────────────────────────────────────────

function formatTime(min: number | null) {
  if (!min) return null;
  if (min < 60) return `${min}m`;
  const h = Math.floor(min / 60);
  const m = min % 60;
  return m ? `${h}h ${m}m` : `${h}h`;
}

export default function CookbookDetail({ loaderData }: Route.ComponentProps) {
  const { user, cookbook, recipes } = loaderData;
  const nav = useNavigation();
  const busy = nav.state !== "idle";

  return (
    <AppShell user={user}>
      <div className="mx-auto max-w-4xl space-y-6">
        <SectionHeader
          eyebrow="Cookbook source"
          title={cookbook.name}
          description={cookbook.description || "A source grouping for imported or manually organized recipes."}
          actions={
            <>
              {cookbook.archived && <Chip>Archived</Chip>}
              <Chip>{recipes.length} recipe{recipes.length !== 1 ? "s" : ""}</Chip>
              <Link to="/settings/cookbooks" className="ps-control inline-flex items-center justify-center border border-rule bg-paper-2 px-4 text-sm font-medium text-ink hover:bg-paper-3 focus-visible:ps-focus-ring">
                Cookbooks
              </Link>
            </>
          }
        />

        {recipes.length === 0 ? (
          <div className="ps-surface px-5 py-16 text-center">
            <p className="text-base font-semibold text-ink">No recipes in this cookbook yet.</p>
            <p className="mt-1 text-sm text-ink-3">
              Recipes are linked to cookbooks during Paprika import, or you can add them from a{" "}
              <Link to="/recipes" className="font-medium text-ink hover:underline">
                recipe's detail page
              </Link>
              .
            </p>
          </div>
        ) : (
          <ul className="ps-surface divide-y divide-rule overflow-hidden">
            {recipes.map((r) => (
              <li key={r.id} className="ps-row flex items-center gap-3 px-4 py-3">
                {appImageUrl(r.imageKey) ? (
                  <img
                    src={appImageUrl(r.imageKey, { width: 128, format: "webp" }) ?? undefined}
                    srcSet={appImageSrcSet(r.imageKey, [96, 128, 192])}
                    sizes="48px"
                    alt=""
                    className="h-12 w-12 shrink-0 rounded object-cover"
                    loading="lazy"
                    decoding="async"
                  />
                ) : (
                  <div className="h-12 w-12 shrink-0 rounded bg-paper-3" />
                )}

                <div className="min-w-0 flex-1">
                  <Link
                    to={`/recipes/${r.id}`}
                    prefetch="intent"
                    className="block truncate text-sm font-medium text-ink hover:underline"
                  >
                    {r.title}
                  </Link>
                  {r.totalTimeMin && (
                    <span className="text-xs text-ink-3">{formatTime(r.totalTimeMin)}</span>
                  )}
                </div>

                <Form method="post">
                  <input type="hidden" name="_intent" value="remove-recipe" />
                  <input type="hidden" name="recipeId" value={r.id} />
                  <button
                    type="submit"
                    disabled={busy}
                    aria-label={`Remove ${r.title} from cookbook`}
                    className="ps-control inline-flex min-h-8 items-center justify-center px-2 text-xs font-medium text-ink-3 hover:text-err disabled:opacity-50 focus-visible:ps-focus-ring"
                    onClick={(e) => {
                      if (!confirm(`Remove "${r.title}" from this cookbook?`)) {
                        e.preventDefault();
                      }
                    }}
                  >
                    Remove
                  </button>
                </Form>
              </li>
            ))}
          </ul>
        )}
      </div>
    </AppShell>
  );
}
