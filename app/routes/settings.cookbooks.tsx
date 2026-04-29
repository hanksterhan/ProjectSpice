import { useState } from "react";
import { Form, Link, useNavigation, useActionData } from "react-router";
import { redirect } from "react-router";
import { and, count, eq } from "drizzle-orm";
import type { Route } from "./+types/settings.cookbooks";
import { requireUser } from "~/lib/auth.server";
import { createDb, schema } from "~/db";
import { AppShell } from "~/components/app-shell";
import { Button, Chip, SectionHeader } from "~/components/ui";
import { findCookbookByName, getOrCreateCookbookByName } from "~/lib/cookbooks.server";

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

  return { user, cookbooks: rows };
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
    const existing = await findCookbookByName(db, user.id, name);
    if (existing) return { error: `A cookbook named "${name}" already exists.` };
    await getOrCreateCookbookByName(db, user.id, name, description);
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
    const existing = await findCookbookByName(db, user.id, newName);
    if (existing && existing.id !== cookbookId) {
      return { error: `A cookbook named "${newName}" already exists.` };
    }
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
        className="text-sm font-medium text-ink-3 hover:text-ink"
      >
        Rename
      </button>
    );
  }

  return (
    <Form method="post" className="flex flex-wrap items-center gap-2">
      <input type="hidden" name="_intent" value="rename" />
      <input type="hidden" name="cookbookId" value={cb.id} />
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
          setValue(cb.name);
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
        + New Cookbook
      </button>
    );
  }

  return (
    <Form method="post" className="ps-surface flex flex-col gap-2 p-3 sm:flex-row">
      <input type="hidden" name="_intent" value="create" />
      <input
        name="name"
        placeholder="Cookbook name"
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

export default function SettingsCookbooks({ loaderData }: Route.ComponentProps) {
  const { user, cookbooks } = loaderData;
  const actionData = useActionData<ActionData>();
  const nav = useNavigation();
  const busy = nav.state !== "idle";

  const active = cookbooks.filter((cb) => !cb.archived);
  const archived = cookbooks.filter((cb) => cb.archived);

  return (
    <AppShell user={user}>
      <div className="mx-auto max-w-4xl space-y-6">
        <SectionHeader
          eyebrow="Sources"
          title="Manage Cookbooks"
          description="Cookbooks act as source containers, especially for imports. Archive noisy sources without deleting recipes."
          actions={<Chip>{cookbooks.length} cookbook{cookbooks.length !== 1 ? "s" : ""}</Chip>}
        />

        {actionData?.error && (
          <div className="rounded-md border border-err/30 bg-err/10 p-3 text-sm text-err">
            {actionData.error}
          </div>
        )}

        <CreateForm busy={busy} />

        {cookbooks.length === 0 ? (
          <p className="ps-surface py-12 text-center text-sm text-ink-3">
            No cookbooks yet. Cookbooks are created when you import from Paprika or manually above.
          </p>
        ) : (
          <>
            {active.length > 0 && (
              <section>
                <h2 className="mb-2 text-sm font-semibold text-ink">Active sources</h2>
                <CookbookList cookbooks={active} busy={busy} />
              </section>
            )}

            {archived.length > 0 && (
              <section>
                <h2 className="mb-2 text-sm font-semibold text-ink-3">Archived sources</h2>
                <CookbookList cookbooks={archived} busy={busy} />
              </section>
            )}
          </>
        )}
      </div>
    </AppShell>
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
    <ul className="ps-surface divide-y divide-rule overflow-hidden">
      {cookbooks.map((cb) => (
        <li key={cb.id} className="ps-row flex flex-col gap-2 px-4 py-3 sm:flex-row sm:items-center">
          <div className="min-w-0 flex-1">
            <Link
              to={`/cookbooks/${cb.id}`}
              className="block truncate text-sm font-medium text-ink hover:underline"
            >
              {cb.name}
              {cb.archived && (
                <span className="ml-2 text-xs font-normal text-ink-4">archived</span>
              )}
            </Link>
            {cb.description && (
              <span className="block truncate text-xs text-ink-3">{cb.description}</span>
            )}
            <span className="text-xs text-ink-3">
              {cb.recipeCount} recipe{cb.recipeCount !== 1 ? "s" : ""}
            </span>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <RenameForm cb={cb} />

            <Form method="post">
              <input type="hidden" name="_intent" value="archive" />
              <input type="hidden" name="cookbookId" value={cb.id} />
              <button
                type="submit"
                disabled={busy}
                className="text-sm font-medium text-ink-3 hover:text-ink disabled:opacity-50"
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
                className="text-sm font-medium text-err disabled:opacity-50"
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
