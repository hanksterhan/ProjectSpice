import { data, Link, useFetcher, useNavigate } from "react-router";
import { useCallback, useEffect, useRef, useState } from "react";
import { and, asc, eq, isNull } from "drizzle-orm";
import type { Route } from "./+types/recipes.$id.cook";
import { requireUser } from "~/lib/auth.server";
import { createDb, schema } from "~/db";

export function meta({ data: d }: Route.MetaArgs) {
  const title = d?.recipe?.title ?? "Recipe";
  return [{ title: `Cook: ${title} — ProjectSpice` }];
}

export async function loader({ params, request, context }: Route.LoaderArgs) {
  const user = await requireUser(request, context);
  const { db } = createDb(context.cloudflare.env.DB);

  const [recipeRows, ingredients] = await Promise.all([
    db
      .select()
      .from(schema.recipes)
      .where(
        and(
          eq(schema.recipes.id, params.id),
          eq(schema.recipes.userId, user.id),
          isNull(schema.recipes.deletedAt)
        )
      )
      .limit(1),
    db
      .select()
      .from(schema.ingredients)
      .where(eq(schema.ingredients.recipeId, params.id))
      .orderBy(asc(schema.ingredients.sortOrder)),
  ]);

  const recipe = recipeRows[0];
  if (!recipe) throw data(null, { status: 404 });

  return { recipe, ingredients };
}

const FRACTIONS: [number, string][] = [
  [1 / 8, "⅛"], [1 / 4, "¼"], [1 / 3, "⅓"], [3 / 8, "⅜"],
  [1 / 2, "½"], [5 / 8, "⅝"], [2 / 3, "⅔"], [3 / 4, "¾"], [7 / 8, "⅞"],
];

function formatQty(qty: number): string {
  if (qty <= 0) return "";
  const whole = Math.floor(qty);
  const frac = qty - whole;
  const EPS = 0.04;
  for (const [val, sym] of FRACTIONS) {
    if (Math.abs(frac - val) < EPS) {
      return whole > 0 ? `${whole}\u202f${sym}` : sym;
    }
  }
  if (frac < EPS) return String(whole);
  return qty.toFixed(2).replace(/\.?0+$/, "");
}

type Timer = {
  id: string;
  label: string;
  totalMs: number;
  remainingMs: number;
  running: boolean;
  firedAt: number | null;
};

const TEXT_SIZES = ["sm", "md", "lg", "xl"] as const;
type TextSize = (typeof TEXT_SIZES)[number];

const STEP_TEXT_CLASS: Record<TextSize, string> = {
  sm: "text-lg leading-relaxed",
  md: "text-2xl leading-relaxed",
  lg: "text-3xl leading-relaxed",
  xl: "text-4xl leading-snug",
};

function formatTimerDisplay(ms: number): string {
  const total = Math.max(0, Math.ceil(ms / 1000));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  const pad = (n: number) => n.toString().padStart(2, "0");
  return h > 0 ? `${h}:${pad(m)}:${pad(s)}` : `${m}:${pad(s)}`;
}

function beep() {
  try {
    const AC =
      (window as unknown as { AudioContext?: typeof AudioContext })
        .AudioContext ??
      (window as unknown as { webkitAudioContext?: typeof AudioContext })
        .webkitAudioContext;
    if (!AC) return;
    const ctx = new AC();
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.type = "sine";
    o.frequency.value = 880;
    g.gain.value = 0.2;
    o.connect(g);
    g.connect(ctx.destination);
    o.start();
    o.stop(ctx.currentTime + 0.6);
    setTimeout(() => ctx.close().catch(() => {}), 1000);
  } catch {
    // sound is best-effort
  }
}

