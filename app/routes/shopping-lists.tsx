import { Form, Link, redirect, useSearchParams } from "react-router";
import { and, eq } from "drizzle-orm";
import type { Route } from "./+types/shopping-lists";
import { requireUser } from "~/lib/auth.server";
import { createDb, schema } from "~/db";

export function meta() {
  return [{ title: "Shopping Lists — ProjectSpice" }];
}

export async function loader({ request, context }: Route.LoaderArgs) {
  const user = await requireUser(request, context);
  const d1 = context.cloudflare.env.DB;

  const listsResult = await d1
    .prepare(
      `SELECT sl.id, sl.name, sl.created_at, sl.completed_at, u.name as owner_name,
              CASE WHEN sl.user_id = ? THEN 1 ELSE 0 END as is_owner,
              COUNT(sli.id) as item_count
       FROM shopping_lists sl
       JOIN users u ON u.id = sl.user_id
       LEFT JOIN shopping_list_items sli ON sl.id = sli.shopping_list_id
       LEFT JOIN shares sh ON sh.resource_type = 'shopping_list'
        AND sh.resource_id = sl.id
        AND (sh.shared_with_user_id IS NULL OR sh.shared_with_user_id = ?)
       WHERE sl.user_id = ? OR sh.id IS NOT NULL
       GROUP BY sl.id
       ORDER BY sl.created_at DESC`
    )
    .bind(user.id, user.id, user.id)
    .all<{
      id: string;
      name: string;
      created_at: number;
      completed_at: number | null;
      owner_name: string;
      is_owner: number;
      item_count: number;
    }>();

  const lists = (listsResult.results ?? []).map((list) => ({
    id: list.id,
    name: list.name,
    createdAt: list.created_at,
    completedAt: list.completed_at,
    ownerName: list.owner_name,
    isOwner: list.is_owner === 1,
    itemCount: list.item_count,
  }));

  return { lists };
}

export async function action({ request, context }: Route.ActionArgs) {
  const user = await requireUser(request, context);
  const fd = await request.formData();
  const intent = String(fd.get("_intent") ?? "");
  const { db } = createDb(context.cloudflare.env.DB);

  if (intent === "create") {
    const name = String(fd.get("name") ?? "").trim();
    if (!name) return { error: "List name is required." };
    const recipeId = String(fd.get("recipeId") ?? "").trim() || null;
    const [list] = await db
      .insert(schema.shoppingLists)
      .values({ userId: user.id, name })
      .returning({ id: schema.shoppingLists.id });
    if (fd.get("shared") === "family") {
      await db.insert(schema.shares).values({
        id: crypto.randomUUID(),
        resourceType: "shopping_list",
        resourceId: list.id,
        sharedByUserId: user.id,
        sharedWithUserId: null,
      });
    }
    const dest = recipeId
      ? `/shopping-lists/${list.id}?addFromRecipeId=${recipeId}`
      : `/shopping-lists/${list.id}`;
    return redirect(dest);
  }

  if (intent === "delete") {
    const listId = String(fd.get("listId") ?? "");
    await db
      .delete(schema.shoppingLists)
      .where(
        and(
          eq(schema.shoppingLists.id, listId),
          eq(schema.shoppingLists.userId, user.id)
        )
      );
    return { deleted: true };
  }

  return { error: "Unknown action." };
}

