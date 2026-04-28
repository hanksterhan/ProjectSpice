import { useEffect, useState } from "react";
import { FeedbackToast } from "~/components/ui";

export function OfflineIndicator() {
  const [offline, setOffline] = useState(false);

  useEffect(() => {
    setOffline(!navigator.onLine);
    const on = () => setOffline(false);
    const off = () => setOffline(true);
    window.addEventListener("online", on);
    window.addEventListener("offline", off);
    return () => {
      window.removeEventListener("online", on);
      window.removeEventListener("offline", off);
    };
  }, []);

  if (!offline) return null;

  return (
    <FeedbackToast tone="warning" className="pointer-events-none fixed left-1/2 top-3 z-50 -translate-x-1/2">
      Offline. Cached recipes are available.
    </FeedbackToast>
  );
}
