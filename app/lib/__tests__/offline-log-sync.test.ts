import { beforeEach, describe, expect, it, vi } from "vitest";

const db = vi.hoisted(() => ({
  pending: [] as Array<{
    id: string;
    userId: string;
    recipeId: string | null;
    cookedAt: string;
    rating: string | number | null;
    notes: string | null;
    modifications: string | null;
    createdAt: number;
    status: "pending" | "syncing" | "failed";
    attempts: number;
    lastAttemptAt: number | null;
    lastError: string | null;
  }>,
}));

vi.mock("../offline-db", () => ({
  getPendingLogs: vi.fn(async () => db.pending),
  queueLog: vi.fn(async (entry) => {
    const queued = {
      ...entry,
      createdAt: 1,
      status: "pending" as const,
      attempts: 0,
      lastAttemptAt: null,
      lastError: null,
    };
    db.pending.push(queued);
    return queued;
  }),
  removePendingLog: vi.fn(async (id: string) => {
    db.pending = db.pending.filter((entry) => entry.id !== id);
  }),
  updatePendingLog: vi.fn(async (id: string, updates) => {
    db.pending = db.pending.map((entry) =>
      entry.id === id ? { ...entry, ...updates } : entry
    );
  }),
}));

import {
  queueLogDraft,
  replayPendingLogs,
  shouldQueueLogAfterFailure,
} from "../offline-log-sync";

describe("offline log sync", () => {
  beforeEach(() => {
    db.pending = [];
    vi.restoreAllMocks();
  });

  it("queues drafts with the client request id as the idempotency key", async () => {
    const queued = await queueLogDraft({
      clientRequestId: "log_12345678",
      recipeId: "recipe-1",
      cookedAt: "2026-04-27",
      rating: 5,
      notes: null,
      modifications: null,
    });

    expect(queued.id).toBe("log_12345678");
    expect(queued.status).toBe("pending");
  });

  it("removes a queued log after a successful replay", async () => {
    db.pending = [
      {
        id: "log_success",
        userId: "current",
        recipeId: "recipe-1",
        cookedAt: "2026-04-27",
        rating: 4,
        notes: null,
        modifications: null,
        createdAt: 1,
        status: "pending",
        attempts: 0,
        lastAttemptAt: null,
        lastError: null,
      },
    ];
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => Response.json({ logId: "log_success", status: "existing" }))
    );

    const summary = await replayPendingLogs();

    expect(summary).toEqual({ synced: 1, failed: 0, pending: 0 });
    expect(db.pending).toHaveLength(0);
  });

  it("marks failed replays without dropping the queued log", async () => {
    db.pending = [
      {
        id: "log_fail",
        userId: "current",
        recipeId: null,
        cookedAt: "2026-04-27",
        rating: null,
        notes: "Soup",
        modifications: null,
        createdAt: 1,
        status: "pending",
        attempts: 0,
        lastAttemptAt: null,
        lastError: null,
      },
    ];
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => Response.json({ error: "Nope" }, { status: 500 }))
    );

    const summary = await replayPendingLogs();

    expect(summary).toEqual({ synced: 0, failed: 1, pending: 1 });
    expect(db.pending[0].status).toBe("failed");
    expect(db.pending[0].attempts).toBe(1);
    expect(db.pending[0].lastError).toBe("Nope");
  });

  it("retries stale syncing entries", async () => {
    db.pending = [
      {
        id: "log_stale_sync",
        userId: "current",
        recipeId: null,
        cookedAt: "2026-04-27",
        rating: null,
        notes: null,
        modifications: null,
        createdAt: 1,
        status: "syncing",
        attempts: 1,
        lastAttemptAt: Date.now() - 60_000,
        lastError: null,
      },
    ];
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => Response.json({ logId: "log_stale_sync", status: "created" }))
    );

    const summary = await replayPendingLogs();

    expect(summary).toEqual({ synced: 1, failed: 0, pending: 0 });
  });

  it("only queues client submissions after network-style failures", () => {
    expect(shouldQueueLogAfterFailure(new TypeError("Failed to fetch"))).toBe(true);
    expect(shouldQueueLogAfterFailure(new Error("Recipe not found"))).toBe(false);
  });
});
