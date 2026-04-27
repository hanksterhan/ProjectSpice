/**
 * /imports/paprika
 *
 * Multi-step Paprika binary importer:
 *   1. Select .paprikarecipes file
 *   2. Parse in browser (fflate — avoids the ~500MB CF Worker upload limit)
 *   3. Send text batches to /api/imports/paprika
 *   4. Optionally upload photos in batches to /api/imports/paprika/photos
 */

import { useRef, useState } from "react";
import { Link, useNavigate } from "react-router";
import { eq } from "drizzle-orm";
import type { Route } from "./+types/imports.paprika";
import { requireUser } from "~/lib/auth.server";
import { createDb, schema } from "~/db";
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
    columns: { onboardingCompletedAt: true },
  });
  return { inOnboarding: !fullUser?.onboardingCompletedAt };
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

const RECIPE_BATCH = 100; // recipes per text batch
const PHOTO_BATCH = 20;   // photos per upload batch

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
  const { inOnboarding } = loaderData;
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
    setStep("done");
  }

  // ─── Step 3 (optional): Upload photos in batches ────────────────────────
  async function handlePhotoUpload() {
    const withPhotos = parsedRecipes.filter((r) => r.photo_data);
    if (withPhotos.length === 0) return;

    setStep("uploading-photos");
    const allErrors: string[] = [];
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
      }

      setProgress((p) => ({
        ...p,
        photosUploaded: uploaded,
        errors: [...p.errors, ...allErrors],
      }));
    }

    setStep("done");
  }

  // ─── Render ─────────────────────────────────────────────────────────────
  const photosAvailable = parsedRecipes.filter((r) => r.photo_data).length;

  return (
    <div className="min-h-screen bg-background">
      <header className="sticky top-0 z-10 bg-background/95 backdrop-blur border-b">
        <div className="max-w-2xl mx-auto px-4 h-14 flex items-center gap-3">
          <Link to="/recipes" className="text-muted-foreground hover:text-foreground text-sm">
            ← Recipes
          </Link>
          <span className="text-muted-foreground">/</span>
          <span className="font-medium text-sm">Import from Paprika</span>
        </div>
      </header>

      <main className="max-w-2xl mx-auto px-4 py-8 space-y-6">
        <div>
          <h1 className="text-2xl font-bold">Import Paprika Recipes</h1>
          <p className="text-muted-foreground mt-1 text-sm">
            Export your library from Paprika 3 as a <code className="font-mono text-xs bg-muted px-1 py-0.5 rounded">.paprikarecipes</code> file,
            then select it below. Recipes are parsed in your browser — no large upload needed.
          </p>
        </div>

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
              Import {progress.total.toLocaleString()} Recipes
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
          <div className="space-y-4">
            <div className="rounded-lg border bg-card px-5 py-4 space-y-2">
              <p className="text-sm font-semibold text-green-700">
                ✓ Import complete
              </p>
              <ul className="text-sm text-muted-foreground space-y-0.5">
                <li><strong>{progress.imported.toLocaleString()}</strong> recipes imported</li>
                {progress.skipped > 0 && (
                  <li><strong>{progress.skipped.toLocaleString()}</strong> already existed (skipped)</li>
                )}
                {progress.photosUploaded > 0 && (
                  <li><strong>{progress.photosUploaded.toLocaleString()}</strong> photos uploaded</li>
                )}
              </ul>
            </div>

            {/* Photo upload CTA */}
            {photosAvailable > 0 && progress.photosUploaded === 0 && (
              <div className="rounded-lg border px-5 py-4 space-y-3">
                <p className="text-sm font-medium">Upload recipe photos (optional)</p>
                <p className="text-sm text-muted-foreground">
                  {photosAvailable.toLocaleString()} photos are available. Uploading stores them
                  in R2 so they display even without an internet connection.
                </p>
                <button
                  onClick={handlePhotoUpload}
                  className="rounded-md border px-4 py-2 text-sm font-medium hover:bg-muted transition-colors"
                >
                  Upload {photosAvailable.toLocaleString()} Photos
                </button>
              </div>
            )}

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
              <span className="text-sm text-muted-foreground">Uploading photos…</span>
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
      </main>
    </div>
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
