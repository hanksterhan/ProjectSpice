/**
 * AI Recipe Improvement — /recipes/:id/improve
 *
 * Shows profile and lens controls, triggers SSE improvement, displays field-level
 * diff, and saves the accepted result as either a variant or original replace.
 */

import { useMemo, useState } from "react";
import { Link, useFetcher, useLoaderData, useSearchParams } from "react-router";
import { data, redirect } from "react-router";
import { and, asc, desc, eq, isNull } from "drizzle-orm";
import type { Route } from "./+types/recipes.$id.improve";
import { AppShell } from "~/components/app-shell";
import { Button, Chip, ModalFrame, SectionHeader } from "~/components/ui";
import { requireUser } from "~/lib/auth.server";
import { createDb, schema } from "~/db";
import {
  DAILY_QUOTA,
  getQuotaUsed,
} from "~/lib/ai-improve.server";
import {
  computeDiff,
  type ImprovedRecipe,
  type RecipeDiff,
  type RecipeInput,
} from "~/lib/ai-improve.shared";
import {
  AI_LENSES,
  aiLensPrompt,
  aiLensSummary,
  isAiLensActive,
  parseAiLensSearchParams,
  type AiLensId,
  type AiLensState,
} from "~/lib/ai-lens.shared";
import { parseIngredientLine } from "~/lib/ingredient-parser";

type AcceptState = {
  title: boolean;
  description: boolean;
  ingredients: boolean;
  directions: boolean;
  notes: boolean;
};

type SaveMode = "variant" | "replace" | null;

export function meta({ data: d }: Route.MetaArgs) {
  const title = d?.recipe?.title ?? "Recipe";
  return [{ title: `Improve: ${title} - ProjectSpice` }];
}

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

  const day = new Date().toISOString().slice(0, 10);
  const quotaUsed = await getQuotaUsed(context.cloudflare.env.SESSIONS, user.id, day);

  return {
    user: { name: user.name, email: user.email },
    recipe,
    ingredients: ingredientRows,
    profiles: profileRows,
    variants: variantRows,
    quotaUsed,
    quotaLimit: DAILY_QUOTA,
  };
}

export async function action({ params, request, context }: Route.ActionArgs) {
  const user = await requireUser(request, context);
  const fd = await request.formData();
  const intent = String(fd.get("_intent") ?? "");

  if (intent !== "apply" && intent !== "replace") {
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
    .map((line) => line.trim())
    .filter(Boolean);

  const { db } = createDb(context.cloudflare.env.DB);
  const [existing] = await db
    .select({
      id: schema.recipes.id,
    })
    .from(schema.recipes)
    .where(
      and(
        eq(schema.recipes.id, params.id),
        eq(schema.recipes.userId, user.id),
        isNull(schema.recipes.deletedAt)
      )
    )
    .limit(1);

  if (!existing) throw data({ error: "Recipe not found" }, { status: 404 });

  if (intent === "replace") {
    await db
      .update(schema.recipes)
      .set({
        title,
        description: description || null,
        directionsText,
        notes: notes || null,
        updatedAt: new Date(),
      })
      .where(eq(schema.recipes.id, params.id));
    await db.delete(schema.ingredients).where(eq(schema.ingredients.recipeId, params.id));
    await insertIngredientLines(db, params.id, ingredientLines);
    return redirect(`/recipes/${params.id}`);
  }

  const newId = crypto.randomUUID();
  const slug = await uniqueSlug(db, user.id, title);

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

  await insertIngredientLines(db, newId, ingredientLines);
  return redirect(`/recipes/${newId}`);
}

async function uniqueSlug(db: ReturnType<typeof createDb>["db"], userId: string, title: string) {
  const slugBase =
    title
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "")
      .slice(0, 100) || "recipe";
  const existingRecipes = await db
    .select({ slug: schema.recipes.slug })
    .from(schema.recipes)
    .where(and(eq(schema.recipes.userId, userId), isNull(schema.recipes.deletedAt)));
  const slugSet = new Set(existingRecipes.map((recipe) => recipe.slug));
  let slug = slugBase;
  let n = 2;
  while (slugSet.has(slug)) slug = `${slugBase}-${n++}`;
  return slug;
}