export default function CookingMode({ loaderData }: Route.ComponentProps) {
  const { recipe, ingredients } = loaderData;
  const navigate = useNavigate();

  const directions = recipe.directionsText
    .split(/\n\n+/)
    .flatMap((block: string) => block.split(/\n/))
    .map((s: string) => s.replace(/^\d+\.\s*/, "").trim())
    .filter(Boolean);

  const [stepIdx, setStepIdx] = useState(0);
  const [checkedIngs, setCheckedIngs] = useState<Set<string>>(new Set());
  const [miseOpen, setMiseOpen] = useState(true);
  const [textSize, setTextSize] = useState<TextSize>("lg");
  const [timers, setTimers] = useState<Timer[]>([]);
  const [showTimerForm, setShowTimerForm] = useState(false);
  const [showExitDialog, setShowExitDialog] = useState(false);
  const [showQuickLog, setShowQuickLog] = useState(false);
  const [wakeLockActive, setWakeLockActive] = useState(false);

  const totalSteps = directions.length;
  const canPrev = stepIdx > 0;
  const canNext = stepIdx < totalSteps - 1;

  const goPrev = useCallback(() => {
    setStepIdx((i) => Math.max(0, i - 1));
  }, []);
  const goNext = useCallback(() => {
    setStepIdx((i) => Math.min(totalSteps - 1, i + 1));
  }, [totalSteps]);

  // --- Wake Lock ----------------------------------------------------------
  useEffect(() => {
    let sentinel: WakeLockSentinel | null = null;
    let cancelled = false;

    async function acquire() {
      try {
        const wl = (navigator as Navigator & {
          wakeLock?: { request: (type: "screen") => Promise<WakeLockSentinel> };
        }).wakeLock;
        if (!wl) return;
        sentinel = await wl.request("screen");
        if (cancelled) {
          await sentinel.release();
          return;
        }
        setWakeLockActive(true);
        sentinel.addEventListener("release", () => setWakeLockActive(false));
      } catch {
        // Permission denied or not supported — silently degrade
      }
    }
    acquire();

    function onVisibility() {
      if (document.visibilityState === "visible" && !sentinel) acquire();
    }
    document.addEventListener("visibilitychange", onVisibility);

    return () => {
      cancelled = true;
      document.removeEventListener("visibilitychange", onVisibility);
      if (sentinel) sentinel.release().catch(() => {});
    };
  }, []);

  // --- Timer tick ---------------------------------------------------------
  const lastTickRef = useRef<number>(Date.now());
  useEffect(() => {
    const id = window.setInterval(() => {
      const now = Date.now();
      const dt = now - lastTickRef.current;
      lastTickRef.current = now;
      setTimers((prev) => {
        let changed = false;
        const next = prev.map((t) => {
          if (!t.running) return t;
          const newRemaining = t.remainingMs - dt;
          if (newRemaining <= 0 && t.firedAt === null) {
            changed = true;
            beep();
            return { ...t, remainingMs: 0, running: false, firedAt: now };
          }
          if (newRemaining !== t.remainingMs) {
            changed = true;
            return { ...t, remainingMs: Math.max(0, newRemaining) };
          }
          return t;
        });
        return changed ? next : prev;
      });
    }, 250);
    return () => window.clearInterval(id);
  }, []);

  function addTimer(label: string, minutes: number, seconds: number) {
    const ms = (minutes * 60 + seconds) * 1000;
    if (ms <= 0) return;
    setTimers((prev) => [
      ...prev,
      {
        id: crypto.randomUUID(),
        label: label.trim() || `Timer ${prev.length + 1}`,
        totalMs: ms,
        remainingMs: ms,
        running: true,
        firedAt: null,
      },
    ]);
    setShowTimerForm(false);
  }

  function toggleTimer(id: string) {
    setTimers((prev) =>
      prev.map((t) => {
        if (t.id !== id) return t;
        if (t.remainingMs <= 0) {
          return { ...t, remainingMs: t.totalMs, running: true, firedAt: null };
        }
        return { ...t, running: !t.running };
      })
    );
  }

  function removeTimer(id: string) {
    setTimers((prev) => prev.filter((t) => t.id !== id));
  }

  const anyRunning = timers.some((t) => t.running);
  function pauseAll() {
    setTimers((prev) =>
      prev.map((t) =>
        t.remainingMs > 0 ? { ...t, running: anyRunning ? false : true } : t
      )
    );
  }

  // --- Keyboard nav -------------------------------------------------------
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (showExitDialog || showTimerForm || showQuickLog) return;
      const target = e.target as HTMLElement | null;
      if (target && (target.tagName === "INPUT" || target.tagName === "TEXTAREA")) return;

      if (e.key === "ArrowLeft") {
        e.preventDefault();
        goPrev();
      } else if (e.key === "ArrowRight") {
        e.preventDefault();
        goNext();
      } else if (e.key === " ") {
        e.preventDefault();
        pauseAll();
      } else if (e.key === "Escape") {
        e.preventDefault();
        setShowExitDialog(true);
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // pauseAll changes on every timer update; we intentionally capture the latest
    // via closure each effect run.
  }, [goPrev, goNext, showExitDialog, showTimerForm, showQuickLog, anyRunning]);  // eslint-disable-line react-hooks/exhaustive-deps

  // --- Swipe --------------------------------------------------------------
  const touchStartRef = useRef<{ x: number; y: number } | null>(null);
  function onTouchStart(e: React.TouchEvent<HTMLDivElement>) {
    const t = e.touches[0];
    touchStartRef.current = { x: t.clientX, y: t.clientY };
  }
  function onTouchEnd(e: React.TouchEvent<HTMLDivElement>) {
    const start = touchStartRef.current;
    touchStartRef.current = null;
    if (!start) return;
    const t = e.changedTouches[0];
    const dx = t.clientX - start.x;
    const dy = t.clientY - start.y;
    if (Math.abs(dx) < 60) return;
    if (Math.abs(dy) > Math.abs(dx)) return;
    if (dx < 0) goNext();
    else goPrev();
  }

  // --- Exit ---------------------------------------------------------------
  function requestExit() {
    if (anyRunning) {
      setShowExitDialog(true);
    } else {
      setShowQuickLog(true);
    }
  }
  function confirmExit() {
    setShowExitDialog(false);
    setShowQuickLog(true);
  }

  // --- Ingredient checklist -----------------------------------------------
  function toggleIng(id: string) {
    setCheckedIngs((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  // --- Tap zones ----------------------------------------------------------
  function onZoneClick(zone: "prev" | "next") {
    if (zone === "prev") goPrev();
    else goNext();
  }

  const currentStep = directions[stepIdx] ?? "";
  const nonGroupIngs = ingredients.filter((i) => !i.isGroupHeader);

  return (
    <div
      className="fixed inset-0 bg-background text-foreground flex flex-col overflow-hidden select-none"
      onTouchStart={onTouchStart}
      onTouchEnd={onTouchEnd}
    >
      {/* Header */}
      <header className="shrink-0 border-b px-4 h-12 flex items-center gap-3 bg-background/95 backdrop-blur z-20">
        <button
          type="button"
          onClick={requestExit}
          className="text-sm text-muted-foreground hover:text-foreground"
          aria-label="Exit cooking mode"
        >
          ✕ Exit
        </button>
        <div className="flex-1 text-sm font-medium truncate text-center">
          {recipe.title}
        </div>
        <div className="flex items-center gap-1.5">
          {wakeLockActive && (
            <span
              className="text-[10px] text-muted-foreground"
              title="Screen will stay on"
            >
              ● AWAKE
            </span>
          )}
          <button
            type="button"
            onClick={() => {
              const idx = TEXT_SIZES.indexOf(textSize);
              setTextSize(TEXT_SIZES[(idx + 1) % TEXT_SIZES.length]);
            }}
            className="text-xs px-2 py-1 rounded border border-input hover:bg-muted"
            aria-label={`Text size ${textSize}, click to cycle`}
          >
            A{textSize === "sm" ? "" : textSize === "md" ? "+" : textSize === "lg" ? "++" : "+++"}
          </button>
        </div>
      </header>

      {/* Mise-en-place checklist */}
      {nonGroupIngs.length > 0 && (
        <details
          className="shrink-0 border-b bg-muted/30 z-10"
          open={miseOpen}
          onToggle={(e) => setMiseOpen((e.target as HTMLDetailsElement).open)}
        >
          <summary className="px-4 py-2 text-xs font-semibold uppercase tracking-wide cursor-pointer select-none">
            Mise en place · {checkedIngs.size}/{nonGroupIngs.length}
          </summary>
          <ul className="max-h-48 overflow-y-auto px-4 py-2 space-y-1.5">
            {ingredients.map((ing) => {
              if (ing.isGroupHeader) {
                return (
                  <li
                    key={ing.id}
                    className="pt-2 text-[10px] font-semibold uppercase tracking-widest text-muted-foreground"
                  >
                    {ing.name}
                  </li>
                );
              }
              const qty = ing.quantityDecimal != null ? formatQty(ing.quantityDecimal) : (ing.quantityRaw ?? "");
              const unit = ing.unitRaw ?? "";
              const qtyUnit = [qty, unit].filter(Boolean).join("\u00a0");
              const checked = checkedIngs.has(ing.id);
              return (
                <li key={ing.id}>
                  <label className="flex items-start gap-2 text-sm cursor-pointer">
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={() => toggleIng(ing.id)}
                      className="mt-1 shrink-0"
                    />
                    <span className={checked ? "line-through text-muted-foreground" : ""}>
                      {qtyUnit && <span className="tabular-nums">{qtyUnit} </span>}
                      {ing.name}
                      {ing.notes ? <span className="text-muted-foreground">, {ing.notes}</span> : null}
                    </span>
                  </label>
                </li>
              );
            })}
          </ul>
        </details>
      )}

      {/* Step view with tap zones */}
      <main className="relative flex-1 overflow-y-auto">
        {/* Tap zones — positioned absolutely, 40% left / 40% right, middle 20% reserved */}
        <button
          type="button"
          aria-label="Previous step"
          disabled={!canPrev}
          onClick={() => onZoneClick("prev")}
          className="absolute top-0 bottom-0 left-0 w-[40%] z-0 disabled:opacity-40"
        />
        <button
          type="button"
          aria-label="Next step"
          disabled={!canNext}
          onClick={() => onZoneClick("next")}
          className="absolute top-0 bottom-0 right-0 w-[40%] z-0 disabled:opacity-40"
        />

        <div className="relative z-[1] max-w-3xl mx-auto px-6 py-10 pointer-events-none">
          <div className="text-xs uppercase tracking-widest text-muted-foreground mb-4">
            Step {stepIdx + 1} of {totalSteps}
          </div>
          <p className={`${STEP_TEXT_CLASS[textSize]} font-medium`}>
            {currentStep || "No directions."}
          </p>
        </div>
      </main>

      {/* Step nav arrows (below tap zones visually but above them for pointer) */}
      <div className="shrink-0 flex items-center justify-between px-4 py-2 border-t bg-background/95 backdrop-blur text-sm">
        <button
          type="button"
          onClick={goPrev}
          disabled={!canPrev}
          className="px-3 py-1 rounded border border-input disabled:opacity-40 hover:bg-muted"
        >
          ← Prev
        </button>
        <div className="flex items-center gap-2">
          {Array.from({ length: totalSteps }, (_, i) => (
            <span
              key={i}
              className={`inline-block h-1.5 w-1.5 rounded-full ${
                i === stepIdx ? "bg-primary" : i < stepIdx ? "bg-muted-foreground" : "bg-muted"
              }`}
            />
          ))}
        </div>
        <button
          type="button"
          onClick={goNext}
          disabled={!canNext}
          className="px-3 py-1 rounded border border-input disabled:opacity-40 hover:bg-muted"
        >
          Next →
        </button>
      </div>

      {/* Timer strip */}
      <div className="shrink-0 border-t bg-background px-3 py-2 flex items-center gap-2 overflow-x-auto">
        <button
          type="button"
          onClick={() => setShowTimerForm(true)}
          className="shrink-0 px-2.5 py-1.5 rounded border border-input text-xs hover:bg-muted"
        >
          + Timer
        </button>
        {timers.length > 0 && (
          <button
            type="button"
            onClick={pauseAll}
            className="shrink-0 px-2.5 py-1.5 rounded border border-input text-xs hover:bg-muted"
            aria-label={anyRunning ? "Pause all timers" : "Resume all timers"}
          >
            {anyRunning ? "⏸ Pause all" : "▶ Resume all"}
          </button>
        )}
        <div className="flex items-center gap-2 overflow-x-auto">
          {timers.map((t) => {
            const done = t.remainingMs <= 0;
            return (
              <div
                key={t.id}
                className={`shrink-0 flex items-center gap-2 rounded-lg border px-2 py-1 text-xs ${
                  done ? "border-red-400 bg-red-50 dark:bg-red-950 animate-pulse" : "border-input"
                }`}
              >
                <span className="font-medium max-w-[120px] truncate">{t.label}</span>
                <span className="tabular-nums font-mono">
                  {formatTimerDisplay(t.remainingMs)}
                </span>
                <button
                  type="button"
                  onClick={() => toggleTimer(t.id)}
                  className="text-muted-foreground hover:text-foreground"
                  aria-label={t.running ? "Pause timer" : done ? "Restart timer" : "Resume timer"}
                >
                  {t.running ? "⏸" : done ? "↻" : "▶"}
                </button>
                <button
                  type="button"
                  onClick={() => removeTimer(t.id)}
                  className="text-muted-foreground hover:text-foreground"
                  aria-label="Remove timer"
                >
                  ✕
                </button>
              </div>
            );
          })}
        </div>
      </div>

      {/* Timer form modal */}
      {showTimerForm && (
        <TimerForm
          onCancel={() => setShowTimerForm(false)}
          onAdd={addTimer}
        />
      )}

      {/* Exit confirmation */}
      {showExitDialog && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="exit-dialog-title"
            className="bg-background rounded-lg shadow-xl max-w-sm w-full p-5 space-y-4"
          >
            <h2 id="exit-dialog-title" className="font-semibold text-lg">
              Exit cooking mode?
            </h2>
            <p className="text-sm text-muted-foreground">
              {anyRunning
                ? "Timers are still running and will be lost."
                : "You can come back to this recipe any time."}
            </p>
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setShowExitDialog(false)}
                className="px-3 py-1.5 rounded border border-input text-sm hover:bg-muted"
              >
                Keep cooking
              </button>
              <button
                type="button"
                onClick={confirmExit}
                className="px-3 py-1.5 rounded bg-primary text-primary-foreground text-sm hover:opacity-90"
              >
                Exit
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Quick log sheet */}
      {showQuickLog && (
        <QuickLogSheet
          recipeId={recipe.id}
          recipeTitle={recipe.title}
          onSkip={() => navigate(`/recipes/${recipe.id}`)}
        />
      )}

      {/* Screen-reader live region for step */}
      <div className="sr-only" aria-live="polite">
        Step {stepIdx + 1} of {totalSteps}: {currentStep}
      </div>

      {/* Hidden link for "back to recipe" via a11y */}
      <Link to={`/recipes/${recipe.id}`} className="sr-only">
        Back to recipe details
      </Link>
    </div>
  );
}

function TimerForm({
  onAdd,
  onCancel,
}: {
  onAdd: (label: string, minutes: number, seconds: number) => void;
  onCancel: () => void;
}) {
  const [label, setLabel] = useState("");
  const [minutes, setMinutes] = useState("5");
  const [seconds, setSeconds] = useState("0");

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <form
        role="dialog"
        aria-modal="true"
        aria-labelledby="timer-dialog-title"
        className="bg-background rounded-lg shadow-xl max-w-sm w-full p-5 space-y-4"
        onSubmit={(e) => {
          e.preventDefault();
          onAdd(label, parseInt(minutes) || 0, parseInt(seconds) || 0);
        }}
      >
        <h2 id="timer-dialog-title" className="font-semibold text-lg">
          New timer
        </h2>
        <label className="block space-y-1">
          <span className="text-xs font-medium">Label (optional)</span>
          <input
            type="text"
            value={label}
            onChange={(e) => setLabel(e.target.value)}
            placeholder="Simmer sauce"
            autoFocus
            className="w-full px-3 py-2 border border-input rounded text-sm bg-background"
          />
        </label>
        <div className="flex gap-2">
          <label className="flex-1 space-y-1">
            <span className="text-xs font-medium">Minutes</span>
            <input
              type="number"
              min="0"
              value={minutes}
              onChange={(e) => setMinutes(e.target.value)}
              className="w-full px-3 py-2 border border-input rounded text-sm bg-background tabular-nums"
            />
          </label>
          <label className="flex-1 space-y-1">
            <span className="text-xs font-medium">Seconds</span>
            <input
              type="number"
              min="0"
              max="59"
              value={seconds}
              onChange={(e) => setSeconds(e.target.value)}
              className="w-full px-3 py-2 border border-input rounded text-sm bg-background tabular-nums"
            />
          </label>
        </div>
        <div className="flex justify-end gap-2">
          <button
            type="button"
            onClick={onCancel}
            className="px-3 py-1.5 rounded border border-input text-sm hover:bg-muted"
          >
            Cancel
          </button>
          <button
            type="submit"
            className="px-3 py-1.5 rounded bg-primary text-primary-foreground text-sm hover:opacity-90"
          >
            Start
          </button>
        </div>
      </form>
    </div>
  );
}

