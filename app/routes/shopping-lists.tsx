import { Form, Link, redirect, useSearchParams } from "react-router";
import { and, eq } from "drizzle-orm";
import type { Route } from "./+types/shopping-lists";
import { requireUser } from "~/lib/auth.server";
import { createDb, schema } from "~/db";
import { AppShell } from "~/components/app-shell";
import { Button, Chip, SectionHeader } from "~/components/ui";

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

  return { user, lists };
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
  const { user, lists } = loaderData;
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
    <AppShell user={user}>
      <div className="mx-auto max-w-3xl space-y-6">
        <SectionHeader
          eyebrow="Shopping"
          title="Shopping Lists"
          description="Plan, share, and check off groceries with stable aisle-grouped lists."
          actions={
            <Link to="/meal-planner" className="ps-control inline-flex items-center justify-center border border-rule bg-paper-2 px-4 text-sm font-medium text-ink hover:bg-paper-3 focus-visible:ps-focus-ring">
              Meal planner
            </Link>
          }
        />

        {recipeId && (
          <p className="rounded-lg border border-rule bg-paper-3 px-3 py-2 text-sm text-ink-3">
            Pick a list to add recipe ingredients, or create a new one.
          </p>
        )}

        <Form method="post" className="ps-surface grid gap-2 p-3 sm:grid-cols-[minmax(0,1fr)_auto_auto]">
          <input type="hidden" name="_intent" value="create" />
          {recipeId && <input type="hidden" name="recipeId" value={recipeId} />}
          <input
            name="name"
            placeholder="New list name..."
            className="ps-control min-w-0 border border-rule bg-paper px-3 text-sm text-ink placeholder:text-ink-4 focus-visible:ps-focus-ring"
            required
          />
          <label className="ps-control inline-flex items-center justify-center gap-2 border border-rule bg-paper-2 px-3 text-xs font-medium text-ink-3">
            <input type="checkbox" name="shared" value="family" />
            Family
          </label>
          <Button type="submit" variant="primary">
            Create
          </Button>
        </Form>

        {actionData && "error" in actionData && (
          <p className="text-sm text-err">{actionData.error}</p>
        )}

        {active.length > 0 && (
          <section className="space-y-2">
            <div className="flex items-center justify-between">
              <h2 className="text-xs font-semibold uppercase text-ink-3">Active</h2>
              <Chip>{active.length} open</Chip>
            </div>
            {active.map((l) => (
              <div
                key={l.id}
                className="ps-row flex items-center gap-3 rounded-lg border border-rule bg-paper-2 p-3 shadow-[var(--shadow-1)]"
              >
                <Link to={listHref(l.id)} className="flex-1 min-w-0">
                  <div className="truncate text-sm font-semibold text-ink">{l.name}</div>
                  <div className="mt-0.5 text-xs text-ink-3">
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
                      className="ps-control inline-flex min-h-8 items-center justify-center px-2 text-xs font-medium text-ink-3 hover:text-err focus-visible:ps-focus-ring"
                    >
                      Delete
                    </button>
                  </Form>
                )}
              </div>
            ))}
          </section>
        )}

        {completed.length > 0 && (
          <section className="space-y-2">
            <h2 className="text-xs font-semibold uppercase text-ink-3">Completed</h2>
            {completed.map((l) => (
              <div
                key={l.id}
                className="ps-row flex items-center gap-3 rounded-lg border border-rule bg-paper-2 p-3 opacity-65"
              >
                <Link to={listHref(l.id)} className="flex-1 min-w-0">
                  <div className="truncate text-sm font-semibold text-ink line-through">
                    {l.name}
                  </div>
                  <div className="mt-0.5 text-xs text-ink-3">
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
                      className="ps-control inline-flex min-h-8 items-center justify-center px-2 text-xs font-medium text-ink-3 hover:text-err focus-visible:ps-focus-ring"
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
          <p className="ps-surface py-16 text-center text-sm text-ink-3">
            No shopping lists yet. Create one to get started.
          </p>
        )}
      </div>
    </AppShell>
  );
}