async function insertIngredientLines(
  db: ReturnType<typeof createDb>["db"],
  recipeId: string,
  ingredientLines: string[]
) {
  for (let i = 0; i < ingredientLines.length; i++) {
    const parsed = parseIngredientLine(ingredientLines[i], null);
    if (parsed.is_group_header) {
      await db.insert(schema.ingredients).values({
        recipeId,
        sortOrder: i,
        groupName: ingredientLines[i],
        name: ingredientLines[i],
        isGroupHeader: true,
      });
    } else {
      await db.insert(schema.ingredients).values({
        recipeId,
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
}

export default function RecipeImprovePage() {
  const { user, recipe, ingredients, profiles, variants, quotaUsed, quotaLimit } =
    useLoaderData<typeof loader>();
  const fetcher = useFetcher();
  const [searchParams, setSearchParams] = useSearchParams();

  const initialLens = useMemo(
    () => parseAiLensSearchParams(searchParams),
    [] // eslint-disable-line react-hooks/exhaustive-deps
  );
  const [aiLens, setAiLens] = useState<AiLensState>(initialLens);
  const [selectedProfile, setSelectedProfile] = useState<string>(profiles[0]?.id ?? "");
  const [improved, setImproved] = useState<ImprovedRecipe | null>(null);
  const [diff, setDiff] = useState<RecipeDiff | null>(null);
  const [provider, setProvider] = useState<string>("");
  const [fromCache, setFromCache] = useState(false);
  const [isStreaming, setIsStreaming] = useState(false);
  const [saveMode, setSaveMode] = useState<SaveMode>(null);
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

  const originalIngredients = useMemo(
    () =>
      ingredients
        .filter((ingredient) => !ingredient.isGroupHeader)
        .map((ingredient) =>
          [ingredient.quantityRaw, ingredient.unitRaw, ingredient.name, ingredient.notes]
            .filter(Boolean)
            .join(" ")
        ),
    [ingredients]
  );

  const recipeInput: RecipeInput = useMemo(
    () => ({
      id: recipe.id,
      title: recipe.title,
      description: recipe.description ?? null,
      directionsText: recipe.directionsText ?? null,
      notes: recipe.notes ?? null,
      contentHash: recipe.contentHash ?? null,
      ingredients: ingredients.map((ingredient) => ({
        sortOrder: ingredient.sortOrder,
        groupName: ingredient.groupName ?? null,
        quantityRaw: ingredient.quantityRaw ?? null,
        unitRaw: ingredient.unitRaw ?? null,
        name: ingredient.name,
        notes: ingredient.notes ?? null,
        isGroupHeader: ingredient.isGroupHeader,
      })),
    }),
    [ingredients, recipe]
  );

  const lensPrompt = aiLensPrompt(aiLens);
  const lensActive = isAiLensActive(aiLens);
  const quotaRemaining = Math.max(0, quotaLimit - quotaUsed);
  const selectedProfileName =
    profiles.find((profile) => profile.id === selectedProfile)?.name ?? "AI profile";
  const acceptedChangedCount = diff
    ? (Object.keys(accepts) as Array<keyof AcceptState>).filter(
        (field) => diff[field].changed && accepts[field]
      ).length
    : 0;
  const finalTitle = improved
    ? resolvedField(accepts, "title", recipe.title, improved.title)
    : recipe.title;
  const finalDescription = improved
    ? resolvedField(accepts, "description", recipe.description ?? "", improved.description)
    : (recipe.description ?? "");
  const finalIngredients = improved
    ? resolvedField(accepts, "ingredients", originalIngredients, improved.ingredients)
    : originalIngredients;
  const finalDirections = improved
    ? resolvedField(accepts, "directions", recipe.directionsText ?? "", improved.directions)
    : (recipe.directionsText ?? "");
  const finalNotes = improved
    ? resolvedField(accepts, "notes", recipe.notes ?? "", improved.notes)
    : (recipe.notes ?? "");

  function updateLens(next: AiLensState) {
    setAiLens(next);
    const params = new URLSearchParams(searchParams);
    if (next.lenses.length > 0) {
      params.set("lens", next.lenses.join(","));
      params.set("strength", String(Math.round(next.strength * 100)));
    } else {
      params.delete("lens");
      params.delete("strength");
    }
    setSearchParams(params, { replace: true });
  }

  function toggleLens(id: AiLensId) {
    const lenses = aiLens.lenses.includes(id)
      ? aiLens.lenses.filter((lens) => lens !== id)
      : [...aiLens.lenses, id];
    updateLens({ ...aiLens, lenses });
  }

  function handleImprove(profileIdOverride?: string) {
    const profileId = profileIdOverride ?? selectedProfile;
    if (!profileId) return;
    if (profileIdOverride) setSelectedProfile(profileIdOverride);
    setImproved(null);
    setDiff(null);
    setError(null);
    setSaveMode(null);
    setIsStreaming(true);

    fetch(`/api/recipes/${recipe.id}/improve`, {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        profileId,
        lensPrompt: lensActive ? lensPrompt : "",
        lensStrength: aiLens.strength,
      }),
    })
      .then(async (resp) => {
        if (!resp.ok) {
          const err = (await resp.json()) as { error?: string };
          setError({ message: err.error ?? "Request failed" });
          setIsStreaming(false);
          return;
        }
        const reader = resp.body?.getReader();
        if (!reader) {
          setError({ message: "AI response stream was unavailable" });
          setIsStreaming(false);
          return;
        }
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
              const payload = JSON.parse(line.slice(5).trim()) as Record<string, unknown>;
              if (payload.type === "result") {
                const nextImproved = payload.improved as ImprovedRecipe;
                const nextDiff = computeDiff(recipeInput, nextImproved);
                setImproved(nextImproved);
                setProvider(String(payload.provider ?? ""));
                setFromCache(Boolean(payload.fromCache));
                setDiff(nextDiff);
                setAccepts({
                  title: nextDiff.title.changed,
                  description: nextDiff.description.changed,
                  ingredients: nextDiff.ingredients.changed,
                  directions: nextDiff.directions.changed,
                  notes: nextDiff.notes.changed,
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
              // Ignore malformed SSE chunks and keep reading the stream.
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

  function discardDraft() {
    setImproved(null);
    setDiff(null);
    setProvider("");
    setFromCache(false);
    setSaveMode(null);
    setAccepts({
      title: true,
      description: true,
      ingredients: true,
      directions: true,
      notes: true,
    });
  }

  return (
    <AppShell user={user} lensSummary={aiLensSummary(aiLens)}>
      <div className="space-y-5">
        <Link to={`/recipes/${recipe.id}`} className="text-sm font-medium text-ink-3 hover:text-ink">
          Back to recipe
        </Link>

        <SectionHeader
          eyebrow="AI Improve"
          title={recipe.title}
          description="Build a reversible variant from lens choices and profile guidance, then decide field by field what earns a place in the recipe."
          actions={
            <div className="flex items-center gap-2 rounded-full border border-rule bg-paper-2 px-3 py-1.5">
              <span className="ps-mono text-xs text-ink-4">Quota</span>
              <span className="text-sm font-semibold text-ink">
                {quotaRemaining}/{quotaLimit}
              </span>
            </div>
          }
        />

        <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_22rem]">
          <div className="space-y-5">
            <section className="overflow-hidden rounded-lg border border-rule bg-paper-2 shadow-[var(--shadow-1)]">
              <div className="border-b border-rule bg-paper p-4 sm:p-5">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
                  <div>
                    <p className="ps-mono text-xs font-semibold uppercase text-ink-3">
                      Improve stack
                    </p>
                    <h2 className="mt-1 text-lg font-semibold text-ink">
                      {selectedProfileName} {lensActive ? `+ ${aiLensSummary(aiLens)}` : ""}
                    </h2>
                  </div>
                  <Button
                    type="button"
                    variant="primary"
                    onClick={() => handleImprove()}
                    disabled={isStreaming || quotaRemaining <= 0 || !selectedProfile}
                  >
                    {isStreaming ? "Improving..." : improved ? "Run again" : "Improve recipe"}
                  </Button>
                </div>
              </div>

              <div className="grid gap-5 p-4 sm:p-5 lg:grid-cols-[16rem_minmax(0,1fr)]">
                {profiles.length === 0 ? (
                  <NoProfilesPanel />
                ) : (
                  <ProfilePicker
                    profiles={profiles}
                    selectedProfile={selectedProfile}
                    setSelectedProfile={setSelectedProfile}
                    disabled={isStreaming}
                    quotaRemaining={quotaRemaining}
                    onRun={handleImprove}
                  />
                )}
                <LensPicker
                  state={aiLens}
                  onToggle={toggleLens}
                  onStrength={(strength) => updateLens({ ...aiLens, strength })}
                />
              </div>

              {quotaRemaining <= 0 && (
                <div className="border-t border-rule bg-warn/10 px-5 py-3 text-sm text-warn">
                  Daily quota reached ({quotaLimit}/day). Try again tomorrow.
                </div>
              )}
            </section>

            {error && <ErrorPanel error={error} quotaLimit={quotaLimit} />}
            {isStreaming && <StreamingPanel lensActive={lensActive} />}

            {diff && improved ? (
              <section className="space-y-4">
                <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
                  <div>
                    <p className="ps-mono text-xs font-semibold uppercase text-ink-3">
                      Field-level diff
                    </p>
                    <h2 className="ps-display text-2xl text-ink">
                      {acceptedChangedCount} accepted change
                      {acceptedChangedCount === 1 ? "" : "s"}
                    </h2>
                  </div>
                  <span className="text-xs text-ink-4">
                    via {provider || "AI"}
                    {fromCache ? " (cached)" : ""}
                  </span>
                </div>

                <div className="grid gap-3">
                  <DiffField
                    label="Title"
                    diff={diff.title}
                    accepted={accepts.title}
                    onToggle={() => setAccepts((current) => ({ ...current, title: !current.title }))}
                  />
                  <DiffField
                    label="Description"
                    diff={diff.description}
                    accepted={accepts.description}
                    onToggle={() =>
                      setAccepts((current) => ({
                        ...current,
                        description: !current.description,
                      }))
                    }
                  />
                  <DiffIngredients
                    diff={diff.ingredients}
                    accepted={accepts.ingredients}
                    onToggle={() =>
                      setAccepts((current) => ({
                        ...current,
                        ingredients: !current.ingredients,
                      }))
                    }
                  />
                  <DiffField
                    label="Directions"
                    diff={diff.directions}
                    accepted={accepts.directions}
                    onToggle={() =>
                      setAccepts((current) => ({
                        ...current,
                        directions: !current.directions,
                      }))
                    }
                  />
                  <DiffField
                    label="Notes"
                    diff={diff.notes}
                    accepted={accepts.notes}
                    onToggle={() => setAccepts((current) => ({ ...current, notes: !current.notes }))}
                  />
                </div>

                <div className="flex flex-wrap gap-2 rounded-lg border border-rule bg-paper-2 p-3">
                  <Button type="button" variant="primary" onClick={() => setSaveMode("variant")}>
                    Save as variant
                  </Button>
                  <Button type="button" variant="secondary" onClick={() => setSaveMode("replace")}>
                    Replace original
                  </Button>
                  <Button type="button" variant="ghost" onClick={discardDraft}>
                    Discard
                  </Button>
                </div>
              </section>
            ) : (
              !isStreaming && <OriginalPreview recipe={recipe} ingredients={originalIngredients} />
            )}
          </div>

          <aside className="space-y-4 xl:sticky xl:top-20 xl:self-start">
            <DecisionPanel
              lensActive={lensActive}
              lensSummary={aiLensSummary(aiLens)}
              lensPrompt={lensPrompt}
              finalTitle={finalTitle}
              finalIngredients={finalIngredients}
              changedCount={acceptedChangedCount}
            />
            {variants.length > 0 && <VariantPanel variants={variants} />}
          </aside>
        </div>
      </div>

      {saveMode && improved && (
        <SaveModal
          mode={saveMode}
          fetcher={fetcher}
          onClose={() => setSaveMode(null)}
          selectedProfile={selectedProfile}
          recipeTitle={recipe.title}
          finalTitle={finalTitle}
          finalDescription={finalDescription}
          finalIngredients={finalIngredients}
          finalDirections={finalDirections}
          finalNotes={finalNotes}
        />
      )}
    </AppShell>
  );
}

function resolvedField<T>(accepts: AcceptState, field: keyof AcceptState, original: T, improved: T): T {
  return accepts[field] ? improved : original;
}

function ProfilePicker({
  profiles,
  selectedProfile,
  setSelectedProfile,
  disabled,
  quotaRemaining,
  onRun,
}: {
  profiles: Array<{ id: string; name: string; systemPrompt: string }>;
  selectedProfile: string;
  setSelectedProfile: (value: string) => void;
  disabled: boolean;
  quotaRemaining: number;
  onRun: (profileId?: string) => void;
}) {
  return (
    <section className="space-y-3">
      <label className="block space-y-2">
        <span className="ps-mono text-xs font-semibold uppercase text-ink-3">Profile</span>
        <select
          value={selectedProfile}
          onChange={(event) => setSelectedProfile(event.target.value)}
          className="ps-control w-full border border-rule bg-paper px-3 text-sm text-ink focus-visible:ps-focus-ring"
          disabled={disabled}
        >
          {profiles.map((profile) => (
            <option key={profile.id} value={profile.id}>
              {profile.name}
            </option>
          ))}
        </select>
      </label>
      <div className="grid gap-2">
        {profiles.map((profile) => (
          <button
            key={profile.id}
            type="button"
            onClick={() => onRun(profile.id)}
            disabled={disabled || quotaRemaining <= 0}
            className={`rounded-lg border p-3 text-left transition focus-visible:ps-focus-ring disabled:opacity-50 ${
              selectedProfile === profile.id
                ? "border-primary bg-primary/10"
                : "border-rule bg-paper hover:bg-paper-3"
            }`}
          >
            <span className="block text-sm font-semibold text-ink">{profile.name}</span>
            <span className="mt-1 line-clamp-3 block text-xs leading-5 text-ink-3">
              {profile.systemPrompt}
            </span>
          </button>
        ))}
      </div>
    </section>
  );
}

function NoProfilesPanel() {
  return (
    <section className="rounded-lg border border-rule bg-paper p-4 text-sm text-ink-3">
      <p className="font-medium text-ink">No AI profiles yet.</p>
      <p className="mt-1 text-xs leading-5">
        Create a profile to run improvements. Lens choices can still be staged from this page.
      </p>
      <Link
        to="/settings/ai-profiles"
        className="mt-3 inline-flex font-medium text-ink underline underline-offset-4"
      >
        Create a profile
      </Link>
    </section>
  );
}

function LensPicker({
  state,
  onToggle,
  onStrength,
}: {
  state: AiLensState;
  onToggle: (id: AiLensId) => void;
  onStrength: (value: number) => void;
}) {
  return (
    <section className="space-y-4">
      <div>
        <p className="ps-mono text-xs font-semibold uppercase text-ink-3">AI Lens</p>
        <div className="mt-2 flex flex-wrap gap-2">
          {AI_LENSES.map((lens) => (
            <button key={lens.id} type="button" onClick={() => onToggle(lens.id)}>
              <Chip selected={state.lenses.includes(lens.id)}>{lens.label}</Chip>
            </button>
          ))}
        </div>
      </div>
      <label className="block space-y-2">
        <span className="flex items-center justify-between text-xs text-ink-3">
          <span>Strength</span>
          <span>{Math.round(state.strength * 100)}%</span>
        </span>
        <input
          type="range"
          min="0"
          max="100"
          step="5"
          value={Math.round(state.strength * 100)}
          onChange={(event) => onStrength(Number(event.target.value) / 100)}
          className="w-full accent-ink"
        />
        <span className="grid grid-cols-3 text-[0.7rem] uppercase text-ink-4">
          <span>Subtle</span>
          <span className="text-center">Balanced</span>
          <span className="text-right">Bold</span>
        </span>
      </label>
      <p className="rounded-lg border border-rule bg-paper p-3 text-xs leading-5 text-ink-3">
        Lens changes are sent as extra instructions for this run. The original remains unchanged
        until you explicitly replace it.
      </p>
    </section>
  );
}

function ErrorPanel({
  error,
  quotaLimit,
}: {
  error: { message: string; tosError?: boolean; quotaExceeded?: boolean };
  quotaLimit: number;
}) {
  return (
    <section className="rounded-lg border border-err/30 bg-err/10 p-4 text-sm text-err">
      <p className="font-semibold">Improvement failed</p>
      <p className="mt-1">{error.message}</p>
      {error.tosError && (
        <p className="mt-2 text-xs leading-5">
          AI provider authentication failed. The app may need a billing-backed provider token.
        </p>
      )}
      {error.quotaExceeded && (
        <p className="mt-2 text-xs leading-5">
          Daily quota of {quotaLimit} improvements reached.
        </p>
      )}
    </section>
  );
}

function StreamingPanel({ lensActive }: { lensActive: boolean }) {
  return (
    <section className="rounded-lg border border-rule bg-paper-2 p-4 shadow-[var(--shadow-1)]">
      <div className="flex items-center gap-3 text-sm text-ink-3">
        <span className="h-2.5 w-2.5 animate-pulse rounded-full bg-primary" />
        <span>
          Contacting AI{lensActive ? " with the selected lens stack" : ""}. This can take a few
          seconds.
        </span>
      </div>
    </section>
  );
}

function OriginalPreview({
  recipe,
  ingredients,
}: {
  recipe: { description?: string | null; directionsText?: string | null; notes?: string | null };
  ingredients: string[];
}) {
  return (
    <section className="rounded-lg border border-dashed border-rule bg-paper-2 p-5">
      <p className="ps-mono text-xs font-semibold uppercase text-ink-3">Original recipe</p>
      <div className="mt-3 grid gap-4 lg:grid-cols-2">
        <div>
          <h2 className="text-sm font-semibold text-ink">Ingredients</h2>
          <ul className="mt-2 space-y-1 text-sm text-ink-3">
            {ingredients.slice(0, 8).map((ingredient, index) => (
              <li key={`${ingredient}-${index}`}>{ingredient}</li>
            ))}
          </ul>
        </div>
        <div>
          <h2 className="text-sm font-semibold text-ink">Directions</h2>
          <p className="mt-2 line-clamp-6 whitespace-pre-line text-sm leading-6 text-ink-3">
            {recipe.directionsText || recipe.description || recipe.notes || "No directions yet."}
          </p>
        </div>
      </div>
    </section>
  );
}

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
      <section className="rounded-lg border border-rule bg-paper-2 p-4">
        <p className="ps-mono text-xs font-semibold uppercase text-ink-3">{label} unchanged</p>
        <p className="mt-2 whitespace-pre-line text-sm leading-6 text-ink-2">
          {diff.original || "(empty)"}
        </p>
      </section>
    );
  }

  return (
    <section className="rounded-lg border border-rule bg-paper-2 p-4 shadow-[var(--shadow-1)]">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="ps-mono text-xs font-semibold uppercase text-ink-3">{label}</p>
        <Button type="button" size="sm" variant={accepted ? "primary" : "secondary"} onClick={onToggle}>
          {accepted ? "Accepted" : "Accept"}
        </Button>
      </div>
      <div className="mt-3 grid gap-3 md:grid-cols-2">
        <DiffPane title="Original" tone="old" value={diff.original} />
        <DiffPane title="Improved" tone="new" value={diff.improved} />
      </div>
    </section>
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
      <section className="rounded-lg border border-rule bg-paper-2 p-4">
        <p className="ps-mono text-xs font-semibold uppercase text-ink-3">Ingredients unchanged</p>
        <ul className="mt-2 space-y-1 text-sm text-ink-2">
          {diff.original.map((line, index) => (
            <li key={`${line}-${index}`}>{line}</li>
          ))}
        </ul>
      </section>
    );
  }

  return (
    <section className="rounded-lg border border-rule bg-paper-2 p-4 shadow-[var(--shadow-1)]">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="ps-mono text-xs font-semibold uppercase text-ink-3">Ingredients</p>
        <Button type="button" size="sm" variant={accepted ? "primary" : "secondary"} onClick={onToggle}>
          {accepted ? "Accepted" : "Accept"}
        </Button>
      </div>
      <div className="mt-3 grid gap-3 md:grid-cols-2">
        <IngredientDiffPane title="Original" tone="old" lines={diff.original} />
        <IngredientDiffPane title="Improved" tone="new" lines={diff.improved} />
      </div>
    </section>
  );
}

function DiffPane({ title, value, tone }: { title: string; value: string; tone: "old" | "new" }) {
  return (
    <div className="rounded-md border border-rule bg-paper p-3">
      <p className={`text-xs font-semibold ${tone === "old" ? "text-err" : "text-ok"}`}>{title}</p>
      <p
        className={`mt-2 whitespace-pre-line text-sm leading-6 ${
          tone === "old" ? "text-ink-4 line-through decoration-err/40" : "text-ink-2"
        }`}
      >
        {value || "(empty)"}
      </p>
    </div>
  );
}

function IngredientDiffPane({
  title,
  lines,
  tone,
}: {
  title: string;
  lines: string[];
  tone: "old" | "new";
}) {
  return (
    <div className="rounded-md border border-rule bg-paper p-3">
      <p className={`text-xs font-semibold ${tone === "old" ? "text-err" : "text-ok"}`}>{title}</p>
      <ul
        className={`mt-2 space-y-1 text-sm leading-6 ${
          tone === "old" ? "text-ink-4 line-through decoration-err/40" : "text-ink-2"
        }`}
      >
        {lines.map((line, index) => (
          <li key={`${line}-${index}`}>{line}</li>
        ))}
      </ul>
    </div>
  );
}

function DecisionPanel({
  lensActive,
  lensSummary,
  lensPrompt,
  finalTitle,
  finalIngredients,
  changedCount,
}: {
  lensActive: boolean;
  lensSummary: string;
  lensPrompt: string;
  finalTitle: string;
  finalIngredients: string[];
  changedCount: number;
}) {
  return (
    <section className="rounded-lg border border-rule bg-paper-2 p-4 shadow-[var(--shadow-1)]">
      <p className="ps-mono text-xs font-semibold uppercase text-ink-3">Decision preview</p>
      <h2 className="mt-2 text-lg font-semibold text-ink">{finalTitle}</h2>
      <p className="mt-1 text-sm text-ink-3">
        {changedCount > 0
          ? `${changedCount} changed field${changedCount === 1 ? "" : "s"} accepted`
          : "No generated changes accepted yet"}
      </p>
      <div className="mt-3 flex flex-wrap gap-1.5">
        <Chip selected={lensActive}>{lensSummary}</Chip>
        <Chip tone="neutral">{finalIngredients.length} ingredients</Chip>
      </div>
      {lensPrompt && (
        <p className="mt-3 rounded-md bg-paper p-3 text-xs leading-5 text-ink-3">{lensPrompt}</p>
      )}
    </section>
  );
}

type Variant = Route.ComponentProps["loaderData"]["variants"][number];

function VariantPanel({ variants }: { variants: Variant[] }) {
  return (
    <section className="rounded-lg border border-rule bg-paper-2 p-4 shadow-[var(--shadow-1)]">
      <h2 className="text-sm font-semibold text-ink">Saved variants</h2>
      <div className="mt-3 grid gap-2">
        {variants.map((variant) => (
          <Link
            key={variant.id}
            to={`/recipes/${variant.id}`}
            className="grid grid-cols-[minmax(0,1fr)_auto] gap-3 rounded-md border border-rule bg-paper p-3 hover:bg-paper-3"
          >
            <span className="truncate text-sm font-semibold text-ink">{variant.title}</span>
            <span className="text-xs text-ink-4">
              {variant.createdAt ? new Date(variant.createdAt).toLocaleDateString() : ""}
            </span>
          </Link>
        ))}
      </div>
    </section>
  );
}

function SaveModal({
  mode,
  fetcher,
  onClose,
  selectedProfile,
  recipeTitle,
  finalTitle,
  finalDescription,
  finalIngredients,
  finalDirections,
  finalNotes,
}: {
  mode: Exclude<SaveMode, null>;
  fetcher: ReturnType<typeof useFetcher>;
  onClose: () => void;
  selectedProfile: string;
  recipeTitle: string;
  finalTitle: string;
  finalDescription: string;
  finalIngredients: string[];
  finalDirections: string;
  finalNotes: string;
}) {
  const saving = fetcher.state !== "idle";
  const title = mode === "variant" ? "Save as variant" : "Replace original";
  const description =
    mode === "variant"
      ? `Create a separate recipe linked back to "${recipeTitle}".`
      : `Overwrite "${recipeTitle}" with the accepted fields. Existing variants remain linked.`;

  return (
    <ModalFrame title={title} description={description} role={mode === "replace" ? "alertdialog" : "dialog"}>
        <fetcher.Form method="post" className="mt-5 space-y-4">
          <input type="hidden" name="_intent" value={mode === "variant" ? "apply" : "replace"} />
          <input type="hidden" name="profileId" value={selectedProfile} />
          <input type="hidden" name="description" value={finalDescription} />
          <input type="hidden" name="ingredients" value={finalIngredients.join("\n")} />
          <input type="hidden" name="directions" value={finalDirections} />
          <input type="hidden" name="notes" value={finalNotes} />
          <label className="block space-y-2">
            <span className="text-sm font-medium text-ink">Recipe title</span>
            <input
              name="title"
              defaultValue={finalTitle}
              className="ps-control w-full border border-rule bg-paper-2 px-3 text-sm text-ink focus-visible:ps-focus-ring"
              required
            />
          </label>
          {mode === "replace" && (
            <p className="rounded-md border border-err/30 bg-err/10 p-3 text-xs leading-5 text-err">
              This changes the original recipe. Use Save as variant when you want a reversible copy.
            </p>
          )}
          <div className="flex flex-wrap justify-end gap-2">
            <Button type="button" variant="ghost" onClick={onClose} disabled={saving}>
              Cancel
            </Button>
            <Button type="submit" variant={mode === "replace" ? "danger" : "primary"} disabled={saving}>
              {saving ? "Saving..." : title}
            </Button>
          </div>
        </fetcher.Form>
    </ModalFrame>
  );
}
