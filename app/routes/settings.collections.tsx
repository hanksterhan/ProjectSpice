import { useState } from "react";
import { Form, Link, useNavigation, useActionData } from "react-router";
import { redirect } from "react-router";
import { and, count, eq } from "drizzle-orm";
import type { Route } from "./+types/settings.collections";
import { requireUser } from "~/lib/auth.server";
import { createDb, schema } from "~/db";

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

  return { collections: rows };
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
        className="text-sm text-blue-600 hover:underline"
      >
        Rename
      </button>
    );
  }

  return (
    <Form method="post" className="flex items-center gap-2">
      <input type="hidden" name="_intent" value="rename" />
      <input type="hidden" name="collectionId" value={col.id} />
      <input
        name="newName"
        value={value}
        onChange={(e) => setValue(e.target.value)}
        className="border rounded px-2 py-1 text-sm w-48"
        autoFocus
      />
      <button
        type="submit"
        disabled={busy || !value.trim()}
        className="text-sm text-green-700 font-medium disabled:opacity-50"
      >
        Save
      </button>
      <button
        type="button"
        onClick={() => {
          setOpen(false);
          setValue(col.name);
        }}
        className="text-sm text-gray-500"
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
        className="text-sm bg-gray-900 text-white px-3 py-1.5 rounded hover:bg-gray-700"
      >
        + New Collection
      </button>
    );
  }

  return (
    <Form
      method="post"
      className="flex flex-col sm:flex-row gap-2 bg-white border rounded-lg p-3"
    >
      <input type="hidden" name="_intent" value="create" />
      <input
        name="name"
        placeholder="Collection name (e.g. Thanksgiving 2026)"
        required
        autoFocus
        className="border rounded px-2 py-1.5 text-sm flex-1"
      />
      <input
        name="description"
        placeholder="Description (optional)"
        className="border rounded px-2 py-1.5 text-sm flex-1"
      />
      <div className="flex gap-2">
        <button
          type="submit"
          disabled={busy}
          className="text-sm bg-gray-900 text-white px-4 py-1.5 rounded hover:bg-gray-700 disabled:opacity-50"
        >
          Create
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

export default function SettingsCollections({
  loaderData,
}: Route.ComponentProps) {
  const { collections } = loaderData;
  const actionData = useActionData<ActionData>();
  const nav = useNavigation();
  const busy = nav.state !== "idle";

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white border-b px-4 py-3 flex items-center gap-3">
        <Link to="/recipes" className="text-gray-500 hover:text-gray-700 text-sm">
          ← Recipes
        </Link>
        <h1 className="font-semibold text-gray-900">Manage Collections</h1>
        <span className="ml-auto text-sm text-gray-500">
          {collections.length} collection{collections.length !== 1 ? "s" : ""}
        </span>
      </header>

      <main className="max-w-2xl mx-auto px-4 py-6 space-y-4">
        {actionData?.error && (
          <div className="rounded-md bg-red-50 border border-red-200 p-3 text-sm text-red-700">
            {actionData.error}
          </div>
        )}

        <CreateForm busy={busy} />

        {collections.length === 0 ? (
          <p className="text-center text-gray-500 py-12">
            No collections yet. Collections are curated lists like "Thanksgiving
            2026" — distinct from cookbooks.
          </p>
        ) : (
          <ul className="divide-y divide-gray-100 bg-white border rounded-lg">
            {collections.map((col) => (
              <li
                key={col.id}
                className="px-4 py-3 flex flex-col sm:flex-row sm:items-center gap-2"
              >
                <div className="flex-1 min-w-0">
                  <Link
                    to={`/collections/${col.id}`}
                    className="font-medium text-gray-900 text-sm hover:text-blue-600 truncate block"
                  >
                    {col.name}
                  </Link>
                  {col.description && (
                    <span className="text-xs text-gray-400 truncate block">
                      {col.description}
                    </span>
                  )}
                  <span className="text-xs text-gray-400">
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
                      className="text-sm text-red-500 hover:text-red-700 disabled:opacity-50"
                    >
                      Delete
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
