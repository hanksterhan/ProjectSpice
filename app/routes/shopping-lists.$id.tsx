import { data, Form, Link, redirect, useFetcher } from "react-router";
import { useState } from "react";
import { and, asc, eq, inArray, isNull } from "drizzle-orm";
import type { Route } from "./+types/shopping-lists.$id";
import { requireUser } from "~/lib/auth.server";
import { createDb, schema } from "~/db";
import { categorizeAisle, AISLE_ORDER } from "~/lib/aisle-categorizer";

export function meta({ data: d }: Route.MetaArgs) {
  const name =
    (d as { list?: { name: string } } | undefined)?.list?.name ??
    "Shopping List";
  return [{ title: `${name} — ProjectSpice` }];
}

// ─── Types ────────────────────────────────────────────────────────────────────

type ListItem = {
  id: string;
  manualText: string | null;
  quantity: string | null;
  unit: string | null;
  aisle: string | null;
  checkedAt: Date | null;
  recipeId: string | null;
  ingredientId: string | null;
};

// ─── Loader ───────────────────────────────────────────────────────────────────

export async function loader({ params, request, context }: Route.LoaderArgs) {
  const user = await requireUser(request, context);
  const url = new URL(request.url);
  const addFromRecipeId = url.searchParams.get("addFromRecipeId");

  const { db } = createDb(context.cloudflare.env.DB);

  const [listRows, items, recipes] = await Promise.all([
    db
      .select()
      .from(schema.shoppingLists)
      .where(
        and(
          eq(schema.shoppingLists.id, params.id),
          eq(schema.shoppingLists.userId, user.id)
        )
      )
      .limit(1),
    db
      .select()
      .from(schema.shoppingListItems)
      .where(eq(schema.shoppingListItems.shoppingListId, params.id))
      .orderBy(asc(schema.shoppingListItems.id)),
    db
      .select({ id: schema.recipes.id, title: schema.recipes.title })
      .from(schema.recipes)
      .where(
        and(
          eq(schema.recipes.userId, user.id),
          isNull(schema.recipes.deletedAt)
        )
      )
      .orderBy(asc(schema.recipes.title)),
  ]);

  const list = listRows[0];
  if (!list) throw data(null, { status: 404 });

  let addFromIngredients: Array<{
    id: string;
    name: string;
    quantityRaw: string | null;
    unitRaw: string | null;
    isGroupHeader: boolean;
    sortOrder: number;
  }> | null = null;

  if (addFromRecipeId) {
    const [recipeCheck] = await db
      .select({ id: schema.recipes.id })
      .from(schema.recipes)
      .where(
        and(
          eq(schema.recipes.id, addFromRecipeId),
          eq(schema.recipes.userId, user.id),
          isNull(schema.recipes.deletedAt)
        )
      )
      .limit(1);

    if (recipeCheck) {
      addFromIngredients = await db
        .select({
          id: schema.ingredients.id,
          name: schema.ingredients.name,
          quantityRaw: schema.ingredients.quantityRaw,
          unitRaw: schema.ingredients.unitRaw,
          isGroupHeader: schema.ingredients.isGroupHeader,
          sortOrder: schema.ingredients.sortOrder,
        })
        .from(schema.ingredients)
        .where(eq(schema.ingredients.recipeId, addFromRecipeId))
        .orderBy(asc(schema.ingredients.sortOrder));
    }
  }

  return { list, items, recipes, addFromRecipeId, addFromIngredients };
}

// ─── Action ───────────────────────────────────────────────────────────────────

