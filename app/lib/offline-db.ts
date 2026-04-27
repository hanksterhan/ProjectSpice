import { openDB } from "idb";

const DB_NAME = "projectspice-offline";
const DB_VERSION = 2;

export interface CachedRecipeEntry {
  id: string;
  userId: string;
  cachedAt: number;
  recipe: Record<string, unknown>;
  ingredients: unknown[];
  tags: string[];
  cookCount: number;
}

export interface PendingLogEntry {
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
}

function getDb() {
  return openDB(DB_NAME, DB_VERSION, {
    upgrade(db) {
      if (!db.objectStoreNames.contains("recipes")) {
        const s = db.createObjectStore("recipes", { keyPath: "id" });
        s.createIndex("userId", "userId", { unique: false });
        s.createIndex("cachedAt", "cachedAt", { unique: false });
      }
      if (!db.objectStoreNames.contains("sync-queue")) {
        db.createObjectStore("sync-queue", { keyPath: "id" });
      }
    },
  });
}

export async function cacheRecipe(
  entry: Omit<CachedRecipeEntry, "cachedAt">
): Promise<void> {
  const db = await getDb();
  await db.put("recipes", { ...entry, cachedAt: Date.now() });
  const all = await db.getAllFromIndex("recipes", "userId", entry.userId);
  if (all.length > 20) {
    all.sort((a, b) => a.cachedAt - b.cachedAt);
    for (const old of all.slice(0, all.length - 20)) {
      await db.delete("recipes", old.id);
    }
  }
}

export async function getCachedRecipes(
  userId: string
): Promise<CachedRecipeEntry[]> {
  const db = await getDb();
  return db.getAllFromIndex("recipes", "userId", userId);
}

export async function queueLog(
  entry: Omit<
    PendingLogEntry,
    "createdAt" | "status" | "attempts" | "lastAttemptAt" | "lastError"
  >
): Promise<PendingLogEntry> {
  const db = await getDb();
  const queued: PendingLogEntry = {
    ...entry,
    id: entry.id,
    createdAt: Date.now(),
    status: "pending",
    attempts: 0,
    lastAttemptAt: null,
    lastError: null,
  };
  await db.put("sync-queue", queued);
  return queued;
}

export async function getPendingLogs(): Promise<PendingLogEntry[]> {
  const db = await getDb();
  return db.getAll("sync-queue");
}

export async function removePendingLog(id: string): Promise<void> {
  const db = await getDb();
  await db.delete("sync-queue", id);
}

export async function updatePendingLog(
  id: string,
  updates: Partial<Omit<PendingLogEntry, "id">>
): Promise<void> {
  const db = await getDb();
  const existing = await db.get("sync-queue", id);
  if (!existing) return;
  await db.put("sync-queue", { ...existing, ...updates });
}

export async function clearUserRecipeCache(userId: string): Promise<void> {
  const db = await getDb();
  const all = await db.getAllFromIndex("recipes", "userId", userId);
  for (const entry of all) {
    await db.delete("recipes", entry.id);
  }
}
