import { useState } from "react";
import { Form, Link, useNavigation } from "react-router";
import { redirect } from "react-router";
import { and, asc, eq, isNull, notInArray } from "drizzle-orm";
import type { Route } from "./+types/collections.$id";
import { requireUser } from "~/lib/auth.server";
import { createDb, schema } from "~/db";
import { appImageSrcSet, appImageUrl } from "~/lib/image-url";
import { AppShell } from "~/components/app-shell";
import { Button, Chip, SectionHeader } from "~/components/ui";

export function meta({ data }: Route.MetaArgs) {
  const name =
    (data as { collection: { name: string } } | undefined)?.collection?.name ??
    "Collection";
  return [{ title: `${name} — ProjectSpice` }];
}

// ─── Loader ────────────────────────────────────────────────────────────────────

export async function loader({ request, context, params }: Route.LoaderArgs) {
  const user = await requireUser(request, context);
  const { db } = createDb(context.cloudflare.env.DB);

  const [collection] = await db
    .select({
      id: schema.collections.id,
      name: schema.collections.name,
      description: schema.collections.description,
    })
    .from(schema.collections)
    .where(
      and(
        eq(schema.collections.id, params.id),
        eq(schema.collections.userId, user.id)
      )
    );

  if (!collection) throw new Response("Not Found", { status: 404 });

  const recipes = await db
    .select({
      id: schema.recipes.id,
      title: schema.recipes.title,
      totalTimeMin: schema.recipes.totalTimeMin,
      imageKey: schema.recipes.imageKey,
      sortOrder: schema.collectionRecipes.sortOrder,
    })
    .from(schema.collectionRecipes)
    .innerJoin(
      schema.recipes,
      eq(schema.collectionRecipes.recipeId, schema.recipes.id)
    )
    .where(
      and(
        eq(schema.collectionRecipes.collectionId, params.id),
        isNull(schema.recipes.deletedAt)
      )
    )
    .orderBy(
      asc(schema.collectionRecipes.sortOrder),
      asc(schema.recipes.title)
    );

  // Recipes available to add (not already in this collection)
  const existingIds = recipes.map((r) => r.id);
  const available =
    existingIds.length > 0
      ? await db
          .select({ id: schema.recipes.id, title: schema.recipes.title })
          .from(schema.recipes)
          .where(
            and(
              eq(schema.recipes.userId, user.id),
              isNull(schema.recipes.deletedAt),
              notInArray(schema.recipes.id, existingIds)
            )
          )
          .orderBy(asc(schema.recipes.title))
      : await db
          .select({ id: schema.recipes.id, title: schema.recipes.title })
          .from(schema.recipes)
          .where(
            and(
              eq(schema.recipes.userId, user.id),
              isNull(schema.recipes.deletedAt)
            )
          )
          .orderBy(asc(schema.recipes.title));

  return { user, collection, recipes, available };
}

// ─── Action ────────────────────────────────────────────────────────────────────

