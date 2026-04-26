import { Form, Link, redirect, useSearchParams } from "react-router";
import { and, count, desc, eq } from "drizzle-orm";
import type { Route } from "./+types/shopping-lists";
import { requireUser } from "~/lib/auth.server";
import { createDb, schema } from "~/db";

export function meta() {
  return [{ title: "Shopping Lists — ProjectSpice" }];
}

export async function loader({ request, context }: Route.LoaderArgs) {
  const user = await requireUser(request, context);
  const { db } = createDb(context.cloudflare.env.DB);

  const lists = await db
    .select({
      id: schema.shoppingLists.id,
      name: schema.shoppingLists.name,
      createdAt: schema.shoppingLists.createdAt,
      completedAt: schema.shoppingLists.completedAt,
      itemCount: count(schema.shoppingListItems.id),
    })
    .from(schema.shoppingLists)
    .leftJoin(
      schema.shoppingListItems,
      eq(schema.shoppingLists.id, schema.shoppingListItems.shoppingListId)
    )
    .where(eq(schema.shoppingLists.userId, user.id))
    .groupBy(schema.shoppingLists.id)
    .orderBy(desc(schema.shoppingLists.createdAt));

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
                  </div>
                </Link>
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
                  </div>
                </Link>
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
