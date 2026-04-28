import { Form, Link, redirect, useNavigate } from "react-router";
import { useEffect, useState } from "react";
import { and, eq, isNull, or } from "drizzle-orm";
import type { Route } from "./+types/logs.new";
import { requireUser } from "~/lib/auth.server";
import { createDb, schema } from "~/db";
import { createCookingLog } from "~/lib/cooking-log.server";
import { FAMILY_RECIPE_VISIBILITY } from "~/lib/family-sharing";
import {
  createLogClientId,
  queueLogDraft,
  shouldQueueLogAfterFailure,
  submitLogDraft,
  type LogDraft,
} from "~/lib/offline-log-sync";
import { AppShell } from "~/components/app-shell";
import { Button, Chip, SectionHeader } from "~/components/ui";

export function meta() {
  return [{ title: "Log a Cook — ProjectSpice" }];
}

export async function loader({ request, context }: Route.LoaderArgs) {
  const user = await requireUser(request, context);
  const url = new URL(request.url);
  const recipeId = url.searchParams.get("recipeId");

  if (!recipeId) return { user, recipe: null };

  const { db } = createDb(context.cloudflare.env.DB);
  const [recipe] = await db
    .select({ id: schema.recipes.id, title: schema.recipes.title })
    .from(schema.recipes)
    .where(
      and(
        eq(schema.recipes.id, recipeId),
        or(
          eq(schema.recipes.userId, user.id),
          eq(schema.recipes.visibility, FAMILY_RECIPE_VISIBILITY)
        ),
        isNull(schema.recipes.deletedAt)
      )
    )
    .limit(1);

  return { user, recipe: recipe ?? null };
}

export async function action({ request, context }: Route.ActionArgs) {
  const user = await requireUser(request, context);
  const fd = await request.formData();
  const { db } = createDb(context.cloudflare.env.DB);
  const result = await createCookingLog(db, user.id, {
    clientRequestId: String(fd.get("clientRequestId") ?? "").trim() || null,
    recipeId: String(fd.get("recipeId") ?? "").trim() || null,
    cookedAt: String(fd.get("cookedAt") ?? "").trim(),
    rating: String(fd.get("rating") ?? "").trim(),
    notes: String(fd.get("notes") ?? "").trim() || null,
    modifications: String(fd.get("modifications") ?? "").trim() || null,
  });

  if (!result.ok) {
    return { error: result.error };
  }

  throw redirect(`/logs/${result.logId}`);
}

const INPUT =
  "ps-control w-full border border-rule bg-paper px-3 text-sm text-ink placeholder:text-ink-4 focus-visible:ps-focus-ring";
const LABEL = "text-sm font-medium text-ink";
const FIELD = "flex flex-col gap-1";

