/**
 * /imports/paprika
 *
 * Multi-step Paprika binary importer:
 *   1. Select .paprikarecipes file
 *   2. Parse in browser (fflate — avoids the ~500MB CF Worker upload limit)
 *   3. Send text batches to /api/imports/paprika
 *   4. Optionally upload photos in batches to /api/imports/paprika/photos
 */

import { useEffect, useRef, useState } from "react";
import { Link, useNavigate } from "react-router";
import { eq } from "drizzle-orm";
import type { Route } from "./+types/imports.paprika";
import { requireUser } from "~/lib/auth.server";
import { createDb, schema } from "~/db";
import { AppShell } from "~/components/app-shell";
import { Button, Chip, ImageFallback, SectionHeader } from "~/components/ui";
import {
  parsePaprikaArchive,
  toTextPayload,
  type PaprikaRecipeRaw,
} from "~/lib/paprika-binary-parser";

export function meta() {
  return [{ title: "Import from Paprika — ProjectSpice" }];
}

export async function loader({ request, context }: Route.LoaderArgs) {
  const user = await requireUser(request, context);
  const { db } = createDb(context.cloudflare.env.DB);
  const fullUser = await db.query.users.findFirst({
    where: eq(schema.users.id, user.id),
    columns: { email: true, name: true, onboardingCompletedAt: true },
  });
  return {
    inOnboarding: !fullUser?.onboardingCompletedAt,
    user: {
      name: fullUser?.name ?? user.email,
      email: fullUser?.email ?? user.email,
    },
  };
}

// ─── Types ────────────────────────────────────────────────────────────────────

type Step = "idle" | "parsing" | "parsed" | "importing" | "done" | "uploading-photos" | "error";

type Progress = {
  imported: number;
  skipped: number;
  total: number;
  photosUploaded: number;
  photosTotal: number;
  errors: string[];
  jobId: string;
};

type ReviewStatus = "pending" | "approved" | "edited" | "skipped";

type ReviewSummary = {
  titlePresent: boolean;
  ingredientLineCount: number;
  directionStepCount: number;
  categoryCount: number;
  hasSourceUrl: boolean;
  hasImage: boolean;
  hasServings: boolean;
  hasTiming: boolean;
  warnings: string[];
};

type ReviewItem = {
  id: string;
  recipeId: string | null;
  title: string;
  status: ReviewStatus;
  confidenceScore: number;
  confidenceLevel: "high" | "medium" | "low";
  parsedFieldSummary: ReviewSummary | null;
  decisionReason: string | null;
};

type ReviewPayload = {
  reviewTabs: Record<"all" | ReviewStatus, number>;
  reviewItems: ReviewItem[];
};

const RECIPE_BATCH = 100; // recipes per text batch
const PHOTO_BATCH = 3;    // photos per upload batch; base64 payloads get large quickly

async function readJsonResponse<T>(res: Response): Promise<T> {
  const text = await res.text();
  let data: unknown = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    throw new Error(text || `HTTP ${res.status}`);
  }
  if (!res.ok) {
    const message =
      data && typeof data === "object" && "error" in data
        ? String((data as { error: unknown }).error)
        : `HTTP ${res.status}`;
    throw new Error(message);
  }
  return data as T;
}

// ─── Component ───────────────────────────────────────────────────────────────