export async function action({ request, context, params }: Route.ActionArgs) {
  const user = await requireUser(request, context);
  const fd = await request.formData();
  const intent = String(fd.get("_intent") ?? "");
  const { db } = createDb(context.cloudflare.env.DB);

  // Verify ownership
  const [collection] = await db
    .select({ id: schema.collections.id })
    .from(schema.collections)
    .where(
      and(
        eq(schema.collections.id, params.id),
        eq(schema.collections.userId, user.id)
      )
    );
  if (!collection) throw new Response("Not Found", { status: 404 });

  if (intent === "add-recipe") {
    const recipeId = String(fd.get("recipeId") ?? "");
    if (!recipeId) return redirect(`/collections/${params.id}`);

    // Verify recipe belongs to user
    const [recipe] = await db
      .select({ id: schema.recipes.id })
      .from(schema.recipes)
      .where(
        and(
          eq(schema.recipes.id, recipeId),
          eq(schema.recipes.userId, user.id),
          isNull(schema.recipes.deletedAt)
        )
      );
    if (!recipe) return redirect(`/collections/${params.id}`);

    // Assign next sort order
    const existing = await db
      .select({ sortOrder: schema.collectionRecipes.sortOrder })
      .from(schema.collectionRecipes)
      .where(eq(schema.collectionRecipes.collectionId, params.id))
      .orderBy(asc(schema.collectionRecipes.sortOrder));

    const nextOrder =
      existing.length > 0
        ? existing[existing.length - 1].sortOrder + 1
        : 0;

    await db
      .insert(schema.collectionRecipes)
      .values({
        collectionId: params.id,
        recipeId,
        sortOrder: nextOrder,
      })
      .onConflictDoNothing();

    return redirect(`/collections/${params.id}`);
  }

  if (intent === "remove-recipe") {
    const recipeId = String(fd.get("recipeId") ?? "");
    await db
      .delete(schema.collectionRecipes)
      .where(
        and(
          eq(schema.collectionRecipes.collectionId, params.id),
          eq(schema.collectionRecipes.recipeId, recipeId)
        )
      );
    return redirect(`/collections/${params.id}`);
  }

  if (intent === "move-up" || intent === "move-down") {
    const recipeId = String(fd.get("recipeId") ?? "");

    const ordered = await db
      .select({
        recipeId: schema.collectionRecipes.recipeId,
        sortOrder: schema.collectionRecipes.sortOrder,
      })
      .from(schema.collectionRecipes)
      .innerJoin(
        schema.recipes,
        eq(schema.collectionRecipes.recipeId, schema.recipes.id)
      )
      .where(
        and(
          eq(schema.collectionRecipes.collectionId, params.id),
          isNull(schema.recipes.deletedAt)
        )
      )
      .orderBy(
        asc(schema.collectionRecipes.sortOrder),
        asc(schema.recipes.title)
      );

    const idx = ordered.findIndex((r) => r.recipeId === recipeId);
    if (idx === -1) return redirect(`/collections/${params.id}`);

    const swapIdx = intent === "move-up" ? idx - 1 : idx + 1;
    if (swapIdx < 0 || swapIdx >= ordered.length) {
      return redirect(`/collections/${params.id}`);
    }

    // Normalize sort orders to sequential positions, then swap
    const newOrder = [...ordered];
    [newOrder[idx], newOrder[swapIdx]] = [newOrder[swapIdx], newOrder[idx]];

    for (let i = 0; i < newOrder.length; i++) {
      await db
        .update(schema.collectionRecipes)
        .set({ sortOrder: i })
        .where(
          and(
            eq(schema.collectionRecipes.collectionId, params.id),
            eq(schema.collectionRecipes.recipeId, newOrder[i].recipeId)
          )
        );
    }

    return redirect(`/collections/${params.id}`);
  }

  return redirect(`/collections/${params.id}`);
}

// ─── Component ─────────────────────────────────────────────────────────────────

function formatTime(min: number | null) {
  if (!min) return null;
  if (min < 60) return `${min}m`;
  const h = Math.floor(min / 60);
  const m = min % 60;
  return m ? `${h}h ${m}m` : `${h}h`;
}

function AddRecipeForm({
  available,
  busy,
}: {
  available: { id: string; title: string }[];
  busy: boolean;
}) {
  const [open, setOpen] = useState(false);

  if (available.length === 0) return null;

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="ps-control inline-flex items-center justify-center border border-transparent bg-primary px-4 text-sm font-medium text-primary-foreground hover:opacity-90 focus-visible:ps-focus-ring"
      >
        + Add Recipe
      </button>
    );
  }

  return (
    <Form method="post" className="ps-surface flex flex-col gap-2 p-3 sm:flex-row">
      <input type="hidden" name="_intent" value="add-recipe" />
      <select
        name="recipeId"
        required
        defaultValue=""
        className="ps-control flex-1 border border-rule bg-paper px-3 text-sm text-ink focus-visible:ps-focus-ring"
        autoFocus
      >
        <option value="" disabled>
          Select a recipe…
        </option>
        {available.map((r) => (
          <option key={r.id} value={r.id}>
            {r.title}
          </option>
        ))}
      </select>
      <div className="flex gap-2">
        <Button type="submit" variant="primary" disabled={busy}>
          Add
        </Button>
        <Button type="button" variant="ghost" onClick={() => setOpen(false)}>
          Cancel
        </Button>
      </div>
    </Form>
  );
}

