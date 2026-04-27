/**
 * AI Recipe Improvement — /recipes/:id/improve
 *
 * Shows profile picker, triggers SSE improvement, displays field-level diff,
 * allows accept/reject per field, and applies the result as a copy.
 */

import { useState } from "react";
import { Link, useLoaderData, useFetcher } from "react-router";
import { data, redirect } from "react-router";
import { and, eq, isNull, asc, desc } from "drizzle-orm";
import type { Route } from "./+types/recipes.$id.improve";
import { requireUser } from "~/lib/auth.server";
import { createDb, schema } from "~/db";
import {
  computeDiff,
  DAILY_QUOTA,
  getQuotaUsed,
  type ImprovedRecipe,
  type RecipeDiff,
  type RecipeInput,
} from "~/lib/ai-improve.server";
import { parseIngredientLine } from "~/lib/ingredient-parser";

export function meta({ data: d }: Route.MetaArgs) {
  const title = d?.recipe?.title ?? "Recipe";
  return [{ title: `Improve: ${title} — ProjectSpice` }];
}

// ---------------------------------------------------------------------------
// Loader
// ---------------------------------------------------------------------------

export async function loader({ params, request, context }: Route.LoaderArgs) {
  const user = await requireUser(request, context);
  const { db } = createDb(context.cloudflare.env.DB);

  const [recipeRows, ingredientRows, profileRows, variantRows] =
    await Promise.all([
      db
        .select()
        .from(schema.recipes)
        .where(
          and(
            eq(schema.recipes.id, params.id),
            eq(schema.recipes.userId, user.id),
            isNull(schema.recipes.deletedAt)
          )
        )
        .limit(1),
      db
        .select()
        .from(schema.ingredients)
        .where(eq(schema.ingredients.recipeId, params.id))
        .orderBy(asc(schema.ingredients.sortOrder)),
      db
        .select()
        .from(schema.aiProfiles)
        .where(eq(schema.aiProfiles.userId, user.id))
        .orderBy(schema.aiProfiles.name),
      // Load AI-improved variants of this recipe
      db
        .select({
          id: schema.recipes.id,
          title: schema.recipes.title,
          variantType: schema.recipes.variantType,
          createdAt: schema.recipes.createdAt,
          profileId: schema.recipes.variantProfileId,
        })
        .from(schema.recipes)
        .where(
          and(
            eq(schema.recipes.parentRecipeId, params.id),
            eq(schema.recipes.userId, user.id),
            isNull(schema.recipes.deletedAt)
          )
        )
        .orderBy(desc(schema.recipes.createdAt)),
    ]);

  const recipe = recipeRows[0];
  if (!recipe) throw data(null, { status: 404 });

  const kv = context.cloudflare.env.SESSIONS;
  const day = new Date().toISOString().slice(0, 10);
  const quotaUsed = await getQuotaUsed(kv, user.id, day);

  return {
    recipe,
    ingredients: ingredientRows,
    profiles: profileRows,
    variants: variantRows,
    quotaUsed,
    quotaLimit: DAILY_QUOTA,
  };
}

// ---------------------------------------------------------------------------
// Action — apply improved recipe as a copy
// ---------------------------------------------------------------------------