export async function action({ params, request, context }: Route.ActionArgs) {
  const user = await requireUser(request, context);
  const fd = await request.formData();
  const intent = String(fd.get("_intent") ?? "");
  const { db } = createDb(context.cloudflare.env.DB);

  async function assertListOwner() {
    const [list] = await db
      .select({ id: schema.shoppingLists.id })
      .from(schema.shoppingLists)
      .where(
        and(
          eq(schema.shoppingLists.id, params.id),
          eq(schema.shoppingLists.userId, user.id)
        )
      )
      .limit(1);
    if (!list) throw data(null, { status: 403 });
  }

  if (intent === "check" || intent === "uncheck") {
    await assertListOwner();
    const itemId = String(fd.get("itemId") ?? "");
    await db
      .update(schema.shoppingListItems)
      .set({ checkedAt: intent === "check" ? new Date() : null })
      .where(
        and(
          eq(schema.shoppingListItems.id, itemId),
          eq(schema.shoppingListItems.shoppingListId, params.id)
        )
      );
    return { ok: true };
  }

  if (intent === "remove-item") {
    await assertListOwner();
    const itemId = String(fd.get("itemId") ?? "");
    await db
      .delete(schema.shoppingListItems)
      .where(
        and(
          eq(schema.shoppingListItems.id, itemId),
          eq(schema.shoppingListItems.shoppingListId, params.id)
        )
      );
    return { ok: true };
  }

  if (intent === "add-manual") {
    await assertListOwner();
    const text = String(fd.get("text") ?? "").trim();
    if (!text) return { error: "Item text is required." };
    const quantity = String(fd.get("quantity") ?? "").trim() || null;
    const unit = String(fd.get("unit") ?? "").trim() || null;
    await db.insert(schema.shoppingListItems).values({
      shoppingListId: params.id,
      manualText: text,
      quantity,
      unit,
      aisle: categorizeAisle(text),
    });
    return { ok: true };
  }

  if (intent === "add-from-recipe") {
    await assertListOwner();
    const recipeId = String(fd.get("recipeId") ?? "");
    const ingredientIds = fd.getAll("ingredientId").map(String).filter(Boolean);

    if (!ingredientIds.length) return { error: "Select at least one ingredient." };

    const [recipe] = await db
      .select({ id: schema.recipes.id })
      .from(schema.recipes)
      .where(
        and(
          eq(schema.recipes.id, recipeId),
          eq(schema.recipes.userId, user.id),
          isNull(schema.recipes.deletedAt)
        )
      )
      .limit(1);
    if (!recipe) throw data(null, { status: 403 });

    const ings = await db
      .select()
      .from(schema.ingredients)
      .where(inArray(schema.ingredients.id, ingredientIds));

    if (!ings.length) return { error: "No valid ingredients found." };

    await db.insert(schema.shoppingListItems).values(
      ings.map((ing) => ({
        shoppingListId: params.id,
        recipeId,
        ingredientId: ing.id,
        manualText: ing.name,
        quantity: ing.quantityRaw,
        unit: ing.unitRaw,
        aisle: categorizeAisle(ing.name),
      }))
    );
    return redirect(`/shopping-lists/${params.id}`);
  }

  if (intent === "complete" || intent === "uncomplete") {
    await assertListOwner();
    await db
      .update(schema.shoppingLists)
      .set({ completedAt: intent === "complete" ? new Date() : null })
      .where(eq(schema.shoppingLists.id, params.id));
    return { ok: true };
  }

  throw data(null, { status: 400 });
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatItemLabel(item: ListItem): string {
  const parts = [item.quantity, item.unit, item.manualText].filter(Boolean);
  return parts.join(" ") || "(unnamed item)";
}

function groupByAisle(items: ListItem[]): Array<{ aisle: string; items: ListItem[] }> {
  const map = new Map<string, ListItem[]>();
  for (const item of items) {
    const aisle = item.aisle || "Other";
    const bucket = map.get(aisle) ?? [];
    bucket.push(item);
    map.set(aisle, bucket);
  }
  return AISLE_ORDER.filter((a) => map.has(a))
    .map((a) => ({ aisle: a, items: map.get(a)! }));
}

// ─── Item Row ─────────────────────────────────────────────────────────────────

function ItemRow({ item }: { item: ListItem }) {
  const checkFetcher = useFetcher<{ ok: boolean }>();
  const removeFetcher = useFetcher<{ ok: boolean }>();

  const optimisticChecked = (() => {
    if (checkFetcher.state !== "idle") {
      return checkFetcher.formData?.get("_intent") === "check";
    }
    return !!item.checkedAt;
  })();

  function handleToggle() {
    if (typeof navigator !== "undefined" && "vibrate" in navigator) {
      navigator.vibrate(10);
    }
    checkFetcher.submit(
      { _intent: optimisticChecked ? "uncheck" : "check", itemId: item.id },
      { method: "post" }
    );
  }

  const isRemoving = removeFetcher.state !== "idle";
  if (isRemoving) return null;

  return (
    <div className={`flex items-center gap-3 py-2.5 ${optimisticChecked ? "opacity-50" : ""}`}>
      <button
        type="button"
        onClick={handleToggle}
        aria-label={optimisticChecked ? "Uncheck item" : "Check off item"}
        className={`w-5 h-5 rounded border-2 shrink-0 flex items-center justify-center transition-colors
          ${optimisticChecked
            ? "bg-primary border-primary"
            : "border-input hover:border-primary"
          }`}
      >
        {optimisticChecked && (
          <svg className="w-3 h-3 text-primary-foreground" fill="none" viewBox="0 0 12 12" aria-hidden="true">
            <path
              d="M2 6l3 3 5-5"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        )}
      </button>
      <span className={`flex-1 text-sm ${optimisticChecked ? "line-through text-muted-foreground" : ""}`}>
        {formatItemLabel(item)}
      </span>
      <removeFetcher.Form method="post">
        <input type="hidden" name="_intent" value="remove-item" />
        <input type="hidden" name="itemId" value={item.id} />
        <button
          type="submit"
          aria-label="Remove item"
          className="text-muted-foreground hover:text-red-500 text-base leading-none px-1.5 py-0.5"
        >
          ×
        </button>
      </removeFetcher.Form>
    </div>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────

export default function ShoppingListDetail({
  loaderData,
  actionData,
}: Route.ComponentProps) {
  const { list, items, recipes, addFromRecipeId, addFromIngredients } = loaderData;
  const [addMode, setAddMode] = useState<"recipe" | "manual" | null>(null);
  const [allSelected, setAllSelected] = useState(false);

  const groups = groupByAisle(items as ListItem[]);
  const checkedCount = items.filter((i) => i.checkedAt).length;

  function copyLink() {
    navigator.clipboard?.writeText(window.location.href).catch(() => {});
  }

  return (
    <div className="min-h-screen bg-background pb-32">
      {/* Header */}
      <header className="sticky top-0 z-10 bg-background border-b">
        <div className="max-w-lg mx-auto px-4 py-3 flex items-center gap-3">
          <Link
            to="/shopping-lists"
            className="text-sm text-muted-foreground hover:text-foreground shrink-0"
          >
            ← Lists
          </Link>
          <span className="font-semibold flex-1 truncate text-sm">
            {list.name}
          </span>
          {items.length > 0 && (
            <span className="text-xs text-muted-foreground shrink-0">
              {checkedCount}/{items.length}
            </span>
          )}
          <Form method="post" className="shrink-0">
            <input
              type="hidden"
              name="_intent"
              value={list.completedAt ? "uncomplete" : "complete"}
            />
            <button
              type="submit"
              className={`text-xs px-2 py-1 rounded-md border transition-colors ${
                list.completedAt
                  ? "border-primary text-primary hover:bg-primary/10"
                  : "border-input text-muted-foreground hover:text-foreground"
              }`}
            >
              {list.completedAt ? "Reopen" : "Complete"}
            </button>
          </Form>
        </div>
      </header>

      <main className="max-w-lg mx-auto px-4 py-4 space-y-6">
        {/* Items grouped by aisle */}
        {items.length === 0 ? (
          <p className="text-center text-muted-foreground text-sm py-12">
            No items yet. Add some below.
          </p>
        ) : (
          <div className="space-y-4">
            {groups.map(({ aisle, items: aisleItems }) => {
              const unchecked = aisleItems.filter((i) => !i.checkedAt);
              const checked = aisleItems.filter((i) => i.checkedAt);
              const sorted = [...unchecked, ...checked];
              return (
                <section key={aisle}>
                  <h2 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-1 pb-1 border-b">
                    {aisle}
                  </h2>
                  <div className="divide-y">
                    {sorted.map((item) => (
                      <ItemRow key={item.id} item={item as ListItem} />
                    ))}
                  </div>
                </section>
              );
            })}
          </div>
        )}

        {/* Add items panel */}
        <div className="border rounded-lg overflow-hidden">
          <div className="flex border-b">
            <button
              type="button"
              onClick={() => setAddMode(addMode === "recipe" ? null : "recipe")}
              className={`flex-1 py-2.5 text-sm font-medium transition-colors ${
                addMode === "recipe"
                  ? "bg-primary/10 text-primary"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              + From Recipe
            </button>
            <div className="w-px bg-border" />
            <button
              type="button"
              onClick={() => setAddMode(addMode === "manual" ? null : "manual")}
              className={`flex-1 py-2.5 text-sm font-medium transition-colors ${
                addMode === "manual"
                  ? "bg-primary/10 text-primary"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              + Manual
            </button>
          </div>

          {/* From Recipe panel */}
          {addMode === "recipe" && (
            <div className="p-4 space-y-4">
              {/* Recipe selector (GET form updates URL param) */}
              <Form method="get" className="flex gap-2">
                <select
                  name="addFromRecipeId"
                  defaultValue={addFromRecipeId ?? ""}
                  onChange={(e) => e.currentTarget.form?.requestSubmit()}
                  className="flex-1 rounded-md border border-input bg-background px-3 py-2 text-sm"
                >
                  <option value="">Select a recipe…</option>
                  {recipes.map((r) => (
                    <option key={r.id} value={r.id}>
                      {r.title}
                    </option>
                  ))}
                </select>
              </Form>

              {/* Ingredient checkboxes */}
              {addFromIngredients && addFromIngredients.length > 0 && (
                <Form method="post" className="space-y-3">
                  <input type="hidden" name="_intent" value="add-from-recipe" />
                  <input
                    type="hidden"
                    name="recipeId"
                    value={addFromRecipeId ?? ""}
                  />

                  <div className="space-y-0.5 max-h-64 overflow-y-auto rounded border">
                    <label className="flex items-center gap-2 px-3 py-2 border-b bg-muted/30 cursor-pointer">
                      <input
                        type="checkbox"
                        className="rounded"
                        checked={allSelected}
                        onChange={(e) => setAllSelected(e.target.checked)}
                        aria-label={allSelected ? "Deselect all ingredients" : "Select all ingredients"}
                      />
                      <span className="text-xs font-medium text-muted-foreground">
                        Select all
                      </span>
                    </label>
                    {addFromIngredients
                      .filter((ing) => !ing.isGroupHeader)
                      .map((ing) => {
                        const label = [ing.quantityRaw, ing.unitRaw, ing.name]
                          .filter(Boolean)
                          .join(" ");
                        return (
                          <label
                            key={ing.id}
                            className="flex items-center gap-2 px-3 py-2 hover:bg-muted/30 cursor-pointer"
                          >
                            <input
                              type="checkbox"
                              name="ingredientId"
                              value={ing.id}
                              className="rounded"
                              checked={allSelected || undefined}
                              aria-label={`Add ingredient ${label} to shopping list`}
                            />
                            <span className="text-sm">{label}</span>
                          </label>
                        );
                      })}
                  </div>

                  {actionData && "error" in actionData && (
                    <p className="text-sm text-red-500">{actionData.error}</p>
                  )}

                  <button
                    type="submit"
                    className="w-full rounded-md bg-primary text-primary-foreground py-2 text-sm font-medium hover:bg-primary/90"
                  >
                    Add Selected
                  </button>
                </Form>
              )}

              {addFromRecipeId && addFromIngredients && addFromIngredients.length === 0 && (
                <p className="text-sm text-muted-foreground text-center py-2">
                  No ingredients found for this recipe.
                </p>
              )}
            </div>
          )}

          {/* Manual entry panel */}
          {addMode === "manual" && (
            <Form method="post" className="p-4 space-y-3">
              <input type="hidden" name="_intent" value="add-manual" />
              <input
                name="text"
                placeholder="Item name (e.g. olive oil, flour)"
                className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                required
                autoFocus
              />
              <div className="flex gap-2">
                <input
                  name="quantity"
                  placeholder="Qty"
                  className="w-20 rounded-md border border-input bg-background px-3 py-2 text-sm"
                />
                <input
                  name="unit"
                  placeholder="Unit"
                  className="w-24 rounded-md border border-input bg-background px-3 py-2 text-sm"
                />
                <button
                  type="submit"
                  className="flex-1 rounded-md bg-primary text-primary-foreground py-2 text-sm font-medium hover:bg-primary/90"
                >
                  Add
                </button>
              </div>
              {actionData && "error" in actionData && (
                <p className="text-sm text-red-500">{actionData.error}</p>
              )}
            </Form>
          )}
        </div>

        {/* Share link (P2: copy current URL — public sharing deferred) */}
        <button
          type="button"
          onClick={copyLink}
          className="w-full text-xs text-muted-foreground hover:text-foreground py-2 text-center"
        >
          Copy link (requires sign-in to view)
        </button>
      </main>
    </div>
  );
}
