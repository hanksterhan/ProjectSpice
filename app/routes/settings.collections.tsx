import { useState } from "react";
import { Form, Link, useNavigation, useActionData } from "react-router";
import { redirect } from "react-router";
import { and, count, eq } from "drizzle-orm";
import type { Route } from "./+types/settings.collections";
import { requireUser } from "~/lib/auth.server";
import { createDb, schema } from "~/db";
import { AppShell } from "~/components/app-shell";
import { Button, Chip, SectionHeader } from "~/components/ui";

export function meta() {
  return [{ title: "Manage Collections — ProjectSpice" }];
}

// ─── Loader ────────────────────────────────────────────────────────────────────

export async function loader({ request, context }: Route.LoaderArgs) {
  const user = await requireUser(request, context);
  const { db } = createDb(context.cloudflare.env.DB);

  const rows = await db
    .select({
      id: schema.collections.id,
      name: schema.collections.name,
      description: schema.collections.description,
      recipeCount: count(schema.collectionRecipes.recipeId),
    })
    .from(schema.collections)
    .leftJoin(
      schema.collectionRecipes,
      eq(schema.collections.id, schema.collectionRecipes.collectionId)
    )
    .where(eq(schema.collections.userId, user.id))
    .groupBy(schema.collections.id)
    .orderBy(schema.collections.name);

  return { user, collections: rows };
}

// ─── Action ────────────────────────────────────────────────────────────────────

export async function action({ request, context }: Route.ActionArgs) {
  const user = await requireUser(request, context);
  const fd = await request.formData();
  const intent = String(fd.get("_intent") ?? "");
  const { db } = createDb(context.cloudflare.env.DB);

  if (intent === "create") {
    const name = String(fd.get("name") ?? "").trim();
    if (!name) return { error: "Collection name cannot be empty." };
    const description = String(fd.get("description") ?? "").trim() || null;
    await db.insert(schema.collections).values({
      id: crypto.randomUUID(),
      userId: user.id,
      name,
      description,
    });
    return redirect("/settings/collections");
  }

  if (intent === "rename") {
    const collectionId = String(fd.get("collectionId") ?? "");
    const newName = String(fd.get("newName") ?? "").trim();
    if (!newName) return { error: "Collection name cannot be empty." };
    const [col] = await db
      .select({ id: schema.collections.id })
      .from(schema.collections)
      .where(
        and(
          eq(schema.collections.id, collectionId),
          eq(schema.collections.userId, user.id)
        )
      );
    if (!col) return { error: "Collection not found." };
    await db
      .update(schema.collections)
      .set({ name: newName })
      .where(eq(schema.collections.id, collectionId));
    return redirect("/settings/collections");
  }

  if (intent === "delete") {
    const collectionId = String(fd.get("collectionId") ?? "");
    const [col] = await db
      .select({ id: schema.collections.id })
      .from(schema.collections)
      .where(
        and(
          eq(schema.collections.id, collectionId),
          eq(schema.collections.userId, user.id)
        )
      );
    if (!col) return { error: "Collection not found." };
    // collection_recipes rows cascade-delete via FK
    await db
      .delete(schema.collections)
      .where(eq(schema.collections.id, collectionId));
    return redirect("/settings/collections");
  }

  return { error: "Unknown action." };
}

// ─── Component ─────────────────────────────────────────────────────────────────

type ActionData = { error: string } | undefined;

function RenameForm({ col }: { col: { id: string; name: string } }) {
  const [open, setOpen] = useState(false);
  const [value, setValue] = useState(col.name);
  const nav = useNavigation();
  const busy = nav.state !== "idle";

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="text-sm font-medium text-ink-3 hover:text-ink"
      >
        Rename
      </button>
    );
  }

  return (
    <Form method="post" className="flex flex-wrap items-center gap-2">
      <input type="hidden" name="_intent" value="rename" />
      <input type="hidden" name="collectionId" value={col.id} />
      <input
        name="newName"
        value={value}
        onChange={(e) => setValue(e.target.value)}
        className="ps-control w-48 border border-rule bg-paper px-3 text-sm text-ink focus-visible:ps-focus-ring"
        autoFocus
      />
      <button
        type="submit"
        disabled={busy || !value.trim()}
        className="text-sm font-medium text-ok disabled:opacity-50"
      >
        Save
      </button>
      <button
        type="button"
        onClick={() => {
          setOpen(false);
          setValue(col.name);
        }}
        className="text-sm font-medium text-ink-3 hover:text-ink"
      >
        Cancel
      </button>
    </Form>
  );
}