export async function action({ params, request, context }: Route.ActionArgs) {
  const user = await requireUser(request, context);
  const fd = await request.formData();
  const intent = String(fd.get("_intent") ?? "");

  if (intent !== "apply") {
    throw data(null, { status: 400 });
  }

  const profileId = String(fd.get("profileId") ?? "").trim();
  const title = String(fd.get("title") ?? "").trim();
  const description = String(fd.get("description") ?? "").trim();
  const directionsText = String(fd.get("directions") ?? "").trim();
  const notes = String(fd.get("notes") ?? "").trim();
  const ingredientsRaw = String(fd.get("ingredients") ?? "").trim();

  if (!title) throw data({ error: "Title required" }, { status: 400 });

  const ingredientLines = ingredientsRaw
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean);

  const { db } = createDb(context.cloudflare.env.DB);

  // Generate a unique slug for the variant
  const slugBase = title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 100);
  const existingRecipes = await db
    .select({ slug: schema.recipes.slug })
    .from(schema.recipes)
    .where(and(eq(schema.recipes.userId, user.id), isNull(schema.recipes.deletedAt)));
  const slugSet = new Set(existingRecipes.map((r) => r.slug));
  let slug = slugBase;
  let n = 2;
  while (slugSet.has(slug)) slug = `${slugBase}-${n++}`;

  const newId = crypto.randomUUID();

  await db.insert(schema.recipes).values({
    id: newId,
    userId: user.id,
    title,
    slug,
    description: description || undefined,
    directionsText: directionsText || undefined,
    notes: notes || undefined,
    parentRecipeId: params.id,
    variantType: "ai_improved",
    variantProfileId: profileId || undefined,
    sourceType: "manual",
    visibility: "private",
  });

  // Insert ingredients
  for (let i = 0; i < ingredientLines.length; i++) {
    const parsed = parseIngredientLine(ingredientLines[i], null);
    if (parsed.is_group_header) {
      await db.insert(schema.ingredients).values({
        recipeId: newId,
        sortOrder: i,
        groupName: ingredientLines[i],
        name: ingredientLines[i],
        isGroupHeader: true,
      });
    } else {
      await db.insert(schema.ingredients).values({
        recipeId: newId,
        sortOrder: i,
        groupName: null,
        quantityRaw: parsed.quantity_raw || null,
        quantityDecimal: parsed.quantity_decimal ?? null,
        unitRaw: parsed.unit_raw || null,
        unitCanonical: parsed.unit_canonical ?? null,
        name: parsed.name,
        notes: parsed.notes ?? null,
        weightG: parsed.weight_g ?? null,
        footnoteRef: parsed.footnote_ref ?? null,
        isGroupHeader: false,
      });
    }
  }

  return redirect(`/recipes/${newId}`);
}

// ---------------------------------------------------------------------------
// Component helpers
// ---------------------------------------------------------------------------

function DiffField({
  label,
  diff,
  accepted,
  onToggle,
}: {
  label: string;
  diff: { changed: boolean; original: string; improved: string };
  accepted: boolean;
  onToggle: () => void;
}) {
  if (!diff.changed) {
    return (
      <div className="space-y-1">
        <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
          {label} — unchanged
        </p>
        <p className="text-sm whitespace-pre-line">{diff.original || "(empty)"}</p>
      </div>
    );
  }

  return (
    <div className="space-y-2 border rounded-md p-3">
      <div className="flex items-center justify-between">
        <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
          {label}
        </p>
        <button
          type="button"
          onClick={onToggle}
          className={`text-xs px-2 py-1 rounded font-medium transition-colors ${
            accepted
              ? "bg-green-100 text-green-700 hover:bg-green-200"
              : "bg-muted text-muted-foreground hover:bg-muted/80"
          }`}
        >
          {accepted ? "✓ Accepted" : "Accept"}
        </button>
      </div>
      <div className="grid grid-cols-2 gap-2 text-sm">
        <div>
          <p className="text-xs text-red-500 font-medium mb-1">Original</p>
          <p className="whitespace-pre-line text-muted-foreground line-through decoration-red-300">
            {diff.original || "(empty)"}
          </p>
        </div>
        <div>
          <p className="text-xs text-green-600 font-medium mb-1">Improved</p>
          <p className="whitespace-pre-line">{diff.improved || "(empty)"}</p>
        </div>
      </div>
    </div>
  );
}

