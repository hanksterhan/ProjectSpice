import { useState } from "react";
import { Form, Link, useNavigation } from "react-router";
import { redirect } from "react-router";
import { and, asc, eq, isNull, notInArray } from "drizzle-orm";
import type { Route } from "./+types/collections.$id";
import { requireUser } from "~/lib/auth.server";
import { createDb, schema } from "~/db";
import { appImageUrl } from "~/lib/image-url";

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

  return { collection, recipes, available };
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
        className="text-sm bg-gray-900 text-white px-3 py-1.5 rounded hover:bg-gray-700"
      >
        + Add Recipe
      </button>
    );
  }

  return (
    <Form method="post" className="flex flex-col sm:flex-row gap-2 bg-white border rounded-lg p-3">
      <input type="hidden" name="_intent" value="add-recipe" />
      <select
        name="recipeId"
        required
        defaultValue=""
        className="border rounded px-2 py-1.5 text-sm flex-1"
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
        <button
          type="submit"
          disabled={busy}
          className="text-sm bg-gray-900 text-white px-4 py-1.5 rounded hover:bg-gray-700 disabled:opacity-50"
        >
          Add
        </button>
        <button
          type="button"
          onClick={() => setOpen(false)}
          className="text-sm text-gray-500 px-2"
        >
          Cancel
        </button>
      </div>
    </Form>
  );
}

export default function CollectionDetail({
  loaderData,
}: Route.ComponentProps) {
  const { collection, recipes, available } = loaderData;
  const nav = useNavigation();
  const busy = nav.state !== "idle";

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white border-b px-4 py-3 flex items-center gap-3">
        <Link
          to="/settings/collections"
          className="text-gray-500 hover:text-gray-700 text-sm"
        >
          ← Collections
        </Link>
        <div className="flex-1 min-w-0">
          <h1 className="font-semibold text-gray-900 truncate">
            {collection.name}
          </h1>
          {collection.description && (
            <p className="text-xs text-gray-500 truncate">
              {collection.description}
            </p>
          )}
        </div>
        <span className="ml-auto text-sm text-gray-500 shrink-0">
          {recipes.length} recipe{recipes.length !== 1 ? "s" : ""}
        </span>
      </header>

      <main className="max-w-2xl mx-auto px-4 py-6 space-y-4">
        <AddRecipeForm available={available} busy={busy} />

        {recipes.length === 0 ? (
          <div className="text-center text-gray-500 py-16">
            <p className="text-base font-medium">No recipes yet.</p>
            <p className="text-sm mt-1">
              Use "Add Recipe" above to build this collection.
            </p>
          </div>
        ) : (
          <ul className="divide-y divide-gray-100 bg-white border rounded-lg">
            {recipes.map((r, idx) => (
              <li key={r.id} className="flex items-center gap-3 px-4 py-3">
                {appImageUrl(r.imageKey) ? (
                  <img
                    src={appImageUrl(r.imageKey) ?? undefined}
                    alt=""
                    className="w-12 h-12 rounded object-cover shrink-0"
                    loading="lazy"
                  />
                ) : (
                  <div className="w-12 h-12 rounded bg-gray-100 shrink-0" />
                )}

                <div className="flex-1 min-w-0">
                  <Link
                    to={`/recipes/${r.id}`}
                    className="font-medium text-sm text-gray-900 hover:text-blue-600 truncate block"
                  >
                    {r.title}
                  </Link>
                  {r.totalTimeMin && (
                    <span className="text-xs text-gray-400">
                      {formatTime(r.totalTimeMin)}
                    </span>
                  )}
                </div>

                <div className="flex items-center gap-1 shrink-0">
                  <Form method="post">
                    <input type="hidden" name="_intent" value="move-up" />
                    <input type="hidden" name="recipeId" value={r.id} />
                    <button
                      type="submit"
                      disabled={busy || idx === 0}
                      aria-label={`Move ${r.title} up`}
                      className="p-1.5 text-gray-400 hover:text-gray-700 disabled:opacity-20 rounded"
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
                      className="p-1.5 text-gray-400 hover:text-gray-700 disabled:opacity-20 rounded"
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
                      className="text-xs text-gray-400 hover:text-red-500 disabled:opacity-50 px-2 py-1 ml-1"
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
      </main>
    </div>
  );
}
