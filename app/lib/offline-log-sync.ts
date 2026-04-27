import {
  getPendingLogs,
  queueLog,
  removePendingLog,
  updatePendingLog,
  type PendingLogEntry,
} from "./offline-db";

export type LogDraft = {
  clientRequestId: string;
  userId?: string | null;
  recipeId: string | null;
  cookedAt: string;
  rating: string | number | null;
  notes: string | null;
  modifications: string | null;
};

export type ReplaySummary = {
  synced: number;
  failed: number;
  pending: number;
};

export function createLogClientId(): string {
  return `log_${crypto.randomUUID()}`;
}

export async function submitLogDraft(
  draft: LogDraft
): Promise<{ logId: string; status: "created" | "existing" }> {
  const response = await fetch("/api/logs", {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(draft),
  });

  if (!response.ok) {
    let message = "Could not save cooking log";
    try {
      const body = (await response.json()) as { error?: string };
      message = body.error ?? message;
    } catch {
      // Response body is best-effort only.
    }
    throw new Error(message);
  }

  return (await response.json()) as { logId: string; status: "created" | "existing" };
}

export function shouldQueueLogAfterFailure(error: unknown): boolean {
  if (
    typeof navigator !== "undefined" &&
    typeof navigator.onLine === "boolean" &&
    !navigator.onLine
  ) {
    return true;
  }
  return error instanceof TypeError;
}

export async function queueLogDraft(draft: LogDraft): Promise<PendingLogEntry> {
  return queueLog({
    id: draft.clientRequestId,
    userId: draft.userId ?? "current",
    recipeId: draft.recipeId,
    cookedAt: draft.cookedAt,
    rating: draft.rating,
    notes: draft.notes,
    modifications: draft.modifications,
  });
}

export async function replayPendingLogs(): Promise<ReplaySummary> {
  const queued = (await getPendingLogs()).sort((a, b) => a.createdAt - b.createdAt);
  let synced = 0;
  let failed = 0;
  const staleSyncCutoff = Date.now() - 30_000;

  for (const entry of queued) {
    if (
      entry.status === "syncing" &&
      entry.lastAttemptAt !== null &&
      entry.lastAttemptAt > staleSyncCutoff
    ) {
      continue;
    }
    await updatePendingLog(entry.id, {
      status: "syncing",
      attempts: entry.attempts + 1,
      lastAttemptAt: Date.now(),
      lastError: null,
    });

    try {
      await submitLogDraft({
        clientRequestId: entry.id,
        recipeId: entry.recipeId,
        cookedAt: entry.cookedAt,
        rating: entry.rating,
        notes: entry.notes,
        modifications: entry.modifications,
      });
      await removePendingLog(entry.id);
      synced++;
    } catch (err) {
      await updatePendingLog(entry.id, {
        status: "failed",
        lastError: err instanceof Error ? err.message : "Sync failed",
      });
      failed++;
    }
  }

  const remaining = await getPendingLogs();
  return { synced, failed, pending: remaining.length };
}
