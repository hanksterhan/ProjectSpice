import { useEffect, useId, useRef, useState } from "react";
import { MonitorCheck } from "lucide-react";

const SCREEN_WAKE_LOCK_STORAGE_KEY = "project-spice:screen-wake-lock-enabled";

type WakeLockStatus = "off" | "requesting" | "active" | "error";

type ScreenWakeLockToggleProps = {
  active?: boolean;
  className?: string;
};

type ScreenWakeLockStatusLabelInput = {
  enabled: boolean;
  isActivePage: boolean;
  isSupported: boolean;
  status: WakeLockStatus;
};

export function ScreenWakeLockToggle({
  active = true,
  className = "",
}: ScreenWakeLockToggleProps) {
  const statusId = useId();
  const wakeLockRef = useRef<WakeLockSentinel | null>(null);
  const [isReady, setIsReady] = useState(false);
  const [isSupported, setIsSupported] = useState(true);
  const [enabled, setEnabled] = useState(false);
  const [status, setStatus] = useState<WakeLockStatus>("off");
  const statusLabel = getScreenWakeLockStatusLabel({
    enabled,
    isActivePage: active,
    isSupported,
    status,
  });

  useEffect(() => {
    setIsSupported(canUseScreenWakeLock());
    setEnabled(readStoredScreenWakeLockPreference());
    setIsReady(true);
  }, []);

  useEffect(() => {
    if (!isReady) {
      return;
    }

    let isCurrent = true;

    async function releaseWakeLock() {
      const wakeLock = wakeLockRef.current;

      wakeLockRef.current = null;

      if (wakeLock && !wakeLock.released) {
        await wakeLock.release().catch(() => undefined);
      }
    }

    async function requestWakeLock() {
      if (
        !enabled ||
        !active ||
        !isSupported ||
        typeof document === "undefined" ||
        document.visibilityState !== "visible"
      ) {
        return;
      }

      setStatus("requesting");

      try {
        const wakeLock = await navigator.wakeLock.request("screen");

        if (!isCurrent) {
          await wakeLock.release().catch(() => undefined);
          return;
        }

        wakeLockRef.current = wakeLock;
        setStatus("active");

        wakeLock.addEventListener(
          "release",
          () => {
            if (wakeLockRef.current === wakeLock) {
              wakeLockRef.current = null;
            }

            if (isCurrent) {
              setStatus("off");
            }
          },
          { once: true },
        );
      } catch {
        if (isCurrent) {
          setStatus("error");
        }
      }
    }

    function handleVisibilityChange() {
      if (
        document.visibilityState === "visible" &&
        enabled &&
        active &&
        isSupported &&
        !wakeLockRef.current
      ) {
        void requestWakeLock();
      }
    }

    if (!enabled || !active || !isSupported) {
      setStatus("off");
      void releaseWakeLock();
      return () => {
        isCurrent = false;
      };
    }

    void requestWakeLock();
    document.addEventListener("visibilitychange", handleVisibilityChange);

    return () => {
      isCurrent = false;
      document.removeEventListener("visibilitychange", handleVisibilityChange);
      void releaseWakeLock();
    };
  }, [active, enabled, isReady, isSupported]);

  function handleChange(nextEnabled: boolean) {
    setEnabled(nextEnabled);
    setStatus(nextEnabled ? "requesting" : "off");
    writeStoredScreenWakeLockPreference(nextEnabled);
  }

  return (
    <label
      className={[
        "settings-switch",
        "screen-wake-lock-toggle",
        enabled && isSupported ? "active" : "",
        isReady && !isSupported ? "unavailable" : "",
        className,
      ]
        .filter(Boolean)
        .join(" ")}
      title={
        isSupported
          ? "Keep the screen awake while viewing or cooking recipes"
          : "Screen wake lock is unavailable"
      }
    >
      <input
        aria-describedby={statusId}
        checked={enabled && isSupported}
        disabled={isReady && !isSupported}
        onChange={(event) => handleChange(event.currentTarget.checked)}
        type="checkbox"
      />
      <span className="settings-switch-visual" aria-hidden="true" />
      <span className="settings-switch-label screen-wake-lock-label">
        <MonitorCheck aria-hidden="true" size={16} strokeWidth={2.4} />
        <span>Keep screen awake</span>
        <small className="sr-only" id={statusId}>
          {statusLabel}
        </small>
      </span>
    </label>
  );
}

export function getScreenWakeLockStatusLabel({
  enabled,
  isActivePage,
  isSupported,
  status,
}: ScreenWakeLockStatusLabelInput): string {
  if (!isSupported) {
    return "Unavailable";
  }

  if (!enabled) {
    return "Off";
  }

  if (!isActivePage) {
    return "Recipe pages only";
  }

  if (status === "active") {
    return "Active";
  }

  if (status === "error") {
    return "Blocked";
  }

  return "Starting";
}

function canUseScreenWakeLock(): boolean {
  return typeof navigator !== "undefined" && "wakeLock" in navigator;
}

function readStoredScreenWakeLockPreference(): boolean {
  if (typeof window === "undefined") {
    return false;
  }

  try {
    return window.localStorage.getItem(SCREEN_WAKE_LOCK_STORAGE_KEY) === "true";
  } catch {
    return false;
  }
}

function writeStoredScreenWakeLockPreference(enabled: boolean) {
  if (typeof window === "undefined") {
    return;
  }

  try {
    window.localStorage.setItem(
      SCREEN_WAKE_LOCK_STORAGE_KEY,
      enabled ? "true" : "false",
    );
  } catch {
    // localStorage may be unavailable in private or constrained contexts.
  }
}
