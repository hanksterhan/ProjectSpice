import { useEffect, useState } from "react";
import { getPendingLogs } from "~/lib/offline-db";
import { replayPendingLogs } from "~/lib/offline-log-sync";

type SyncState = {
  pending: number;
  failed: number;
  syncing: boolean;
  lastSynced: number;
};

export function OfflineLogSync() {
  const [state, setState] = useState<SyncState>({
    pending: 0,
    failed: 0,
    syncing: false,
    lastSynced: 0,
  });

  useEffect(() => {
    let cancelled = false;

    async function refresh() {
      const logs = await getPendingLogs();
      if (cancelled) return;
      setState((current) => ({
        ...current,
        pending: logs.length,
        failed: logs.filter((log) => log.status === "failed").length,
      }));
    }

    async function sync() {
      if (!navigator.onLine) {
        await refresh();
        return;
      }
      setState((current) => ({ ...current, syncing: true }));
      await replayPendingLogs().catch(() => undefined);
      if (cancelled) return;
      const logs = await getPendingLogs();
      if (cancelled) return;
      setState({
        pending: logs.length,
        failed: logs.filter((log) => log.status === "failed").length,
        syncing: false,
        lastSynced: Date.now(),
      });
    }

    refresh().catch(() => undefined);
    sync().catch(() => undefined);

    window.addEventListener("online", sync);
    window.addEventListener("projectspice:offline-log-queued", refresh);

    return () => {
      cancelled = true;
      window.removeEventListener("online", sync);
      window.removeEventListener("projectspice:offline-log-queued", refresh);
    };
  }, []);

  if (state.pending === 0 && state.lastSynced === 0) return null;

  const message = state.syncing
    ? `Syncing ${state.pending} cooking log${state.pending === 1 ? "" : "s"}...`
    : state.pending > 0
      ? `${state.pending} cooking log${state.pending === 1 ? "" : "s"} pending${state.failed > 0 ? `, ${state.failed} failed` : ""}`
      : "Cooking logs synced";

  return (
    <div className="fixed bottom-3 left-3 z-50 rounded-md bg-stone-900 text-white px-3 py-2 text-xs shadow-lg">
      {message}
    </div>
  );
}