function todayLocalDate(): string {
  const d = new Date();
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export default function NewLog({ loaderData, actionData }: Route.ComponentProps) {
  const { user, recipe } = loaderData;
  const navigate = useNavigate();
  const [rating, setRating] = useState(0);
  const [clientRequestId, setClientRequestId] = useState("");
  const [offlineStatus, setOfflineStatus] = useState<string | null>(null);

  const backHref = recipe ? `/recipes/${recipe.id}` : "/recipes";
  const backLabel = recipe ? recipe.title : "Recipes";

  useEffect(() => {
    setClientRequestId(createLogClientId());
  }, []);

  return (
    <AppShell user={user}>
      <div className="mx-auto max-w-2xl space-y-6">
        <SectionHeader
          eyebrow="Cooking memory"
          title="Log a Cook"
          description={
            recipe
              ? `Record what happened when you cooked ${recipe.title}.`
              : "Record a free-form cooking session without linking it to a recipe."
          }
          actions={
            <Link to={backHref} className="ps-control inline-flex items-center justify-center border border-rule bg-paper-2 px-4 text-sm font-medium text-ink hover:bg-paper-3 focus-visible:ps-focus-ring">
              {backLabel}
            </Link>
          }
        />

        <Form
          method="post"
          className="ps-surface space-y-6 p-5"
          onSubmit={async (event) => {
            const form = event.currentTarget;
            event.preventDefault();
            const fd = new FormData(form);
            const id = String(fd.get("clientRequestId") ?? "").trim() || createLogClientId();
            if (!clientRequestId) setClientRequestId(id);
            const draft: LogDraft = {
              clientRequestId: id,
              recipeId: String(fd.get("recipeId") ?? "").trim() || null,
              cookedAt: String(fd.get("cookedAt") ?? "").trim(),
              rating: String(fd.get("rating") ?? "").trim() || null,
              notes: String(fd.get("notes") ?? "").trim() || null,
              modifications: String(fd.get("modifications") ?? "").trim() || null,
            };

            if (!draft.cookedAt) {
              setOfflineStatus("Date is required.");
              return;
            }

            try {
              if (navigator.onLine) {
                const result = await submitLogDraft(draft);
                navigate(`/logs/${result.logId}`);
                return;
              }
              throw new Error("offline");
            } catch (err) {
              if (!shouldQueueLogAfterFailure(err)) {
                setOfflineStatus(err instanceof Error ? err.message : "Could not save log.");
                return;
              }
              try {
                await queueLogDraft(draft);
                window.dispatchEvent(new Event("projectspice:offline-log-queued"));
                setOfflineStatus("Saved offline. It will sync when you reconnect.");
                setTimeout(() => navigate(recipe ? `/recipes/${recipe.id}` : "/recipes"), 900);
              } catch {
                setOfflineStatus(err instanceof Error ? err.message : "Could not save offline.");
              }
            }
          }}
        >
          <input type="hidden" name="clientRequestId" value={clientRequestId} />
          {recipe && (
            <input type="hidden" name="recipeId" value={recipe.id} />
          )}

          {actionData?.error && (
            <p className="rounded-md border border-err/30 bg-err/10 px-3 py-2 text-sm text-err">{actionData.error}</p>
          )}
          {offlineStatus && (
            <p className="rounded-md border border-warn/30 bg-warn/10 px-3 py-2 text-sm text-warn">{offlineStatus}</p>
          )}

          {recipe ? (
            <p className="flex flex-wrap items-center gap-2 text-sm text-ink-3">
              Logging a cook for{" "}
              <Chip>{recipe.title}</Chip>
            </p>
          ) : (
            <p className="text-sm text-ink-3">
              Recording a free-form cooking session (no specific recipe).
            </p>
          )}

          <div className={FIELD}>
            <label htmlFor="cookedAt" className={LABEL}>
              Date cooked
            </label>
            <input
              id="cookedAt"
              name="cookedAt"
              type="date"
              defaultValue={todayLocalDate()}
              required
              className={INPUT}
            />
          </div>

          <div className={FIELD}>
            <span className={LABEL}>Rating (optional)</span>
            <div className="flex gap-2" role="group" aria-label="Star rating">
              {[1, 2, 3, 4, 5].map((star) => (
                <button
                  key={star}
                  type="button"
                  onClick={() => setRating(rating === star ? 0 : star)}
                  className={`text-2xl leading-none transition-colors focus-visible:ps-focus-ring ${
                    star <= rating
                      ? "text-warn"
                      : "text-ink-4/40 hover:text-warn/70"
                  }`}
                  aria-label={`${star} star${star > 1 ? "s" : ""}`}
                  aria-pressed={star <= rating}
                >
                  ★
                </button>
              ))}
            </div>
            <input type="hidden" name="rating" value={rating > 0 ? rating : ""} />
          </div>

          <div className={FIELD}>
            <label htmlFor="notes" className={LABEL}>
              Notes (optional)
            </label>
            <textarea
              id="notes"
              name="notes"
              rows={3}
              placeholder="How did it turn out?"
              className={`${INPUT} min-h-28 resize-y py-2`}
            />
          </div>

          <div className={FIELD}>
            <label htmlFor="modifications" className={LABEL}>
              Modifications (optional)
            </label>
            <textarea
              id="modifications"
              name="modifications"
              rows={3}
              placeholder="What did you change or substitute?"
              className={`${INPUT} min-h-28 resize-y py-2`}
            />
          </div>

          <div className="flex flex-col gap-3 pt-2 sm:flex-row">
            <Button type="submit" variant="primary" className="flex-1">
              Save Log
            </Button>
            <Link
              to={backHref}
              className="ps-control inline-flex items-center justify-center border border-rule bg-paper-2 px-4 text-sm font-medium text-ink hover:bg-paper-3 focus-visible:ps-focus-ring"
            >
              Cancel
            </Link>
          </div>
        </Form>
      </div>
    </AppShell>
  );
}