export default function ImportPaprika({ loaderData }: Route.ComponentProps) {
  const { inOnboarding, user } = loaderData;
  const navigate = useNavigate();
  const inputRef = useRef<HTMLInputElement>(null);

  const [step, setStep] = useState<Step>("idle");
  const [parsedRecipes, setParsedRecipes] = useState<PaprikaRecipeRaw[]>([]);
  const [progress, setProgress] = useState<Progress>({
    imported: 0,
    skipped: 0,
    total: 0,
    photosUploaded: 0,
    photosTotal: 0,
    errors: [],
    jobId: "",
  });

  // ─── Step 1: Parse file in browser ─────────────────────────────────────
  async function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;

    setStep("parsing");
    setProgress((p) => ({ ...p, errors: [] }));
    try {
      const buffer = await file.arrayBuffer();
      const recipes = parsePaprikaArchive(new Uint8Array(buffer));
      if (recipes.length === 0) {
        setStep("error");
        setProgress((p) => ({ ...p, errors: ["No recipes found in file. Is this a .paprikarecipes archive?"] }));
        return;
      }
      setParsedRecipes(recipes);
      setProgress((p) => ({
        ...p,
        total: recipes.length,
        photosTotal: recipes.filter((r) => r.photo_data).length,
      }));
      setStep("parsed");
    } catch (err) {
      setStep("error");
      setProgress((p) => ({ ...p, errors: [String(err)] }));
    }
  }

  // ─── Step 2: Import recipe text in batches ──────────────────────────────
  async function handleImport() {
    setStep("importing");
    const allErrors: string[] = [];
    let totalImported = 0;
    let totalSkipped = 0;
    let jobId = "";

    for (let i = 0; i < parsedRecipes.length; i += RECIPE_BATCH) {
      const batch = parsedRecipes.slice(i, i + RECIPE_BATCH).map(toTextPayload);
      try {
        const res = await fetch("/api/imports/paprika", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            recipes: batch,
            jobId: jobId || undefined,
            expectedTotal: parsedRecipes.length,
          }),
        });
        const data = await readJsonResponse<{
          jobId: string;
          imported: number;
          skipped: number;
          errors: string[];
        }>(res);
        if (!jobId) jobId = data.jobId;
        totalImported += data.imported;
        totalSkipped += data.skipped;
        if (data.errors?.length) allErrors.push(...data.errors);
      } catch (err) {
        allErrors.push(`Batch ${i}–${i + RECIPE_BATCH} failed: ${String(err)}`);
        break;
      }

      setProgress((p) => ({
        ...p,
        imported: totalImported,
        skipped: totalSkipped,
        errors: allErrors,
        jobId,
      }));
    }

    setProgress((p) => ({ ...p, jobId, errors: allErrors }));

    if (parsedRecipes.some((r) => r.photo_data)) {
      await uploadPhotos(allErrors);
    } else {
      setStep("done");
    }
  }

  // ─── Step 3: Upload photos in batches ───────────────────────────────────
  async function uploadPhotos(existingErrors: string[] = []) {
    const withPhotos = parsedRecipes.filter((r) => r.photo_data);
    if (withPhotos.length === 0) return;

    setStep("uploading-photos");
    const allErrors = [...existingErrors];
    let uploaded = 0;

    for (let i = 0; i < withPhotos.length; i += PHOTO_BATCH) {
      const batch = withPhotos.slice(i, i + PHOTO_BATCH).map((r) => ({
        paprikaUid: r.uid,
        base64: r.photo_data,
      }));
      try {
        const res = await fetch("/api/imports/paprika/photos", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ photos: batch }),
        });
        const data = await readJsonResponse<{ uploaded: number; errors: string[] }>(res);
        uploaded += data.uploaded;
        if (data.errors?.length) allErrors.push(...data.errors);
      } catch (err) {
        allErrors.push(`Photo batch ${i}–${i + PHOTO_BATCH} failed: ${String(err)}`);
        break;
      }

      setProgress((p) => ({
        ...p,
        photosUploaded: uploaded,
        errors: allErrors,
      }));
    }

    setStep("done");
  }

  // ─── Render ─────────────────────────────────────────────────────────────
  const photosAvailable = parsedRecipes.filter((r) => r.photo_data).length;

  return (
    <AppShell user={user} forceBare={inOnboarding}>
      <div className={inOnboarding ? "min-h-screen bg-background" : ""}>
        {inOnboarding && (
          <header className="sticky top-0 z-10 bg-background/95 backdrop-blur border-b">
            <div className="max-w-2xl mx-auto px-4 h-14 flex items-center gap-3">
          <Link to="/recipes" className="text-muted-foreground hover:text-foreground text-sm">
            ← Recipes
          </Link>
          <span className="text-muted-foreground">/</span>
          <span className="font-medium text-sm">Import from Paprika</span>
            </div>
          </header>
        )}

        <div
          className={`${inOnboarding ? "max-w-2xl mx-auto px-4 py-8" : ""} space-y-6`}
        >
          <SectionHeader
            eyebrow="Paprika migration"
            title="Import Review"
            description="Bring in a Paprika archive, then scan confidence, warnings, and review decisions before moving on."
            actions={!inOnboarding && <Button variant="secondary" onClick={() => navigate("/recipes")}>Recipes</Button>}
          />

        {/* File picker — always shown */}
        {(step === "idle" || step === "error") && (
          <div className="space-y-3">
            <label
              htmlFor="file"
              className="block text-sm font-medium"
            >
              Select .paprikarecipes file
            </label>
            <input
              id="file"
              ref={inputRef}
              type="file"
              accept=".paprikarecipes"
              onChange={handleFileChange}
              className="block w-full text-sm text-muted-foreground
                file:mr-3 file:py-2 file:px-4 file:rounded-md file:border-0
                file:text-sm file:font-medium file:bg-primary file:text-primary-foreground
                hover:file:bg-primary/90 cursor-pointer"
            />
            {step === "error" && progress.errors.length > 0 && (
              <div className="rounded-md bg-red-50 px-4 py-3 text-sm text-red-700 space-y-1">
                {progress.errors.map((e, i) => (
                  <p key={i}>{e}</p>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Parsing spinner */}
        {step === "parsing" && (
          <div className="flex items-center gap-3 py-6">
            <Spinner />
            <span className="text-sm text-muted-foreground">Parsing archive in browser…</span>
          </div>
        )}

        {/* Parsed — show preview + import button */}
        {step === "parsed" && (
          <div className="space-y-4">
            <div className="rounded-lg border bg-card px-5 py-4 space-y-1">
              <p className="text-sm font-medium">Archive parsed successfully</p>
              <p className="text-sm text-muted-foreground">
                <strong>{progress.total.toLocaleString()}</strong> recipes found
                {" · "}
                <strong>{photosAvailable.toLocaleString()}</strong> have photos
              </p>
            </div>
            <button
              onClick={handleImport}
              className="rounded-md bg-primary text-primary-foreground px-6 py-2.5 text-sm font-medium hover:bg-primary/90 transition-colors"
            >
              Import {progress.total.toLocaleString()} Recipes + Photos
            </button>
          </div>
        )}

        {/* Importing progress */}
        {step === "importing" && (
          <div className="space-y-4">
            <div className="flex items-center gap-3">
              <Spinner />
              <span className="text-sm text-muted-foreground">Importing recipes…</span>
            </div>
            <ProgressBar
              current={progress.imported + progress.skipped}
              total={progress.total}
              label={`${progress.imported + progress.skipped} / ${progress.total}`}
            />
          </div>
        )}

        {/* Done */}
        {step === "done" && (
          <div className="space-y-5">
            <ImportReviewPanel
              jobId={progress.jobId}
              imported={progress.imported}
              skipped={progress.skipped}
              photosUploaded={progress.photosUploaded}
            />

            {/* Errors summary */}
            {progress.errors.length > 0 && (
              <details className="rounded-md border px-4 py-3 text-sm">
                <summary className="cursor-pointer font-medium text-amber-700">
                  {progress.errors.length} warning{progress.errors.length !== 1 ? "s" : ""}
                </summary>
                <ul className="mt-2 space-y-1 text-muted-foreground text-xs list-disc pl-4">
                  {progress.errors.slice(0, 20).map((e, i) => (
                    <li key={i}>{e}</li>
                  ))}
                  {progress.errors.length > 20 && (
                    <li>…and {progress.errors.length - 20} more</li>
                  )}
                </ul>
              </details>
            )}

            <div className="flex gap-3 pt-2">
              <button
                onClick={() =>
                  navigate(
                    inOnboarding ? "/onboarding/cookbook-review" : "/recipes"
                  )
                }
                className="rounded-md bg-primary text-primary-foreground px-6 py-2.5 text-sm font-medium hover:bg-primary/90 transition-colors"
              >
                {inOnboarding ? "Review My Cookbooks" : "View My Recipes"}
              </button>
              <button
                onClick={() => {
                  setStep("idle");
                  setParsedRecipes([]);
                  setProgress({ imported: 0, skipped: 0, total: 0, photosUploaded: 0, photosTotal: 0, errors: [], jobId: "" });
                  if (inputRef.current) inputRef.current.value = "";
                }}
                className="rounded-md border px-4 py-2.5 text-sm hover:bg-muted transition-colors"
              >
                Import Another File
              </button>
            </div>
          </div>
        )}

        {/* Photo upload in progress */}
        {step === "uploading-photos" && (
          <div className="space-y-4">
            <div className="flex items-center gap-3">
              <Spinner />
              <span className="text-sm text-muted-foreground">Uploading photos to app image storage…</span>
            </div>
            <ProgressBar
              current={progress.photosUploaded}
              total={progress.photosTotal}
              label={`${progress.photosUploaded} / ${progress.photosTotal}`}
            />
          </div>
        )}

        {/* How-to instructions */}
        {step === "idle" && (
          <div className="rounded-lg border bg-muted/30 px-5 py-4 space-y-2 text-sm text-muted-foreground">
            <p className="font-medium text-foreground">How to export from Paprika 3</p>
            <ol className="list-decimal pl-4 space-y-1">
              <li>Open Paprika 3 on Mac or iOS</li>
              <li>Go to <strong>File → Export…</strong> (Mac) or <strong>Settings → Export</strong> (iOS)</li>
              <li>Choose <strong>Paprika Recipe Format (.paprikarecipes)</strong></li>
              <li>Save the file and select it above</li>
            </ol>
          </div>
        )}
        </div>
      </div>
    </AppShell>
  );
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function Spinner() {
  return (
    <svg
      className="animate-spin h-5 w-5 text-primary"
      xmlns="http://www.w3.org/2000/svg"
      fill="none"
      viewBox="0 0 24 24"
      aria-hidden="true"
    >
      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
    </svg>
  );
}

function ProgressBar({ current, total, label }: { current: number; total: number; label: string }) {
  const pct = total > 0 ? Math.min(100, Math.round((current / total) * 100)) : 0;
  return (
    <div className="space-y-1">
      <div className="flex justify-between text-xs text-muted-foreground">
        <span>{label}</span>
        <span>{pct}%</span>
      </div>
      <div className="h-2 rounded-full bg-muted overflow-hidden">
        <div
          className="h-full bg-primary transition-all duration-300"
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}

function ImportReviewPanel({
  jobId,
  imported,
  skipped,
  photosUploaded,
}: {
  jobId: string;
  imported: number;
  skipped: number;
  photosUploaded: number;
}) {
  const [review, setReview] = useState<ReviewPayload | null>(null);
  const [tab, setTab] = useState<"all" | ReviewStatus>("all");
  const [threshold, setThreshold] = useState(90);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function loadReview(selectedTab = tab) {
    if (!jobId) return;
    const params = selectedTab === "all" ? "" : `?reviewTab=${selectedTab}`;
    const data = await readJsonResponse<ReviewPayload>(await fetch(`/api/imports/${jobId}${params}`));
    setReview(data);
  }

  useEffect(() => {
    void loadReview().catch((err) => setError(String(err)));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [jobId, tab]);

  async function applyReviewAction(action: "approve" | "skip" | "undo", itemIds: string[]) {
    setBusy(`${action}:${itemIds.join(",")}`);
    setError(null);
    try {
      await readJsonResponse(
        await fetch(`/api/imports/${jobId}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action, itemIds }),
        })
      );
      await loadReview();
    } catch (err) {
      setError(String(err));
    } finally {
      setBusy(null);
    }
  }

  async function bulkApprove() {
    setBusy("bulk-approve");
    setError(null);
    try {
      await readJsonResponse(
        await fetch(`/api/imports/${jobId}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action: "bulk-approve", threshold }),
        })
      );
      await loadReview();
    } catch (err) {
      setError(String(err));
    } finally {
      setBusy(null);
    }
  }

  const items = review?.reviewItems ?? [];
  const histogram = {
    high: items.filter((item) => item.confidenceLevel === "high").length,
    medium: items.filter((item) => item.confidenceLevel === "medium").length,
    low: items.filter((item) => item.confidenceLevel === "low").length,
  };
  const maxBucket = Math.max(1, histogram.high, histogram.medium, histogram.low);
  const tabs: Array<"all" | ReviewStatus> = ["all", "pending", "approved", "edited", "skipped"];

  return (
    <section className="space-y-4">
      <div className="ps-surface p-4">
        <div className="grid gap-3 sm:grid-cols-4">
          <ReviewMetric label="Imported" value={imported} tone="success" />
          <ReviewMetric label="Skipped" value={skipped} tone="warning" />
          <ReviewMetric label="Photos" value={photosUploaded} tone="neutral" />
          <ReviewMetric label="Review rows" value={review?.reviewTabs.all ?? 0} tone="neutral" />
        </div>
      </div>

      <div className="grid gap-4 xl:grid-cols-[18rem_minmax(0,1fr)]">
        <aside className="space-y-4">
          <div className="ps-surface p-4">
            <h2 className="text-sm font-semibold text-ink">Confidence</h2>
            <div className="mt-4 space-y-3">
              <HistogramRow label="High" value={histogram.high} max={maxBucket} className="bg-ok" />
              <HistogramRow label="Medium" value={histogram.medium} max={maxBucket} className="bg-warn" />
              <HistogramRow label="Low" value={histogram.low} max={maxBucket} className="bg-err" />
            </div>
          </div>

          <div className="ps-surface space-y-3 p-4">
            <label className="block text-sm font-semibold text-ink" htmlFor="bulk-threshold">
              Bulk approve threshold
            </label>
            <div className="flex items-center gap-2">
              <input
                id="bulk-threshold"
                type="number"
                min={60}
                max={100}
                value={threshold}
                onChange={(event) => setThreshold(Number(event.target.value))}
                className="ps-control w-24 border border-rule bg-paper-2 px-3 text-sm text-ink focus-visible:ps-focus-ring"
              />
              <Button
                variant="primary"
                size="sm"
                onClick={bulkApprove}
                disabled={!jobId || busy === "bulk-approve"}
              >
                Approve
              </Button>
            </div>
          </div>
        </aside>

        <div className="ps-surface overflow-hidden">
          <div className="flex flex-wrap gap-2 border-b border-rule p-3">
            {tabs.map((nextTab) => (
              <button
                key={nextTab}
                type="button"
                onClick={() => setTab(nextTab)}
                className={`ps-control min-h-8 rounded-full px-3 text-xs font-semibold capitalize transition-colors focus-visible:ps-focus-ring ${
                  tab === nextTab ? "bg-primary text-primary-foreground" : "bg-paper-3 text-ink-3 hover:text-ink"
                }`}
              >
                {nextTab} {review?.reviewTabs[nextTab] ?? 0}
              </button>
            ))}
          </div>

          {error && (
            <div className="border-b border-rule bg-err/10 px-4 py-3 text-sm text-err">
              {error}
            </div>
          )}

          <div className="divide-y divide-rule">
            {items.length === 0 ? (
              <div className="px-4 py-10 text-center text-sm text-ink-3">
                No review rows in this view.
              </div>
            ) : (
              items.map((item) => (
                <ReviewItemRow
                  key={item.id}
                  item={item}
                  busy={busy}
                  onAction={applyReviewAction}
                />
              ))
            )}
          </div>
        </div>
      </div>
    </section>
  );
}

function ReviewMetric({
  label,
  value,
  tone,
}: {
  label: string;
  value: number;
  tone: "neutral" | "success" | "warning";
}) {
  const toneClass =
    tone === "success" ? "text-ok" : tone === "warning" ? "text-warn" : "text-ink";
  return (
    <div className="rounded-lg border border-rule bg-paper-3 px-3 py-3">
      <p className="text-xs font-semibold uppercase text-ink-3">{label}</p>
      <p className={`mt-1 text-2xl font-semibold ${toneClass}`}>{value.toLocaleString()}</p>
    </div>
  );
}

function HistogramRow({
  label,
  value,
  max,
  className,
}: {
  label: string;
  value: number;
  max: number;
  className: string;
}) {
  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between text-xs text-ink-3">
        <span>{label}</span>
        <span>{value.toLocaleString()}</span>
      </div>
      <div className="h-2 overflow-hidden rounded-full bg-paper-3">
        <div
          className={`h-full rounded-full ${className}`}
          style={{ width: `${Math.round((value / max) * 100)}%` }}
        />
      </div>
    </div>
  );
}

function ReviewItemRow({
  item,
  busy,
  onAction,
}: {
  item: ReviewItem;
  busy: string | null;
  onAction: (action: "approve" | "skip" | "undo", itemIds: string[]) => Promise<void>;
}) {
  const warnings = item.parsedFieldSummary?.warnings ?? [];
  const actionBusy = busy?.includes(item.id) ?? false;

  return (
    <article className="grid gap-3 px-4 py-4 md:grid-cols-[3rem_minmax(0,1fr)_auto]">
      <div className="h-12 w-12 overflow-hidden rounded-lg bg-paper-3">
        <ImageFallback label={item.title.slice(0, 2).toUpperCase()} alt="" />
      </div>

      <div className="min-w-0 space-y-2">
        <div className="flex flex-wrap items-center gap-2">
          <h3 className="min-w-0 truncate text-sm font-semibold text-ink">{item.title}</h3>
          <Chip tone={confidenceTone(item.confidenceLevel)}>
            {item.confidenceScore}% {item.confidenceLevel}
          </Chip>
          <Chip tone={statusTone(item.status)}>{item.status}</Chip>
        </div>

        {item.parsedFieldSummary && (
          <dl className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-ink-3">
            <div>
              <dt className="sr-only">Ingredients</dt>
              <dd>{item.parsedFieldSummary.ingredientLineCount} ingredients</dd>
            </div>
            <div>
              <dt className="sr-only">Steps</dt>
              <dd>{item.parsedFieldSummary.directionStepCount} steps</dd>
            </div>
            <div>
              <dt className="sr-only">Categories</dt>
              <dd>{item.parsedFieldSummary.categoryCount} categories</dd>
            </div>
          </dl>
        )}

        {warnings.length > 0 && (
          <div className="flex flex-wrap gap-1.5">
            {warnings.slice(0, 4).map((warning) => (
              <Chip key={warning} tone="warning">{warning}</Chip>
            ))}
            {warnings.length > 4 && <Chip tone="warning">+{warnings.length - 4}</Chip>}
          </div>
        )}

        {item.decisionReason && (
          <p className="text-xs text-ink-3">{item.decisionReason}</p>
        )}
      </div>

      <div className="flex flex-wrap items-start gap-2 md:justify-end">
        {item.status === "pending" ? (
          <>
            <Button
              size="sm"
              variant="primary"
              disabled={actionBusy}
              onClick={() => onAction("approve", [item.id])}
            >
              Approve
            </Button>
            <Button
              size="sm"
              variant="secondary"
              disabled={actionBusy}
              onClick={() => onAction("skip", [item.id])}
            >
              Skip
            </Button>
          </>
        ) : (
          <Button
            size="sm"
            variant="secondary"
            disabled={actionBusy}
            onClick={() => onAction("undo", [item.id])}
          >
            Undo
          </Button>
        )}
      </div>
    </article>
  );
}

function confidenceTone(level: ReviewItem["confidenceLevel"]) {
  if (level === "high") return "success";
  if (level === "medium") return "warning";
  return "danger";
}

function statusTone(status: ReviewStatus) {
  if (status === "approved") return "success";
  if (status === "skipped") return "warning";
  if (status === "edited") return "accent";
  return "neutral";
}