export default function ShoppingListsPage({
  loaderData,
  actionData,
}: Route.ComponentProps) {
  const { lists } = loaderData;
  const [searchParams] = useSearchParams();
  const recipeId = searchParams.get("recipeId");

  const active = lists.filter((l) => !l.completedAt);
  const completed = lists.filter((l) => l.completedAt);

  function listHref(id: string) {
    return recipeId
      ? `/shopping-lists/${id}?addFromRecipeId=${recipeId}`
      : `/shopping-lists/${id}`;
  }

  return (
    <div className="min-h-screen bg-background">
      <header className="sticky top-0 z-10 bg-background border-b">
        <div className="max-w-lg mx-auto px-4 py-3 flex items-center gap-3">
          <Link
            to="/recipes"
            className="text-sm text-muted-foreground hover:text-foreground shrink-0"
          >
            ← Recipes
          </Link>
          <h1 className="font-semibold flex-1 truncate">Shopping Lists</h1>
        </div>
      </header>

      <main className="max-w-lg mx-auto px-4 py-6 space-y-6">
        {recipeId && (
          <p className="text-sm text-muted-foreground bg-muted/50 rounded-lg px-3 py-2">
            Pick a list to add recipe ingredients, or create a new one.
          </p>
        )}

        {/* Create form */}
        <Form method="post" className="flex gap-2">
          <input type="hidden" name="_intent" value="create" />
          {recipeId && <input type="hidden" name="recipeId" value={recipeId} />}
          <input
            name="name"
            placeholder="New list name…"
            className="flex-1 rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
            required
          />
          <label className="inline-flex items-center gap-1.5 text-xs text-muted-foreground border rounded-md px-2">
            <input type="checkbox" name="shared" value="family" />
            Family
          </label>
          <button
            type="submit"
            className="rounded-md bg-primary text-primary-foreground px-4 py-2 text-sm font-medium hover:bg-primary/90"
          >
            Create
          </button>
        </Form>

        {actionData && "error" in actionData && (
          <p className="text-sm text-red-500">{actionData.error}</p>
        )}

        {/* Active lists */}
        {active.length > 0 && (
          <section className="space-y-2">
            <h2 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
              Active
            </h2>
            {active.map((l) => (
              <div
                key={l.id}
                className="flex items-center gap-3 rounded-lg border p-3"
              >
                <Link to={listHref(l.id)} className="flex-1 min-w-0">
                  <div className="font-medium truncate text-sm">{l.name}</div>
                  <div className="text-xs text-muted-foreground mt-0.5">
                    {l.itemCount} item{l.itemCount !== 1 ? "s" : ""}
                    {!l.isOwner && ` · From ${l.ownerName}`}
                    {l.isOwner && " · Yours"}
                  </div>
                </Link>
                {l.isOwner && (
                  <Form method="post">
                    <input type="hidden" name="_intent" value="delete" />
                    <input type="hidden" name="listId" value={l.id} />
                    <button
                      type="submit"
                      className="text-xs text-muted-foreground hover:text-red-500 px-2 py-1"
                    >
                      Delete
                    </button>
                  </Form>
                )}
              </div>
            ))}
          </section>
        )}

        {/* Completed lists */}
        {completed.length > 0 && (
          <section className="space-y-2">
            <h2 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
              Completed
            </h2>
            {completed.map((l) => (
              <div
                key={l.id}
                className="flex items-center gap-3 rounded-lg border p-3 opacity-60"
              >
                <Link to={listHref(l.id)} className="flex-1 min-w-0">
                  <div className="font-medium truncate text-sm line-through">
                    {l.name}
                  </div>
                  <div className="text-xs text-muted-foreground mt-0.5">
                    {l.itemCount} item{l.itemCount !== 1 ? "s" : ""}
                    {!l.isOwner && ` · From ${l.ownerName}`}
                  </div>
                </Link>
                {l.isOwner && (
                  <Form method="post">
                    <input type="hidden" name="_intent" value="delete" />
                    <input type="hidden" name="listId" value={l.id} />
                    <button
                      type="submit"
                      className="text-xs text-muted-foreground hover:text-red-500 px-2 py-1"
                    >
                      Delete
                    </button>
                  </Form>
                )}
              </div>
            ))}
          </section>
        )}

        {lists.length === 0 && !recipeId && (
          <p className="text-center text-muted-foreground text-sm py-16">
            No shopping lists yet. Create one to get started.
          </p>
        )}
      </main>
    </div>
  );
}