export default function CollectionDetail({
  loaderData,
}: Route.ComponentProps) {
  const { user, collection, recipes, available } = loaderData;
  const nav = useNavigation();
  const busy = nav.state !== "idle";

  return (
    <AppShell user={user}>
      <div className="mx-auto max-w-4xl space-y-5">
        <SectionHeader
          eyebrow="Curated collection"
          title={collection.name}
          description={collection.description || "A hand-picked set for menus, seasons, projects, or family moments."}
          actions={
            <>
              <Chip>{recipes.length} recipe{recipes.length !== 1 ? "s" : ""}</Chip>
              <Link to="/settings/collections" className="ps-control inline-flex items-center justify-center border border-rule bg-paper-2 px-4 text-sm font-medium text-ink hover:bg-paper-3 focus-visible:ps-focus-ring">
                Collections
              </Link>
            </>
          }
        />

        <AddRecipeForm available={available} busy={busy} />

        {recipes.length === 0 ? (
          <div className="ps-surface px-5 py-16 text-center">
            <p className="text-base font-semibold text-ink">No recipes yet.</p>
            <p className="mt-1 text-sm text-ink-3">
              Use "Add Recipe" above to build this collection.
            </p>
          </div>
        ) : (
          <ul className="ps-surface divide-y divide-rule overflow-hidden">
            {recipes.map((r, idx) => (
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
                    <span className="text-xs text-ink-3">
                      {formatTime(r.totalTimeMin)}
                    </span>
                  )}
                </div>

                <div className="flex shrink-0 items-center gap-1">
                  <Form method="post">
                    <input type="hidden" name="_intent" value="move-up" />
                    <input type="hidden" name="recipeId" value={r.id} />
                    <button
                      type="submit"
                      disabled={busy || idx === 0}
                      aria-label={`Move ${r.title} up`}
                      className="ps-control inline-flex min-h-8 items-center justify-center px-2 text-ink-3 hover:text-ink disabled:opacity-20 focus-visible:ps-focus-ring"
                    >
                      ↑
                    </button>
                  </Form>

                  <Form method="post">
                    <input type="hidden" name="_intent" value="move-down" />
                    <input type="hidden" name="recipeId" value={r.id} />
                    <button
                      type="submit"
                      disabled={busy || idx === recipes.length - 1}
                      aria-label={`Move ${r.title} down`}
                      className="ps-control inline-flex min-h-8 items-center justify-center px-2 text-ink-3 hover:text-ink disabled:opacity-20 focus-visible:ps-focus-ring"
                    >
                      ↓
                    </button>
                  </Form>

                  <Form method="post">
                    <input type="hidden" name="_intent" value="remove-recipe" />
                    <input type="hidden" name="recipeId" value={r.id} />
                    <button
                      type="submit"
                      disabled={busy}
                      aria-label={`Remove ${r.title} from collection`}
                      className="ps-control ml-1 inline-flex min-h-8 items-center justify-center px-2 text-xs font-medium text-ink-3 hover:text-err disabled:opacity-50 focus-visible:ps-focus-ring"
                      onClick={(e) => {
                        if (
                          !confirm(`Remove "${r.title}" from this collection?`)
                        ) {
                          e.preventDefault();
                        }
                      }}
                    >
                      Remove
                    </button>
                  </Form>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </AppShell>
  );
}