function todayLocalDate(): string {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function QuickLogSheet({
  recipeId,
  recipeTitle,
  onSkip,
}: {
  recipeId: string;
  recipeTitle: string;
  onSkip: () => void;
}) {
  const fetcher = useFetcher();
  const [rating, setRating] = useState(0);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const id = requestAnimationFrame(() => setVisible(true));
    return () => cancelAnimationFrame(id);
  }, []);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") { e.preventDefault(); onSkip(); }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onSkip]);

  return (
    <div className="fixed inset-0 z-50 flex flex-col justify-end">
      <div
        className="absolute inset-0 bg-black/50"
        aria-hidden="true"
        onClick={onSkip}
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="quicklog-title"
        className={`relative bg-background rounded-t-2xl shadow-2xl px-5 pt-5 pb-10 space-y-6 transition-transform duration-300 ease-out ${
          visible ? "translate-y-0" : "translate-y-full"
        }`}
      >
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 id="quicklog-title" className="font-semibold text-lg leading-snug">
              How did it go?
            </h2>
            <p className="text-sm text-muted-foreground mt-0.5 line-clamp-1">
              {recipeTitle}
            </p>
          </div>
          <button
            type="button"
            onClick={onSkip}
            className="shrink-0 text-sm text-muted-foreground hover:text-foreground pt-0.5"
          >
            Skip
          </button>
        </div>

        <fetcher.Form method="post" action="/logs/new" className="space-y-6">
          <input type="hidden" name="recipeId" value={recipeId} />
          <input type="hidden" name="cookedAt" value={todayLocalDate()} />
          <input type="hidden" name="rating" value={rating > 0 ? rating : ""} />

          <div
            className="flex justify-center gap-4"
            role="group"
            aria-label="Star rating"
          >
            {[1, 2, 3, 4, 5].map((star) => (
              <button
                key={star}
                type="button"
                onClick={() => setRating(rating === star ? 0 : star)}
                className={`text-5xl leading-none touch-manipulation transition-colors ${
                  star <= rating
                    ? "text-yellow-400"
                    : "text-muted-foreground/30 hover:text-yellow-300"
                }`}
                aria-label={`${star} star${star > 1 ? "s" : ""}`}
                aria-pressed={star <= rating}
              >
                ★
              </button>
            ))}
          </div>

          <button
            type="submit"
            disabled={fetcher.state !== "idle"}
            className="w-full rounded-lg bg-primary text-primary-foreground px-4 py-3 text-base font-medium hover:opacity-90 transition-opacity disabled:opacity-50"
          >
            {fetcher.state !== "idle" ? "Saving…" : "Save Log"}
          </button>
        </fetcher.Form>
      </div>
    </div>
  );
}