function CreateForm({ busy }: { busy: boolean }) {
  const [open, setOpen] = useState(false);

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="ps-control inline-flex items-center justify-center border border-transparent bg-primary px-4 text-sm font-medium text-primary-foreground hover:opacity-90 focus-visible:ps-focus-ring"
      >
        + New Collection
      </button>
    );
  }

  return (
    <Form
      method="post"
      className="ps-surface flex flex-col gap-2 p-3 sm:flex-row"
    >
      <input type="hidden" name="_intent" value="create" />
      <input
        name="name"
        placeholder="Collection name (e.g. Thanksgiving 2026)"
        required
        autoFocus
        className="ps-control flex-1 border border-rule bg-paper px-3 text-sm text-ink placeholder:text-ink-4 focus-visible:ps-focus-ring"
      />
      <input
        name="description"
        placeholder="Description (optional)"
        className="ps-control flex-1 border border-rule bg-paper px-3 text-sm text-ink placeholder:text-ink-4 focus-visible:ps-focus-ring"
      />
      <div className="flex gap-2">
        <Button type="submit" variant="primary" disabled={busy}>
          Create
        </Button>
        <Button type="button" variant="ghost" onClick={() => setOpen(false)}>
          Cancel
        </Button>
      </div>
    </Form>
  );
}

export default function SettingsCollections({
  loaderData,
}: Route.ComponentProps) {
  const { user, collections } = loaderData;
  const actionData = useActionData<ActionData>();
  const nav = useNavigation();
  const busy = nav.state !== "idle";

  return (
    <AppShell user={user}>
      <div className="mx-auto max-w-4xl space-y-5">
        <SectionHeader
          eyebrow="Curated folders"
          title="Manage Collections"
          description="Collections are intentional groups for menus, holidays, seasons, and cooking projects."
          actions={<Chip>{collections.length} collection{collections.length !== 1 ? "s" : ""}</Chip>}
        />

        {actionData?.error && (
          <div className="rounded-md border border-err/30 bg-err/10 p-3 text-sm text-err">
            {actionData.error}
          </div>
        )}

        <CreateForm busy={busy} />

        {collections.length === 0 ? (
          <p className="ps-surface py-12 text-center text-sm text-ink-3">
            No collections yet. Collections are curated lists like "Thanksgiving
            2026" — distinct from cookbooks.
          </p>
        ) : (
          <ul className="ps-surface divide-y divide-rule overflow-hidden">
            {collections.map((col) => (
              <li
                key={col.id}
                className="ps-row flex flex-col gap-2 px-4 py-3 sm:flex-row sm:items-center"
              >
                <div className="min-w-0 flex-1">
                  <Link
                    to={`/collections/${col.id}`}
                    className="block truncate text-sm font-medium text-ink hover:underline"
                  >
                    {col.name}
                  </Link>
                  {col.description && (
                    <span className="block truncate text-xs text-ink-3">
                      {col.description}
                    </span>
                  )}
                  <span className="text-xs text-ink-3">
                    {col.recipeCount} recipe{col.recipeCount !== 1 ? "s" : ""}
                  </span>
                </div>

                <div className="flex items-center gap-3">
                  <RenameForm col={col} />

                  <Form
                    method="post"
                    onSubmit={(e) => {
                      if (
                        col.recipeCount > 0 &&
                        !confirm(
                          `Delete "${col.name}"? This will remove ${col.recipeCount} recipe${col.recipeCount !== 1 ? "s" : ""} from the collection (recipes themselves are not deleted).`
                        )
                      ) {
                        e.preventDefault();
                      }
                    }}
                  >
                    <input type="hidden" name="_intent" value="delete" />
                    <input type="hidden" name="collectionId" value={col.id} />
                    <button
                      type="submit"
                      disabled={busy}
                      className="text-sm font-medium text-err disabled:opacity-50"
                    >
                      Delete
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
