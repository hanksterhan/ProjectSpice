import { data, Form, Link, redirect } from "react-router";
import { useState } from "react";
import { and, eq, isNull } from "drizzle-orm";
import type { Route } from "./+types/logs.new";
import { requireUser } from "~/lib/auth.server";
import { createDb, schema } from "~/db";

export function meta() {
  return [{ title: "Log a Cook — ProjectSpice" }];
}

export async function loader({ request, context }: Route.LoaderArgs) {
  const user = await requireUser(request, context);
  const url = new URL(request.url);
  const recipeId = url.searchParams.get("recipeId");

  if (!recipeId) return { recipe: null };

  const { db } = createDb(context.cloudflare.env.DB);
  const [recipe] = await db
    .select({ id: schema.recipes.id, title: schema.recipes.title })
    .from(schema.recipes)
    .where(
      and(
        eq(schema.recipes.id, recipeId),
        eq(schema.recipes.userId, user.id),
        isNull(schema.recipes.deletedAt)
      )
    )
    .limit(1);

  return { recipe: recipe ?? null };
}

export async function action({ request, context }: Route.ActionArgs) {
  const user = await requireUser(request, context);
  const fd = await request.formData();

  const recipeId = String(fd.get("recipeId") ?? "").trim() || null;
  const cookedAtRaw = String(fd.get("cookedAt") ?? "").trim();
  const ratingRaw = String(fd.get("rating") ?? "").trim();
  const notes = String(fd.get("notes") ?? "").trim() || null;
  const modifications = String(fd.get("modifications") ?? "").trim() || null;

  if (!cookedAtRaw) {
    return data({ error: "Date is required" }, { status: 400 });
  }

  const cookedAt = new Date(cookedAtRaw);
  if (isNaN(cookedAt.getTime())) {
    return data({ error: "Invalid date" }, { status: 400 });
  }

  const rating = ratingRaw ? parseInt(ratingRaw, 10) : null;
  if (rating !== null && (rating < 1 || rating > 5)) {
    return data({ error: "Rating must be 1–5" }, { status: 400 });
  }

  const { db } = createDb(context.cloudflare.env.DB);

  if (recipeId) {
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
    if (!recipe) throw data(null, { status: 404 });
  }

  const logId = crypto.randomUUID();

  await db.insert(schema.cookingLog).values({
    id: logId,
    userId: user.id,
    recipeId,
    cookedAt,
    rating,
    notes,
    modifications,
  });

  throw redirect(`/logs/${logId}`);
}

const INPUT =
  "w-full rounded-md border border-input bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring";
const LABEL = "text-sm font-medium";
const FIELD = "flex flex-col gap-1";

function todayLocalDate(): string {
  const d = new Date();
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export default function NewLog({ loaderData, actionData }: Route.ComponentProps) {
  const { recipe } = loaderData;
  const [rating, setRating] = useState(0);

  const backHref = recipe ? `/recipes/${recipe.id}` : "/recipes";
  const backLabel = recipe ? `← ${recipe.title}` : "← Recipes";

  return (
    <div className="min-h-screen bg-background">
      <header className="sticky top-0 z-10 bg-background/95 backdrop-blur border-b">
        <div className="max-w-2xl mx-auto px-4 h-14 flex items-center gap-3">
          <Link
            to={backHref}
            className="text-muted-foreground hover:text-foreground text-sm"
          >
            {backLabel}
          </Link>
          <span className="text-muted-foreground">/</span>
          <span className="font-medium text-sm">Log a Cook</span>
        </div>
      </header>

      <main className="max-w-2xl mx-auto px-4 py-6">
        <Form method="post" className="space-y-6">
          {recipe && (
            <input type="hidden" name="recipeId" value={recipe.id} />
          )}

          {actionData?.error && (
            <p className="text-sm text-red-500">{actionData.error}</p>
          )}

          {recipe ? (
            <p className="text-sm text-muted-foreground">
              Logging a cook for{" "}
              <span className="font-medium text-foreground">{recipe.title}</span>
            </p>
          ) : (
            <p className="text-sm text-muted-foreground">
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
                  className={`text-2xl leading-none transition-colors ${
                    star <= rating
                      ? "text-yellow-400"
                      : "text-muted-foreground/40 hover:text-yellow-300"
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
              className={`${INPUT} resize-y`}
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
              className={`${INPUT} resize-y`}
            />
          </div>

          <div className="flex gap-3 pt-2">
            <button
              type="submit"
              className="flex-1 rounded-md bg-primary text-primary-foreground px-4 py-2.5 text-sm font-medium hover:opacity-90 transition-opacity"
            >
              Save Log
            </button>
            <Link
              to={backHref}
              className="rounded-md border border-input px-4 py-2.5 text-sm font-medium hover:bg-muted transition-colors text-center"
            >
              Cancel
            </Link>
          </div>
        </Form>
      </main>
    </div>
  );
}
