/**
 * GET /api/imports/:id
 *
 * Returns the current status of an import job.
 */

import { and, desc, eq, inArray, sql } from "drizzle-orm";
import type { Route } from "./+types/api.imports.$id";
import { requireUser } from "~/lib/auth.server";
import { createDb, schema } from "~/db";
import {
  clampBulkApproveThreshold,
  type ImportReviewStatus,
} from "~/lib/import-review.server";

const REVIEW_STATUSES: ImportReviewStatus[] = [
  "pending",
  "approved",
  "edited",
  "skipped",
];

type ReviewActionPayload = {
  action?: "approve" | "edit" | "skip" | "undo" | "bulk-approve";
  itemIds?: string[];
  editedPayload?: unknown;
  reason?: string;
  threshold?: number;
};

export async function loader({ params, request, context }: Route.LoaderArgs): Promise<Response> {
  const user = await requireUser(request, context);
  const { id } = params;

  if (!id) return Response.json({ error: "Missing job id" }, { status: 400 });

  const { db } = createDb(context.cloudflare.env.DB);
  const [job] = await db
    .select()
    .from(schema.importJobs)
    .where(
      and(
        eq(schema.importJobs.id, id),
        eq(schema.importJobs.userId, user.id)
      )
    )
    .limit(1);

  if (!job) return Response.json({ error: "Job not found" }, { status: 404 });

  const reviewRows = await db
    .select({
      status: schema.importReviewItems.status,
      count: sql<number>`count(*)`,
    })
    .from(schema.importReviewItems)
    .where(eq(schema.importReviewItems.jobId, job.id))
    .groupBy(schema.importReviewItems.status);

  const reviewTabs = {
    all: 0,
    pending: 0,
    approved: 0,
    edited: 0,
    skipped: 0,
  };
  for (const row of reviewRows) {
    const count = Number(row.count);
    reviewTabs.all += count;
    reviewTabs[row.status] = count;
  }

  const url = new URL(request.url);
  const requestedTab = url.searchParams.get("reviewTab");
  const reviewTab = REVIEW_STATUSES.includes(requestedTab as ImportReviewStatus)
    ? (requestedTab as ImportReviewStatus)
    : null;

  const reviewItems = await db
    .select({
      id: schema.importReviewItems.id,
      recipeId: schema.importReviewItems.recipeId,
      sourceType: schema.importReviewItems.sourceType,
      sourceUid: schema.importReviewItems.sourceUid,
      title: schema.importReviewItems.title,
      status: schema.importReviewItems.status,
      confidenceScore: schema.importReviewItems.confidenceScore,
      confidenceLevel: schema.importReviewItems.confidenceLevel,
      parsedFieldSummary: schema.importReviewItems.parsedFieldSummary,
      decisionReason: schema.importReviewItems.decisionReason,
      reviewedAt: schema.importReviewItems.reviewedAt,
      updatedAt: schema.importReviewItems.updatedAt,
    })
    .from(schema.importReviewItems)
    .where(
      reviewTab
        ? and(
            eq(schema.importReviewItems.jobId, job.id),
            eq(schema.importReviewItems.status, reviewTab)
          )
        : eq(schema.importReviewItems.jobId, job.id)
    )
    .orderBy(
      desc(schema.importReviewItems.confidenceScore),
      desc(schema.importReviewItems.updatedAt)
    )
    .limit(100);

  return Response.json({
    id: job.id,
    status: job.status,
    sourceType: job.sourceType,
    recipeCountExpected: job.recipeCountExpected,
    recipeCountImported: job.recipeCountImported,
    startedAt: job.startedAt,
    completedAt: job.completedAt,
    errors: job.errorLogJson,
    reviewTabs,
    reviewItems,
  });
}

export async function action({ params, request, context }: Route.ActionArgs): Promise<Response> {
  if (request.method !== "PATCH") {
    return new Response("Method Not Allowed", { status: 405 });
  }

  const user = await requireUser(request, context);
  const { id } = params;
  if (!id) return Response.json({ error: "Missing job id" }, { status: 400 });

  const { db } = createDb(context.cloudflare.env.DB);
  const [job] = await db
    .select({ id: schema.importJobs.id })
    .from(schema.importJobs)
    .where(and(eq(schema.importJobs.id, id), eq(schema.importJobs.userId, user.id)))
    .limit(1);

  if (!job) return Response.json({ error: "Job not found" }, { status: 404 });

  let payload: ReviewActionPayload;
  try {
    payload = (await request.json()) as ReviewActionPayload;
  } catch {
    return Response.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const now = new Date();

  if (payload.action === "bulk-approve") {
    const threshold = clampBulkApproveThreshold(payload.threshold);
    const result = await db
      .update(schema.importReviewItems)
      .set({
        status: "approved",
        decisionReason: `Bulk approved at confidence >= ${threshold}`,
        reviewedAt: now,
        updatedAt: now,
      })
      .where(
        and(
          eq(schema.importReviewItems.jobId, job.id),
          eq(schema.importReviewItems.userId, user.id),
          eq(schema.importReviewItems.status, "pending"),
          sql`${schema.importReviewItems.confidenceScore} >= ${threshold}`
        )
      );

    return Response.json({
      ok: true,
      action: "bulk-approve",
      threshold,
      changed: result.meta.changes,
    });
  }

  if (!payload.action || !["approve", "edit", "skip", "undo"].includes(payload.action)) {
    return Response.json({ error: "Unsupported review action" }, { status: 400 });
  }

  const itemIds = Array.isArray(payload.itemIds)
    ? payload.itemIds.filter((itemId) => typeof itemId === "string" && itemId)
    : [];
  if (itemIds.length === 0) {
    return Response.json({ error: "No review items selected" }, { status: 400 });
  }

  const nextStatus: ImportReviewStatus =
    payload.action === "approve"
      ? "approved"
      : payload.action === "edit"
        ? "edited"
        : payload.action === "undo"
          ? "pending"
          : "skipped";

  const result = await db
    .update(schema.importReviewItems)
    .set({
      status: nextStatus,
      ...(payload.action === "edit"
        ? { editedPayloadJson: payload.editedPayload }
        : {}),
      decisionReason: payload.action === "undo" ? "Decision undone" : payload.reason ?? null,
      reviewedAt: payload.action === "undo" ? null : now,
      updatedAt: now,
    })
    .where(
      and(
        eq(schema.importReviewItems.jobId, job.id),
        eq(schema.importReviewItems.userId, user.id),
        inArray(schema.importReviewItems.id, itemIds)
      )
    );

  return Response.json({
    ok: true,
    action: payload.action,
    status: nextStatus,
    changed: result.meta.changes,
  });
}
