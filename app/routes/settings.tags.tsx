import { useState } from "react";
import { Form, useNavigation, useActionData } from "react-router";
import { redirect } from "react-router";
import { and, count, eq, inArray, ne } from "drizzle-orm";
import type { Route } from "./+types/settings.tags";
import { requireUser } from "~/lib/auth.server";
import { createDb, schema } from "~/db";
import { findSimilarTagPairs } from "~/lib/tag-similarity";
import { AppShell } from "~/components/app-shell";
import { Button, Chip, SectionHeader } from "~/components/ui";

export function meta() {
  return [{ title: "Manage Tags — ProjectSpice" }];
}

// ─── Loader ────────────────────────────────────────────────────────────────────

export async function loader({ request, context }: Route.LoaderArgs) {
  const user = await requireUser(request, context);
  const { db } = createDb(context.cloudflare.env.DB);

  // All tags with recipe counts
  const rows = await db
    .select({
      id: schema.tags.id,
      name: schema.tags.name,
      recipeCount: count(schema.recipeTags.recipeId),
    })
    .from(schema.tags)
    .leftJoin(schema.recipeTags, eq(schema.recipeTags.tagId, schema.tags.id))
    .where(eq(schema.tags.userId, user.id))
    .groupBy(schema.tags.id)
    .orderBy(schema.tags.name);

  const similar = findSimilarTagPairs(rows.map((r) => ({ id: r.id, name: r.name })));

  return { user, tags: rows, similar };
}

// ─── Action ────────────────────────────────────────────────────────────────────

export async function action({ request, context }: Route.ActionArgs) {
  const user = await requireUser(request, context);
  const fd = await request.formData();
  const intent = String(fd.get("_intent") ?? "");
  const { db } = createDb(context.cloudflare.env.DB);

  if (intent === "rename") {
    const tagId = String(fd.get("tagId") ?? "");
    const newName = String(fd.get("newName") ?? "").trim();
    if (!newName) return { error: "Tag name cannot be empty." };
    // Verify ownership
    const [tag] = await db
      .select({ id: schema.tags.id })
      .from(schema.tags)
      .where(and(eq(schema.tags.id, tagId), eq(schema.tags.userId, user.id)));
    if (!tag) return { error: "Tag not found." };
    // Check for name collision
    const [collision] = await db
      .select({ id: schema.tags.id })
      .from(schema.tags)
      .where(
        and(
          eq(schema.tags.userId, user.id),
          eq(schema.tags.name, newName),
          ne(schema.tags.id, tagId)
        )
      );
    if (collision) return { error: `A tag named "${newName}" already exists.` };
    await db
      .update(schema.tags)
      .set({ name: newName })
      .where(eq(schema.tags.id, tagId));
    return redirect("/settings/tags");
  }

  if (intent === "delete") {
    const tagId = String(fd.get("tagId") ?? "");
    // Verify ownership
    const [tag] = await db
      .select({ id: schema.tags.id })
      .from(schema.tags)
      .where(and(eq(schema.tags.id, tagId), eq(schema.tags.userId, user.id)));
    if (!tag) return { error: "Tag not found." };
    // recipe_tags rows cascade-delete via FK; just delete the tag
    await db.delete(schema.tags).where(eq(schema.tags.id, tagId));
    return redirect("/settings/tags");
  }

  if (intent === "merge") {
    // Merge sourceTagId into targetTagId:
    // 1. Re-point recipe_tags rows that only have source (not already on target)
    // 2. Delete remaining source recipe_tags (duplicates)
    // 3. Delete source tag
    const sourceId = String(fd.get("sourceTagId") ?? "");
    const targetId = String(fd.get("targetTagId") ?? "");
    if (sourceId === targetId) return { error: "Source and target tags must differ." };

    // Verify both belong to this user
    const owned = await db
      .select({ id: schema.tags.id })
      .from(schema.tags)
      .where(
        and(
          eq(schema.tags.userId, user.id),
          inArray(schema.tags.id, [sourceId, targetId])
        )
      );
    if (owned.length !== 2) return { error: "One or both tags not found." };

    // Recipes that have source but NOT target → update to target
    const sourceRecipes = await db
      .select({ recipeId: schema.recipeTags.recipeId })
      .from(schema.recipeTags)
      .where(eq(schema.recipeTags.tagId, sourceId));

    const targetRecipes = await db
      .select({ recipeId: schema.recipeTags.recipeId })
      .from(schema.recipeTags)
      .where(eq(schema.recipeTags.tagId, targetId));

    const targetSet = new Set(targetRecipes.map((r) => r.recipeId));
    const toMove = sourceRecipes
      .map((r) => r.recipeId)
      .filter((id) => !targetSet.has(id));

    if (toMove.length > 0) {
      for (const recipeId of toMove) {
        await db
          .insert(schema.recipeTags)
          .values({ recipeId, tagId: targetId })
          .onConflictDoNothing();
      }
    }

    // Delete all source recipe_tags (including duplicates)
    await db
      .delete(schema.recipeTags)
      .where(eq(schema.recipeTags.tagId, sourceId));

    // Delete source tag
    await db.delete(schema.tags).where(eq(schema.tags.id, sourceId));

    return redirect("/settings/tags");
  }

  return { error: "Unknown action." };
}

