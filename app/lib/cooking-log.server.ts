import { and, eq, isNull, or } from "drizzle-orm";
import { schema } from "~/db";
import type { createDb } from "~/db";
import { FAMILY_RECIPE_VISIBILITY } from "~/lib/family-sharing";

type Db = ReturnType<typeof createDb>["db"];

export type CookingLogPayload = {
  clientRequestId?: string | null;
  recipeId?: string | null;
  cookedAt?: string | null;
  rating?: string | number | null;
  notes?: string | null;
  modifications?: string | null;
};

export type CookingLogResult =
  | { ok: true; logId: string; status: "created" | "existing" }
  | { ok: false; status: number; error: string };

function textOrNull(value: string | null | undefined): string | null {
  const trimmed = value?.trim();
  return trimmed || null;
}

function parseOptionalRating(value: string | number | null | undefined): number | null {
  if (value === null || value === undefined || value === "") return null;
  const parsed = typeof value === "number" ? value : parseInt(value, 10);
  return Number.isFinite(parsed) ? parsed : NaN;
}

function isValidClientRequestId(id: string): boolean {
  return /^[a-zA-Z0-9_-]{8,128}$/.test(id);
}

export async function createCookingLog(
  db: Db,
  userId: string,
  payload: CookingLogPayload
): Promise<CookingLogResult> {
  const recipeId = textOrNull(payload.recipeId ?? null);
  const cookedAtRaw = textOrNull(payload.cookedAt ?? null);
  const notes = textOrNull(payload.notes ?? null);
  const modifications = textOrNull(payload.modifications ?? null);
  const rating = parseOptionalRating(payload.rating);
  const clientRequestId = textOrNull(payload.clientRequestId ?? null);

  if (!cookedAtRaw) {
    return { ok: false, status: 400, error: "Date is required" };
  }

  const cookedAt = new Date(cookedAtRaw);
  if (isNaN(cookedAt.getTime())) {
    return { ok: false, status: 400, error: "Invalid date" };
  }

  if (rating !== null && (Number.isNaN(rating) || rating < 1 || rating > 5)) {
    return { ok: false, status: 400, error: "Rating must be 1-5" };
  }

  const logId =
    clientRequestId && isValidClientRequestId(clientRequestId)
      ? clientRequestId
      : crypto.randomUUID();

  const [existing] = await db
    .select({ id: schema.cookingLog.id })
    .from(schema.cookingLog)
    .where(
      and(
        eq(schema.cookingLog.id, logId),
        eq(schema.cookingLog.userId, userId)
      )
    )
    .limit(1);

  if (existing) {
    return { ok: true, logId: existing.id, status: "existing" };
  }

  if (recipeId) {
    const [recipe] = await db
      .select({ id: schema.recipes.id })
      .from(schema.recipes)
      .where(
        and(
          eq(schema.recipes.id, recipeId),
          or(
            eq(schema.recipes.userId, userId),
            eq(schema.recipes.visibility, FAMILY_RECIPE_VISIBILITY)
          ),
          isNull(schema.recipes.deletedAt)
        )
      )
      .limit(1);
    if (!recipe) return { ok: false, status: 404, error: "Recipe not found" };
  }

  await db.insert(schema.cookingLog).values({
    id: logId,
    userId,
    recipeId,
    cookedAt,
    rating,
    notes,
    modifications,
  });

  return { ok: true, logId, status: "created" };
}