function DiffIngredients({
  diff,
  accepted,
  onToggle,
}: {
  diff: RecipeDiff["ingredients"];
  accepted: boolean;
  onToggle: () => void;
}) {
  if (!diff.changed) {
    return (
      <div className="space-y-1">
        <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
          Ingredients — unchanged
        </p>
        <ul className="text-sm list-disc list-inside space-y-0.5">
          {diff.original.map((l, i) => (
            <li key={i}>{l}</li>
          ))}
        </ul>
      </div>
    );
  }

  return (
    <div className="space-y-2 border rounded-md p-3">
      <div className="flex items-center justify-between">
        <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
          Ingredients
        </p>
        <button
          type="button"
          onClick={onToggle}
          className={`text-xs px-2 py-1 rounded font-medium transition-colors ${
            accepted
              ? "bg-green-100 text-green-700 hover:bg-green-200"
              : "bg-muted text-muted-foreground hover:bg-muted/80"
          }`}
        >
          {accepted ? "✓ Accepted" : "Accept"}
        </button>
      </div>
      <div className="grid grid-cols-2 gap-2 text-sm">
        <div>
          <p className="text-xs text-red-500 font-medium mb-1">Original</p>
          <ul className="list-disc list-inside space-y-0.5 text-muted-foreground line-through decoration-red-300">
            {diff.original.map((l, i) => (
              <li key={i}>{l}</li>
            ))}
          </ul>
        </div>
        <div>
          <p className="text-xs text-green-600 font-medium mb-1">Improved</p>
          <ul className="list-disc list-inside space-y-0.5">
            {diff.improved.map((l, i) => (
              <li key={i}>{l}</li>
            ))}
          </ul>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Page component
// ---------------------------------------------------------------------------

type AcceptState = {
  title: boolean;
  description: boolean;
  ingredients: boolean;
  directions: boolean;
  notes: boolean;
};

export default function RecipeImprovePage() {
  const { recipe, ingredients, profiles, variants, quotaUsed, quotaLimit } =
    useLoaderData<typeof loader>();
  const fetcher = useFetcher();

  const [selectedProfile, setSelectedProfile] = useState<string>(
    profiles[0]?.id ?? ""
  );
  const [improved, setImproved] = useState<ImprovedRecipe | null>(null);
  const [diff, setDiff] = useState<RecipeDiff | null>(null);
  const [provider, setProvider] = useState<string>("");
  const [fromCache, setFromCache] = useState(false);
  const [isStreaming, setIsStreaming] = useState(false);
  const [error, setError] = useState<{
    message: string;
    tosError?: boolean;
    quotaExceeded?: boolean;
  } | null>(null);
  const [accepts, setAccepts] = useState<AcceptState>({
    title: true,
    description: true,
    ingredients: true,
    directions: true,
    notes: true,
  });

  const recipeInput: RecipeInput = {
    id: recipe.id,
    title: recipe.title,
    description: recipe.description ?? null,
    directionsText: recipe.directionsText ?? null,
    notes: recipe.notes ?? null,
    contentHash: recipe.contentHash ?? null,
    ingredients: ingredients.map((i) => ({
      sortOrder: i.sortOrder,
      groupName: i.groupName ?? null,
      quantityRaw: i.quantityRaw ?? null,
      unitRaw: i.unitRaw ?? null,
      name: i.name,
      notes: i.notes ?? null,
      isGroupHeader: i.isGroupHeader,
    })),
  };

  function handleImprove(profileIdOverride?: string) {
    const profileId = profileIdOverride ?? selectedProfile;
    if (!profileId) return;
    if (profileIdOverride) setSelectedProfile(profileIdOverride);
    setImproved(null);
    setDiff(null);
    setError(null);
    setIsStreaming(true);

    fetch(`/api/recipes/${recipe.id}/improve`, {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ profileId }),
    })
      .then(async (resp) => {
        if (!resp.ok) {
          const err = (await resp.json()) as { error?: string };
          setError({ message: err.error ?? "Request failed" });
          setIsStreaming(false);
          return;
        }
        const reader = resp.body!.getReader();
        const decoder = new TextDecoder();
        let buffer = "";

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split("\n\n");
          buffer = lines.pop() ?? "";

          for (const chunk of lines) {
            const line = chunk.trim();
            if (!line.startsWith("data:")) continue;
            try {
              const payload = JSON.parse(line.slice(5).trim()) as Record<
                string,
                unknown
              >;
              if (payload.type === "result") {
                const imp = payload.improved as ImprovedRecipe;
                setImproved(imp);
                setProvider(String(payload.provider ?? ""));
                setFromCache(Boolean(payload.fromCache));
                const d = computeDiff(recipeInput, imp);
                setDiff(d);
                setAccepts({
                  title: d.title.changed,
                  description: d.description.changed,
                  ingredients: d.ingredients.changed,
                  directions: d.directions.changed,
                  notes: d.notes.changed,
                });
              } else if (payload.type === "error") {
                setError({
                  message: String(payload.message ?? "AI improvement failed"),
                  tosError: Boolean(payload.tosError),
                  quotaExceeded: Boolean(payload.quotaExceeded),
                });
              } else if (payload.type === "done") {
                setIsStreaming(false);
              }
            } catch {
              // malformed SSE chunk — ignore
            }
          }
        }
        setIsStreaming(false);
      })
      .catch((e: Error) => {
        setError({ message: e.message });
        setIsStreaming(false);
      });
  }

  function resolvedField<T>(
    field: keyof AcceptState,
    original: T,
    imp: T
  ): T {
    return accepts[field] ? imp : original;
  }

  const finalTitle = improved
    ? resolvedField("title", recipe.title, improved.title)
    : recipe.title;
  const finalDescription = improved
    ? resolvedField("description", recipe.description ?? "", improved.description)
    : (recipe.description ?? "");
  const finalIngredients = improved
    ? resolvedField(
        "ingredients",
        ingredients
          .filter((i) => !i.isGroupHeader)
          .map((i) =>
            [i.quantityRaw, i.unitRaw, i.name, i.notes].filter(Boolean).join(" ")
          ),
        improved.ingredients
      )
    : ingredients
        .filter((i) => !i.isGroupHeader)
        .map((i) =>
          [i.quantityRaw, i.unitRaw, i.name, i.notes].filter(Boolean).join(" ")
        );
  const finalDirections = improved
    ? resolvedField("directions", recipe.directionsText ?? "", improved.directions)
    : (recipe.directionsText ?? "");
  const finalNotes = improved
    ? resolvedField("notes", recipe.notes ?? "", improved.notes)
    : (recipe.notes ?? "");

  const quotaRemaining = quotaLimit - quotaUsed;

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="sticky top-0 z-10 bg-background/95 backdrop-blur border-b">
        <div className="max-w-3xl mx-auto px-4 h-14 flex items-center gap-3">
          <Link
            to={`/recipes/${recipe.id}`}
            className="text-muted-foreground hover:text-foreground text-sm"
          >
            ← Back
          </Link>
          <span className="text-muted-foreground">/</span>
          <span className="font-medium text-sm truncate flex-1">
            AI Improve: {recipe.title}
          </span>
          <span className="text-xs text-muted-foreground">
            {quotaRemaining}/{quotaLimit} today
          </span>
        </div>
      </header>

      <main className="max-w-3xl mx-auto px-4 py-6 space-y-8">
        {/* Profile picker + trigger */}
        <section className="space-y-4">
          <h1 className="text-xl font-semibold">Improve Recipe</h1>

          {profiles.length === 0 ? (
            <div className="rounded-md border p-4 text-sm text-muted-foreground space-y-2">
              <p>No AI profiles yet.</p>
              <Link
                to="/settings/ai-profiles"
                className="text-primary underline underline-offset-2 hover:opacity-80"
              >
                Create a profile →
              </Link>
            </div>
          ) : (
            <div className="flex flex-col sm:flex-row gap-3 items-start sm:items-center">
              <select
                value={selectedProfile}
                onChange={(e) => setSelectedProfile(e.target.value)}
                className="border rounded-md px-3 py-2 text-sm bg-background flex-1"
                disabled={isStreaming}
              >
                {profiles.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </select>
              <button
                type="button"
                onClick={() => handleImprove()}
                disabled={isStreaming || quotaRemaining <= 0 || !selectedProfile}
                className="bg-primary text-primary-foreground text-sm font-medium px-4 py-2 rounded-md disabled:opacity-50 whitespace-nowrap"
              >
                {isStreaming ? "Improving…" : "Improve Recipe"}
              </button>
            </div>
          )}

          {quotaRemaining <= 0 && (
            <p className="text-sm text-amber-600">
              Daily quota reached ({quotaLimit}/day). Try again tomorrow.
            </p>
          )}
        </section>

        {/* Error state */}
        {error && (
          <div className="rounded-md border border-red-200 bg-red-50 p-4 text-sm text-red-700 space-y-2">
            <p className="font-medium">Improvement failed</p>
            <p>{error.message}</p>
            {error.tosError && (
              <p className="text-xs text-red-600">
                AI provider returned an auth error. If this persists, the app
                may need to switch to metered API billing — contact the admin.
              </p>
            )}
            {error.quotaExceeded && (
              <p className="text-xs text-red-600">
                Daily quota of {quotaLimit} improvements reached.
              </p>
            )}
          </div>
        )}

        {/* Loading state */}
        {isStreaming && (
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <span className="animate-spin">⟳</span>
            <span>Contacting AI… this may take a few seconds.</span>
          </div>
        )}

        {/* Diff view */}
        {diff && improved && (
          <section className="space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-base font-semibold">Review Changes</h2>
              <span className="text-xs text-muted-foreground">
                via {provider}
                {fromCache ? " (cached)" : ""}
              </span>
            </div>

            <p className="text-xs text-muted-foreground">
              Click <strong>Accept</strong> on each field to include it in the
              copy. Unchanged fields are carried over automatically.
            </p>

            <div className="space-y-4">
              <DiffField
                label="Title"
                diff={diff.title}
                accepted={accepts.title}
                onToggle={() =>
                  setAccepts((a) => ({ ...a, title: !a.title }))
                }
              />
              <DiffField
                label="Description"
                diff={diff.description}
                accepted={accepts.description}
                onToggle={() =>
                  setAccepts((a) => ({ ...a, description: !a.description }))
                }
              />
              <DiffIngredients
                diff={diff.ingredients}
                accepted={accepts.ingredients}
                onToggle={() =>
                  setAccepts((a) => ({
                    ...a,
                    ingredients: !a.ingredients,
                  }))
                }
              />
              <DiffField
                label="Directions"
                diff={diff.directions}
                accepted={accepts.directions}
                onToggle={() =>
                  setAccepts((a) => ({ ...a, directions: !a.directions }))
                }
              />
              <DiffField
                label="Notes"
                diff={diff.notes}
                accepted={accepts.notes}
                onToggle={() =>
                  setAccepts((a) => ({ ...a, notes: !a.notes }))
                }
              />
            </div>

            {/* Apply as copy */}
            <fetcher.Form method="post">
              <input type="hidden" name="_intent" value="apply" />
              <input type="hidden" name="profileId" value={selectedProfile} />
              <input type="hidden" name="title" value={finalTitle} />
              <input
                type="hidden"
                name="description"
                value={finalDescription}
              />
              <input
                type="hidden"
                name="ingredients"
                value={finalIngredients.join("\n")}
              />
              <input
                type="hidden"
                name="directions"
                value={finalDirections}
              />
              <input type="hidden" name="notes" value={finalNotes} />
              <button
                type="submit"
                disabled={fetcher.state !== "idle"}
                className="w-full sm:w-auto bg-green-600 text-white text-sm font-medium px-6 py-2 rounded-md hover:bg-green-700 disabled:opacity-50"
              >
                {fetcher.state !== "idle"
                  ? "Saving…"
                  : "Apply as Copy"}
              </button>
            </fetcher.Form>
          </section>
        )}

        {/* Version history panel */}
        {variants.length > 0 && (
          <section className="space-y-3 border-t pt-6">
            <h2 className="text-base font-semibold">Previous AI Versions</h2>
            <ul className="space-y-2">
              {variants.map((v) => (
                <li key={v.id} className="flex items-center gap-2 text-sm">
                  <Link
                    to={`/recipes/${v.id}`}
                    className="text-primary underline underline-offset-2 hover:opacity-80 flex-1 truncate"
                  >
                    {v.title}
                  </Link>
                  <span className="text-xs text-muted-foreground shrink-0">
                    {v.createdAt
                      ? new Date(v.createdAt).toLocaleDateString()
                      : ""}
                  </span>
                </li>
              ))}
            </ul>
          </section>
        )}

        {/* Side-by-side profile compare (when multiple profiles exist) */}
        {profiles.length > 1 && !improved && !isStreaming && (
          <section className="space-y-3 border-t pt-6">
            <h2 className="text-base font-semibold">Your AI Profiles</h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {profiles.map((p) => (
                <div key={p.id} className="border rounded-md p-3 space-y-1">
                  <p className="font-medium text-sm">{p.name}</p>
                  <p className="text-xs text-muted-foreground line-clamp-3">
                    {p.systemPrompt}
                  </p>
                  <button
                    type="button"
                    onClick={() => handleImprove(p.id)}
                    disabled={isStreaming || quotaRemaining <= 0}
                    className="text-xs text-primary underline underline-offset-2 hover:opacity-80 disabled:opacity-50"
                  >
                    Improve with this profile
                  </button>
                </div>
              ))}
            </div>
          </section>
        )}
      </main>
    </div>
  );
}