// ─── Component ─────────────────────────────────────────────────────────────────

type ActionData = { error: string } | undefined;

function RenameForm({ tag }: { tag: { id: string; name: string } }) {
  const [open, setOpen] = useState(false);
  const [value, setValue] = useState(tag.name);
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
      <input type="hidden" name="tagId" value={tag.id} />
      <input
        name="newName"
        value={value}
        onChange={(e) => setValue(e.target.value)}
        className="ps-control w-40 border border-rule bg-paper px-3 text-sm text-ink focus-visible:ps-focus-ring"
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
        onClick={() => { setOpen(false); setValue(tag.name); }}
        className="text-sm font-medium text-ink-3 hover:text-ink"
      >
        Cancel
      </button>
    </Form>
  );
}

export default function SettingsTags({ loaderData }: Route.ComponentProps) {
  const { user, tags, similar } = loaderData;
  const actionData = useActionData<ActionData>();
  const nav = useNavigation();
  const busy = nav.state !== "idle";

  return (
    <AppShell user={user}>
      <div className="mx-auto max-w-4xl space-y-6">
        <SectionHeader
          eyebrow="Lightweight facets"
          title="Manage Tags"
          description="Tags stay small and scannable: useful for filtering, cleanup, and duplicate merges."
          actions={<Chip>{tags.length} tag{tags.length !== 1 ? "s" : ""}</Chip>}
        />

        {actionData?.error && (
          <div className="rounded-md border border-err/30 bg-err/10 p-3 text-sm text-err">
            {actionData.error}
          </div>
        )}

        {similar.length > 0 && (
          <section>
            <h2 className="mb-2 text-sm font-semibold text-warn">
              Possible duplicates
            </h2>
            <ul className="space-y-2">
              {similar.map(({ a, b }) => (
                <li
                  key={`${a.id}-${b.id}`}
                  className="flex flex-col gap-3 rounded-md border border-warn/30 bg-warn/10 p-3 sm:flex-row sm:items-center"
                >
                  <span className="flex-1 text-sm text-ink">
                    <span className="font-medium">"{a.name}"</span> and{" "}
                    <span className="font-medium">"{b.name}"</span> look similar — merge?
                  </span>
                  <div className="flex gap-2">
                    <Form method="post">
                      <input type="hidden" name="_intent" value="merge" />
                      <input type="hidden" name="sourceTagId" value={a.id} />
                      <input type="hidden" name="targetTagId" value={b.id} />
                      <button
                        type="submit"
                        disabled={busy}
                        className="ps-control inline-flex min-h-8 items-center justify-center border border-transparent bg-warn px-3 text-xs font-medium text-white hover:opacity-90 disabled:opacity-50 focus-visible:ps-focus-ring"
                      >
                        Keep "{b.name}"
                      </button>
                    </Form>
                    <Form method="post">
                      <input type="hidden" name="_intent" value="merge" />
                      <input type="hidden" name="sourceTagId" value={b.id} />
                      <input type="hidden" name="targetTagId" value={a.id} />
                      <button
                        type="submit"
                        disabled={busy}
                        className="ps-control inline-flex min-h-8 items-center justify-center border border-transparent bg-warn px-3 text-xs font-medium text-white hover:opacity-90 disabled:opacity-50 focus-visible:ps-focus-ring"
                      >
                        Keep "{a.name}"
                      </button>
                    </Form>
                  </div>
                </li>
              ))}
            </ul>
          </section>
        )}

        {tags.length === 0 ? (
          <p className="ps-surface py-12 text-center text-sm text-ink-3">
            No tags yet. Tags are created when you add them to a recipe.
          </p>
        ) : (
          <section>
            <h2 className="mb-2 text-sm font-semibold text-ink">All tags</h2>
            <ul className="ps-surface divide-y divide-rule overflow-hidden">
              {tags.map((tag) => (
                <li
                  key={tag.id}
                  className="ps-row flex flex-wrap items-center gap-3 px-4 py-3"
                >
                  <span className="rounded-full border border-rule bg-paper-3 px-2.5 py-1 text-sm font-medium text-ink">{tag.name}</span>
                  <span className="mr-auto text-xs text-ink-3">
                    {tag.recipeCount} recipe{tag.recipeCount !== 1 ? "s" : ""}
                  </span>
                  <RenameForm tag={tag} />
                  <Form
                    method="post"
                    onSubmit={(e) => {
                      if (
                        tag.recipeCount > 0 &&
                        !confirm(
                          `Delete "${tag.name}"? It will be removed from ${tag.recipeCount} recipe${tag.recipeCount !== 1 ? "s" : ""}.`
                        )
                      ) {
                        e.preventDefault();
                      }
                    }}
                  >
                    <input type="hidden" name="_intent" value="delete" />
                    <input type="hidden" name="tagId" value={tag.id} />
                    <button
                      type="submit"
                      disabled={busy}
                      className="text-sm font-medium text-err disabled:opacity-50"
                    >
                      Delete
                    </button>
                  </Form>
                </li>
              ))}
            </ul>
          </section>
        )}

        {tags.length >= 2 && (
          <section>
            <h2 className="mb-2 text-sm font-semibold text-ink">Merge tags</h2>
            <ManualMerge tags={tags} busy={busy} />
          </section>
        )}
      </div>
    </AppShell>
  );
}

