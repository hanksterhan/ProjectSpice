import { useState } from "react";
import { Form, Link, useNavigation, useActionData } from "react-router";
import { redirect } from "react-router";
import { and, count, eq } from "drizzle-orm";
import type { Route } from "./+types/settings.cookbooks";
import { requireUser } from "~/lib/auth.server";
import { createDb, schema } from "~/db";

export function meta() {
  return [{ title: "Manage Cookbooks — ProjectSpice" }];
}

// ─── Loader ────────────────────────────────────────────────────────────────────

export async function loader({ request, context }: Route.LoaderArgs) {
  const user = await requireUser(request, context);
  const { db } = createDb(context.cloudflare.env.DB);

  const rows = await db
    .select({
      id: schema.cookbooks.id,
      name: schema.cookbooks.name,
      description: schema.cookbooks.description,
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

// ─── Action ────────────────────────────────────────────────────────────────────

export async function action({ request, context }: Route.ActionArgs) {
  const user = await requireUser(request, context);
  const fd = await request.formData();
  const intent = String(fd.get("_intent") ?? "");
  const { db } = createDb(context.cloudflare.env.DB);

  if (intent === "create") {
    const name = String(fd.get("name") ?? "").trim();
    if (!name) return { error: "Cookbook name cannot be empty." };
    const description = String(fd.get("description") ?? "").trim() || null;
    await db.insert(schema.cookbooks).values({
      id: crypto.randomUUID(),
      userId: user.id,
      name,
      description,
    });
    return redirect("/settings/cookbooks");
  }

  if (intent === "rename") {
    const cookbookId = String(fd.get("cookbookId") ?? "");
    const newName = String(fd.get("newName") ?? "").trim();
    if (!newName) return { error: "Cookbook name cannot be empty." };
    const [cb] = await db
      .select({ id: schema.cookbooks.id })
      .from(schema.cookbooks)
      .where(
        and(
          eq(schema.cookbooks.id, cookbookId),
          eq(schema.cookbooks.userId, user.id)
        )
      );
    if (!cb) return { error: "Cookbook not found." };
    await db
      .update(schema.cookbooks)
      .set({ name: newName })
      .where(eq(schema.cookbooks.id, cookbookId));
    return redirect("/settings/cookbooks");
  }

  if (intent === "archive") {
    const cookbookId = String(fd.get("cookbookId") ?? "");
    const [cb] = await db
      .select({ id: schema.cookbooks.id, archived: schema.cookbooks.archived })
      .from(schema.cookbooks)
      .where(
        and(
          eq(schema.cookbooks.id, cookbookId),
          eq(schema.cookbooks.userId, user.id)
        )
      );
    if (!cb) return { error: "Cookbook not found." };
    await db
      .update(schema.cookbooks)
      .set({ archived: !cb.archived })
      .where(eq(schema.cookbooks.id, cookbookId));
    return redirect("/settings/cookbooks");
  }

  if (intent === "delete") {
    const cookbookId = String(fd.get("cookbookId") ?? "");
    const [cb] = await db
      .select({ id: schema.cookbooks.id })
      .from(schema.cookbooks)
      .where(
        and(
          eq(schema.cookbooks.id, cookbookId),
          eq(schema.cookbooks.userId, user.id)
        )
      );
    if (!cb) return { error: "Cookbook not found." };
    // cookbook_recipes rows cascade-delete via FK
    await db
      .delete(schema.cookbooks)
      .where(eq(schema.cookbooks.id, cookbookId));
    return redirect("/settings/cookbooks");
  }

  return { error: "Unknown action." };
}

// ─── Component ─────────────────────────────────────────────────────────────────

type ActionData = { error: string } | undefined;

function RenameForm({ cb }: { cb: { id: string; name: string } }) {
  const [open, setOpen] = useState(false);
  const [value, setValue] = useState(cb.name);
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
      <input type="hidden" name="cookbookId" value={cb.id} />
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
          setValue(cb.name);
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
        + New Cookbook
      </button>
    );
  }

  return (
    <Form method="post" className="flex flex-col sm:flex-row gap-2 bg-white border rounded-lg p-3">
      <input type="hidden" name="_intent" value="create" />
      <input
        name="name"
        placeholder="Cookbook name"
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

export default function SettingsCookbooks({ loaderData }: Route.ComponentProps) {
  const { cookbooks } = loaderData;
  const actionData = useActionData<ActionData>();
  const nav = useNavigation();
  const busy = nav.state !== "idle";

  const active = cookbooks.filter((cb) => !cb.archived);
  const archived = cookbooks.filter((cb) => cb.archived);

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white border-b px-4 py-3 flex items-center gap-3">
        <Link to="/recipes" className="text-gray-500 hover:text-gray-700 text-sm">
          ← Recipes
        </Link>
        <h1 className="font-semibold text-gray-900">Manage Cookbooks</h1>
        <span className="ml-auto text-sm text-gray-500">
          {cookbooks.length} cookbook{cookbooks.length !== 1 ? "s" : ""}
        </span>
      </header>

      <main className="max-w-2xl mx-auto px-4 py-6 space-y-6">
        {actionData?.error && (
          <div className="rounded-md bg-red-50 border border-red-200 p-3 text-sm text-red-700">
            {actionData.error}
          </div>
        )}

        <CreateForm busy={busy} />

        {cookbooks.length === 0 ? (
          <p className="text-center text-gray-500 py-12">
            No cookbooks yet. Cookbooks are created when you import from Paprika or manually above.
          </p>
        ) : (
          <>
            {active.length > 0 && (
              <section>
                <h2 className="text-sm font-medium text-gray-700 mb-2">Active</h2>
                <CookbookList cookbooks={active} busy={busy} />
              </section>
            )}

            {archived.length > 0 && (
              <section>
                <h2 className="text-sm font-medium text-gray-500 mb-2">Archived</h2>
                <CookbookList cookbooks={archived} busy={busy} />
              </section>
            )}
          </>
        )}
      </main>
    </div>
  );
}

function CookbookList({
  cookbooks,
  busy,
}: {
  cookbooks: {
    id: string;
    name: string;
    description: string | null;
    archived: boolean;
    recipeCount: number;
  }[];
  busy: boolean;
}) {
  return (
    <ul className="divide-y divide-gray-100 bg-white border rounded-lg">
      {cookbooks.map((cb) => (
        <li key={cb.id} className="px-4 py-3 flex flex-col sm:flex-row sm:items-center gap-2">
          <div className="flex-1 min-w-0">
            <Link
              to={`/cookbooks/${cb.id}`}
              className="font-medium text-gray-900 text-sm hover:text-blue-600 truncate block"
            >
              {cb.name}
              {cb.archived && (
                <span className="ml-2 text-xs text-gray-400 font-normal">archived</span>
              )}
            </Link>
            {cb.description && (
              <span className="text-xs text-gray-400 truncate block">{cb.description}</span>
            )}
            <span className="text-xs text-gray-400">
              {cb.recipeCount} recipe{cb.recipeCount !== 1 ? "s" : ""}
            </span>
          </div>

          <div className="flex items-center gap-3 flex-wrap">
            <RenameForm cb={cb} />

            <Form method="post">
              <input type="hidden" name="_intent" value="archive" />
              <input type="hidden" name="cookbookId" value={cb.id} />
              <button
                type="submit"
                disabled={busy}
                className="text-sm text-gray-500 hover:text-gray-700 disabled:opacity-50"
              >
                {cb.archived ? "Unarchive" : "Archive"}
              </button>
            </Form>

            <Form
              method="post"
              onSubmit={(e) => {
                if (
                  cb.recipeCount > 0 &&
                  !confirm(
                    `Delete "${cb.name}"? This removes it from ${cb.recipeCount} recipe${cb.recipeCount !== 1 ? "s" : ""}.`
                  )
                ) {
                  e.preventDefault();
                }
              }}
            >
              <input type="hidden" name="_intent" value="delete" />
              <input type="hidden" name="cookbookId" value={cb.id} />
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
  );
}
