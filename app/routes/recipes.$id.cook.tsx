import { data, Link, useNavigate } from "react-router";
import { useCallback, useEffect, useRef, useState } from "react";
import { and, asc, eq, isNull, or } from "drizzle-orm";
import type { Route } from "./+types/recipes.$id.cook";
import { requireUser } from "~/lib/auth.server";
import { createDb, schema } from "~/db";
import { FAMILY_RECIPE_VISIBILITY } from "~/lib/family-sharing";
import {
  createLogClientId,
  queueLogDraft,
  shouldQueueLogAfterFailure,
  submitLogDraft,
  type LogDraft,
} from "~/lib/offline-log-sync";

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
          or(
            eq(schema.recipes.userId, user.id),
            eq(schema.recipes.visibility, FAMILY_RECIPE_VISIBILITY)
          ),
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
    setStepIdx((i) => Math.min(Math.max(0, totalSteps - 1), i + 1));
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
  const progressPct = totalSteps > 0 ? ((stepIdx + 1) / totalSteps) * 100 : 0;

  return (
    <div
      className="fixed inset-0 grid overflow-hidden bg-paper text-ink select-none lg:grid-cols-[20rem_minmax(0,1fr)]"
      onTouchStart={onTouchStart}
      onTouchEnd={onTouchEnd}
    >
      {/* Mise-en-place checklist */}
      {nonGroupIngs.length > 0 && (
        <details
          className="z-20 border-b border-rule bg-paper-2 lg:block lg:h-screen lg:overflow-y-auto lg:border-b-0 lg:border-r"
          open={miseOpen}
          onToggle={(e) => setMiseOpen((e.target as HTMLDetailsElement).open)}
        >
          <summary className="cursor-pointer select-none px-4 py-3 text-xs font-semibold uppercase text-ink-3 lg:list-none lg:px-7 lg:pb-2 lg:pt-7">
            <span className="lg:hidden">
              Mise en place · {checkedIngs.size}/{nonGroupIngs.length}
            </span>
            <span className="hidden lg:block">
              <span className="flex items-center gap-3">
                <button
                  type="button"
                  onClick={(event) => {
                    event.preventDefault();
                    requestExit();
                  }}
                  className="ps-control inline-flex min-h-8 items-center justify-center border border-transparent bg-transparent px-2 text-sm font-medium text-ink-3 hover:bg-paper-3 hover:text-ink focus-visible:ps-focus-ring"
                  aria-label="Exit cooking mode"
                >
                  Exit
                </button>
                <span className="flex-1" />
                {wakeLockActive && (
                  <span className="ps-mono text-[0.65rem] font-semibold text-ok" title="Screen will stay on">
                    AWAKE
                  </span>
                )}
              </span>
              <span className="ps-display mt-5 block text-2xl normal-case text-ink">
                {recipe.title}
              </span>
              <span className="mt-2 block text-xs font-medium normal-case text-ink-3">
                Mise en place · {checkedIngs.size}/{nonGroupIngs.length}
              </span>
            </span>
          </summary>
          <ul className="max-h-48 space-y-1.5 overflow-y-auto px-4 pb-3 lg:max-h-none lg:px-7 lg:pb-8">
            {ingredients.map((ing) => {
              if (ing.isGroupHeader) {
                return (
                  <li
                    key={ing.id}
                    className="pt-4 text-[0.65rem] font-semibold uppercase text-ink-4 first:pt-2"
                  >
                    {ing.name}
                  </li>
                );
              }
              const qty = ing.quantityDecimal != null ? formatQty(ing.quantityDecimal) : (ing.quantityRaw ?? "");
              const unit = ing.unitRaw ?? "";
              const qtyUnit = [qty, unit].filter(Boolean).join("\u00a0");
              const checked = checkedIngs.has(ing.id);
              const ingredientLabel = [qtyUnit, ing.name, ing.notes]
                .filter(Boolean)
                .join(" ");
              return (
                <li key={ing.id}>
                  <label className="grid min-h-11 cursor-pointer grid-cols-[1.5rem_minmax(0,1fr)] gap-3 border-b border-rule/60 py-2 text-sm leading-snug">
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={() => toggleIng(ing.id)}
                      aria-label={`${checked ? "Uncheck" : "Check"} ingredient ${ingredientLabel}`}
                      className="mt-0.5 h-5 w-5 rounded-full accent-ink"
                    />
                    <span className={checked ? "text-ink-4 line-through" : "text-ink"}>
                      {qtyUnit && <span className="ps-mono font-semibold tabular-nums">{qtyUnit} </span>}
                      {ing.name}
                      {ing.notes ? <span className="text-ink-3">, {ing.notes}</span> : null}
                    </span>
                  </label>
                </li>
              );
            })}
          </ul>
        </details>
      )}

      <div className={`flex min-h-0 flex-col ${nonGroupIngs.length === 0 ? "lg:col-span-2" : ""}`}>
        {/* Top bar */}
        <header className="shrink-0 border-b border-rule bg-paper/95 px-4 py-3 backdrop-blur sm:px-6">
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={requestExit}
              className="ps-control inline-flex min-h-9 items-center justify-center border border-rule bg-paper-2 px-3 text-sm font-medium text-ink hover:bg-paper-3 focus-visible:ps-focus-ring lg:hidden"
              aria-label="Exit cooking mode"
            >
              Exit
            </button>
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-3">
                <span className="ps-mono text-xs font-semibold uppercase text-ink-3">Step</span>
                <span className="ps-display text-2xl italic text-ink">
                  {Math.min(stepIdx + 1, Math.max(totalSteps, 1))} / {Math.max(totalSteps, 1)}
                </span>
                {wakeLockActive && (
                  <span className="ps-mono rounded-full bg-ok/10 px-2 py-1 text-[0.65rem] font-semibold text-ok lg:hidden">
                    Awake
                  </span>
                )}
              </div>
              <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-paper-3">
                <div
                  className="h-full rounded-full bg-ink transition-[width]"
                  style={{ width: `${progressPct}%` }}
                />
              </div>
            </div>
            <button
              type="button"
              onClick={() => {
                const idx = TEXT_SIZES.indexOf(textSize);
                setTextSize(TEXT_SIZES[(idx + 1) % TEXT_SIZES.length]);
              }}
              className="ps-control inline-flex min-h-9 items-center justify-center border border-rule bg-paper-2 px-3 text-sm font-medium text-ink hover:bg-paper-3 focus-visible:ps-focus-ring"
              aria-label={`Text size ${textSize}, click to cycle`}
            >
              A{textSize === "sm" ? "" : textSize === "md" ? "+" : textSize === "lg" ? "++" : "+++"}
            </button>
            <button
              type="button"
              onClick={() => setShowTimerForm(true)}
              className="ps-control hidden min-h-9 items-center justify-center border border-rule bg-paper-2 px-3 text-sm font-medium text-ink hover:bg-paper-3 focus-visible:ps-focus-ring sm:inline-flex"
            >
              Add timer
            </button>
          </div>
        </header>

        {/* Step view with tap zones */}
        <main className="relative min-h-0 flex-1 overflow-y-auto">
          <button
            type="button"
            aria-label="Previous step"
            disabled={!canPrev}
            onClick={() => onZoneClick("prev")}
            className="absolute bottom-0 left-0 top-0 z-0 w-[40%] disabled:opacity-40"
          />
          <button
            type="button"
            aria-label="Next step"
            disabled={!canNext}
            onClick={() => onZoneClick("next")}
            className="absolute bottom-0 right-0 top-0 z-0 w-[40%] disabled:opacity-40"
          />

          <div className="pointer-events-none relative z-[1] mx-auto flex min-h-full max-w-4xl items-center px-6 py-10 sm:px-12 lg:px-20">
            <p className={`${STEP_TEXT_CLASS[textSize]} ps-display-editorial font-medium text-ink`}>
              {currentStep || "No directions."}
            </p>
          </div>

          <button
            type="button"
            onClick={goPrev}
            disabled={!canPrev}
            className="ps-control absolute left-4 top-1/2 z-10 hidden h-12 w-12 -translate-y-1/2 items-center justify-center rounded-full border border-rule bg-paper-2 text-xl text-ink shadow-[var(--shadow-1)] disabled:opacity-30 md:inline-flex"
            aria-label="Previous step"
          >
            ‹
          </button>
          <button
            type="button"
            onClick={goNext}
            disabled={!canNext}
            className="ps-control absolute right-4 top-1/2 z-10 hidden h-12 w-12 -translate-y-1/2 items-center justify-center rounded-full border border-transparent bg-ink text-xl text-paper shadow-[var(--shadow-1)] disabled:opacity-30 md:inline-flex"
            aria-label="Next step"
          >
            ›
          </button>
        </main>

        {/* Step nav */}
        <div className="shrink-0 border-t border-rule bg-paper/95 px-4 py-3 text-sm backdrop-blur">
          <div className="flex items-center justify-between gap-3">
            <button
              type="button"
              onClick={goPrev}
              disabled={!canPrev}
              className="ps-control inline-flex min-h-10 items-center justify-center border border-rule bg-paper-2 px-4 font-medium text-ink hover:bg-paper-3 disabled:opacity-40 focus-visible:ps-focus-ring"
            >
              Prev
            </button>
            <div className="flex min-w-0 flex-1 items-center justify-center gap-1.5">
              {Array.from({ length: totalSteps }, (_, i) => (
                <span
                  key={i}
                  className={`h-1.5 rounded-full transition-all ${
                    i === stepIdx ? "w-7 bg-ink" : i < stepIdx ? "w-2 bg-ink-3" : "w-2 bg-paper-3"
                  }`}
                />
              ))}
            </div>
            <button
              type="button"
              onClick={goNext}
              disabled={!canNext}
              className="ps-control inline-flex min-h-10 items-center justify-center border border-transparent bg-ink px-4 font-medium text-paper hover:opacity-90 disabled:opacity-40 focus-visible:ps-focus-ring"
            >
              Next
            </button>
          </div>
        </div>

        {/* Timer strip */}
        <div className="flex shrink-0 items-center gap-2 overflow-x-auto border-t border-rule bg-paper-2 px-3 py-3">
          <span className="ps-mono shrink-0 text-[0.65rem] font-semibold uppercase text-ink-3">
            Timers
          </span>
          <button
            type="button"
            onClick={() => setShowTimerForm(true)}
            className="ps-control inline-flex min-h-8 shrink-0 items-center justify-center border border-rule bg-paper px-3 text-xs font-medium text-ink hover:bg-paper-3 focus-visible:ps-focus-ring"
          >
            Add
          </button>
          {timers.length > 0 && (
            <button
              type="button"
              onClick={pauseAll}
              className="ps-control inline-flex min-h-8 shrink-0 items-center justify-center border border-rule bg-paper px-3 text-xs font-medium text-ink hover:bg-paper-3 focus-visible:ps-focus-ring"
              aria-label={anyRunning ? "Pause all timers" : "Resume all timers"}
            >
              {anyRunning ? "Pause all" : "Resume all"}
            </button>
          )}
          <div className="flex items-center gap-2 overflow-x-auto">
            {timers.map((t) => {
              const done = t.remainingMs <= 0;
              const pct = t.totalMs > 0 ? (t.remainingMs / t.totalMs) * 100 : 0;
              return (
                <div
                  key={t.id}
                  className={`relative flex shrink-0 items-center gap-2 overflow-hidden rounded-md border px-3 py-2 text-xs ${
                    done
                      ? "animate-pulse border-err/40 bg-err/10"
                      : "border-rule bg-paper"
                  }`}
                >
                  <span
                    className={`absolute bottom-0 left-0 h-0.5 ${done ? "bg-err" : "bg-ink"}`}
                    style={{ width: `${pct}%` }}
                  />
                  <span className="max-w-[8rem] truncate font-medium text-ink-2">{t.label}</span>
                  <span className={`ps-mono text-base font-semibold tabular-nums ${done ? "text-err" : "text-ink"}`}>
                    {formatTimerDisplay(t.remainingMs)}
                  </span>
                  <button
                    type="button"
                    onClick={() => toggleTimer(t.id)}
                    className="font-medium text-ink-3 hover:text-ink"
                    aria-label={t.running ? "Pause timer" : done ? "Restart timer" : "Resume timer"}
                  >
                    {t.running ? "Pause" : done ? "Restart" : "Resume"}
                  </button>
                  <button
                    type="button"
                    onClick={() => removeTimer(t.id)}
                    className="font-medium text-ink-3 hover:text-ink"
                    aria-label="Remove timer"
                  >
                    Remove
                  </button>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {nonGroupIngs.length === 0 && (
        <button
          type="button"
          onClick={requestExit}
          className="ps-control fixed left-4 top-4 z-30 inline-flex min-h-9 items-center justify-center border border-rule bg-paper-2 px-3 text-sm font-medium text-ink hover:bg-paper-3 focus-visible:ps-focus-ring"
          aria-label="Exit cooking mode"
        >
          Exit
        </button>
      )}

      {nonGroupIngs.length === 0 && wakeLockActive && (
        <span className="ps-mono fixed right-4 top-4 z-30 rounded-full bg-ok/10 px-2 py-1 text-[0.65rem] font-semibold text-ok">
          Awake
        </span>
      )}

      {nonGroupIngs.length === 0 && (
        <button
          type="button"
          onClick={() => {
            const idx = TEXT_SIZES.indexOf(textSize);
            setTextSize(TEXT_SIZES[(idx + 1) % TEXT_SIZES.length]);
          }}
          className="ps-control fixed right-4 top-14 z-30 inline-flex min-h-9 items-center justify-center border border-rule bg-paper-2 px-3 text-sm font-medium text-ink hover:bg-paper-3 focus-visible:ps-focus-ring"
          aria-label={`Text size ${textSize}, click to cycle`}
        >
          A{textSize === "sm" ? "" : textSize === "md" ? "+" : textSize === "lg" ? "++" : "+++"}
        </button>
      )}

      {/* Timer form modal */}
      {showTimerForm && (
        <TimerForm
          onCancel={() => setShowTimerForm(false)}
          onAdd={addTimer}
        />
      )}

      {/* Exit confirmation */}
      {showExitDialog && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-ink/50 p-4">
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="exit-dialog-title"
            className="w-full max-w-sm space-y-4 rounded-lg border border-rule bg-paper p-5 text-ink shadow-[var(--shadow-3)]"
          >
            <h2 id="exit-dialog-title" className="ps-display text-2xl text-ink">
              Exit cooking mode?
            </h2>
            <p className="text-sm leading-6 text-ink-3">
              {anyRunning
                ? "Timers are still running and will be lost."
                : "You can come back to this recipe any time."}
            </p>
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setShowExitDialog(false)}
                className="ps-control inline-flex min-h-9 items-center justify-center border border-rule bg-paper-2 px-3 text-sm font-medium text-ink hover:bg-paper-3 focus-visible:ps-focus-ring"
              >
                Keep cooking
              </button>
              <button
                type="button"
                onClick={confirmExit}
                className="ps-control inline-flex min-h-9 items-center justify-center border border-transparent bg-ink px-3 text-sm font-medium text-paper hover:opacity-90 focus-visible:ps-focus-ring"
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
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-ink/50 p-4">
      <form
        role="dialog"
        aria-modal="true"
        aria-labelledby="timer-dialog-title"
        className="w-full max-w-sm space-y-4 rounded-lg border border-rule bg-paper p-5 text-ink shadow-[var(--shadow-3)]"
        onSubmit={(e) => {
          e.preventDefault();
          onAdd(label, parseInt(minutes) || 0, parseInt(seconds) || 0);
        }}
      >
        <h2 id="timer-dialog-title" className="ps-display text-2xl text-ink">
          New timer
        </h2>
        <label className="block space-y-1">
          <span className="text-xs font-medium text-ink-3">Label (optional)</span>
          <input
            type="text"
            value={label}
            onChange={(e) => setLabel(e.target.value)}
            placeholder="Simmer sauce"
            autoFocus
            className="ps-control w-full border border-rule bg-paper-2 px-3 text-sm text-ink placeholder:text-ink-4 focus-visible:ps-focus-ring"
          />
        </label>
        <div className="flex gap-2">
          <label className="flex-1 space-y-1">
            <span className="text-xs font-medium text-ink-3">Minutes</span>
            <input
              type="number"
              min="0"
              value={minutes}
              onChange={(e) => setMinutes(e.target.value)}
              className="ps-control w-full border border-rule bg-paper-2 px-3 text-sm tabular-nums text-ink focus-visible:ps-focus-ring"
            />
          </label>
          <label className="flex-1 space-y-1">
            <span className="text-xs font-medium text-ink-3">Seconds</span>
            <input
              type="number"
              min="0"
              max="59"
              value={seconds}
              onChange={(e) => setSeconds(e.target.value)}
              className="ps-control w-full border border-rule bg-paper-2 px-3 text-sm tabular-nums text-ink focus-visible:ps-focus-ring"
            />
          </label>
        </div>
        <div className="flex justify-end gap-2">
          <button
            type="button"
            onClick={onCancel}
            className="ps-control inline-flex min-h-9 items-center justify-center border border-rule bg-paper-2 px-3 text-sm font-medium text-ink hover:bg-paper-3 focus-visible:ps-focus-ring"
          >
            Cancel
          </button>
          <button
            type="submit"
            className="ps-control inline-flex min-h-9 items-center justify-center border border-transparent bg-ink px-3 text-sm font-medium text-paper hover:opacity-90 focus-visible:ps-focus-ring"
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
  const [rating, setRating] = useState(0);
  const [visible, setVisible] = useState(false);
  const [saving, setSaving] = useState(false);
  const [status, setStatus] = useState<string | null>(null);
  const [clientRequestId] = useState(() => createLogClientId());

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
        className="absolute inset-0 bg-ink/50"
        aria-hidden="true"
        onClick={onSkip}
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="quicklog-title"
        className={`relative space-y-6 rounded-t-2xl border border-rule bg-paper px-5 pb-10 pt-5 text-ink shadow-[var(--shadow-3)] transition-transform duration-300 ease-out ${
          visible ? "translate-y-0" : "translate-y-full"
        }`}
      >
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 id="quicklog-title" className="ps-display text-2xl leading-snug text-ink">
              How did it go?
            </h2>
            <p className="mt-0.5 line-clamp-1 text-sm text-ink-3">
              {recipeTitle}
            </p>
          </div>
          <button
            type="button"
            onClick={onSkip}
            className="shrink-0 pt-0.5 text-sm font-medium text-ink-3 hover:text-ink"
          >
            Skip
          </button>
        </div>

        <form
          className="space-y-6"
          onSubmit={async (event) => {
            event.preventDefault();
            setSaving(true);
            setStatus(null);
            const draft: LogDraft = {
              clientRequestId,
              recipeId,
              cookedAt: todayLocalDate(),
              rating: rating > 0 ? rating : null,
              notes: null,
              modifications: null,
            };
            try {
              if (navigator.onLine) {
                await submitLogDraft(draft);
                onSkip();
                return;
              }
              throw new Error("offline");
            } catch (err) {
              if (!shouldQueueLogAfterFailure(err)) {
                setStatus(err instanceof Error ? err.message : "Could not save log.");
                return;
              }
              await queueLogDraft(draft);
              window.dispatchEvent(new Event("projectspice:offline-log-queued"));
              setStatus("Saved offline. It will sync when you reconnect.");
              setTimeout(onSkip, 900);
            } finally {
              setSaving(false);
            }
          }}
        >
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
                    ? "text-warn"
                    : "text-ink-4 hover:text-warn/70"
                }`}
                aria-label={`${star} star${star > 1 ? "s" : ""}`}
                aria-pressed={star <= rating}
              >
                ★
              </button>
            ))}
          </div>

          {status && (
            <p className="text-center text-sm text-warn">{status}</p>
          )}

          <button
            type="submit"
            disabled={saving}
            className="ps-control w-full border border-transparent bg-ink px-4 py-3 text-base font-medium text-paper transition-opacity hover:opacity-90 disabled:opacity-50 focus-visible:ps-focus-ring"
          >
            {saving ? "Saving…" : "Save Log"}
          </button>
        </form>
      </div>
    </div>
  );
}