function ManualMerge({
  tags,
  busy,
}: {
  tags: { id: string; name: string; recipeCount: number }[];
  busy: boolean;
}) {
  const [source, setSource] = useState("");
  const [target, setTarget] = useState("");

  return (
    <Form method="post" className="ps-surface space-y-3 p-4">
      <input type="hidden" name="_intent" value="merge" />
      <p className="text-xs text-ink-3">
        All recipes tagged with <strong>Source</strong> will be re-tagged with{" "}
        <strong>Target</strong>, then the source tag is deleted.
      </p>
      <div className="flex flex-col gap-3 sm:flex-row">
        <div className="flex-1">
          <label className="mb-1 block text-xs font-medium text-ink-3">Source (to delete)</label>
          <select
            name="sourceTagId"
            value={source}
            onChange={(e) => setSource(e.target.value)}
            className="ps-control w-full border border-rule bg-paper px-3 text-sm text-ink focus-visible:ps-focus-ring"
            required
          >
            <option value="">— pick a tag —</option>
            {tags
              .filter((t) => t.id !== target)
              .map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name} ({t.recipeCount})
                </option>
              ))}
          </select>
        </div>
        <div className="flex-1">
          <label className="mb-1 block text-xs font-medium text-ink-3">Target (to keep)</label>
          <select
            name="targetTagId"
            value={target}
            onChange={(e) => setTarget(e.target.value)}
            className="ps-control w-full border border-rule bg-paper px-3 text-sm text-ink focus-visible:ps-focus-ring"
            required
          >
            <option value="">— pick a tag —</option>
            {tags
              .filter((t) => t.id !== source)
              .map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name} ({t.recipeCount})
                </option>
              ))}
          </select>
        </div>
      </div>
      <Button type="submit" variant="primary" disabled={busy || !source || !target} className="w-full sm:w-auto">
        Merge tags
      </Button>
    </Form>
  );
}
