/**
 * /imports/paprika-html
 *
 * Paprika HTML export importer:
 *   1. Select a ZIP of the Paprika HTML export folder (contains Recipes/*.html)
 *   2. Unzip + parse every HTML file in the browser (fflate + paprika-html-parser)
 *   3. Send parsed batches to /api/imports/paprika-html
 */

import { useRef, useState } from "react";
import { Link, useNavigate } from "react-router";
import { strFromU8, unzipSync } from "fflate";
import type { Route } from "./+types/imports.paprika-html";
import { requireUser } from "~/lib/auth.server";
import {
  parsePaprikaHtml,
  type PaprikaHtmlRecipe,
} from "~/lib/paprika-html-parser";

export function meta() {
  return [{ title: "Import Paprika HTML Export — ProjectSpice" }];
}

export async function loader({ request, context }: Route.LoaderArgs) {
  await requireUser(request, context);
  return {};
}

// ─── Types ────────────────────────────────────────────────────────────────────

type Step =
  | "idle"
  | "parsing"
  | "parsed"
  | "importing"
  | "done"
  | "error";

type Progress = {
  imported: number;
  skipped: number;
  total: number;
  errors: string[];
  jobId: string;
};

const RECIPE_BATCH = 50;

// ─── Component ───────────────────────────────────────────────────────────────

export default function ImportPaprikaHtml() {
  const navigate = useNavigate();
  const inputRef = useRef<HTMLInputElement>(null);

  const [step, setStep] = useState<Step>("idle");
  const [parsedRecipes, setParsedRecipes] = useState<PaprikaHtmlRecipe[]>([]);
  const [progress, setProgress] = useState<Progress>({
    imported: 0,
    skipped: 0,
    total: 0,
    errors: [],
    jobId: "",
  });

  // ─── Step 1: Unzip + parse in browser ──────────────────────────────────────
  async function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;

    setStep("parsing");
    setProgress((p) => ({ ...p, errors: [] }));

    try {
      const buffer = await file.arrayBuffer();
      const entries = unzipSync(new Uint8Array(buffer));

      const recipes: PaprikaHtmlRecipe[] = [];
      const parseErrors: string[] = [];

      for (const [path, bytes] of Object.entries(entries)) {
        // Accept Recipes/*.html at any nesting level
        if (!path.toLowerCase().endsWith(".html")) continue;
        const parts = path.split("/");
        const dirName = parts[parts.length - 2]?.toLowerCase();
        if (dirName !== "recipes") continue;

        const filename = parts[parts.length - 1];
        let html: string;
        try {
          html = strFromU8(bytes);
        } catch {
          parseErrors.push(`${filename}: could not decode UTF-8`);
          continue;
        }

        const recipe = parsePaprikaHtml(html, filename);
        if (!recipe) {
          parseErrors.push(`${filename}: no recipe title found — skipped`);
          continue;
        }
        recipes.push(recipe);
      }

      if (recipes.length === 0) {
        setStep("error");
        setProgress((p) => ({
          ...p,
          errors: [
            "No recipe HTML files found.",
            "Make sure you selected the ZIP of the Paprika HTML export folder (not the .paprikarecipes binary).",
            ...parseErrors,
          ],
        }));
        return;
      }

      setParsedRecipes(recipes);
      setProgress((p) => ({ ...p, total: recipes.length, errors: parseErrors }));
      setStep("parsed");
    } catch (err) {
      setStep("error");
      setProgress((p) => ({
        ...p,
        errors: [`Failed to unzip: ${String(err)}`],
      }));
    }
  }

  // ─── Step 2: Import in batches ─────────────────────────────────────────────
  async function handleImport() {
    setStep("importing");
    const allErrors: string[] = [...progress.errors];
    let totalImported = 0;
    let totalSkipped = 0;
    let jobId = "";

    for (let i = 0; i < parsedRecipes.length; i += RECIPE_BATCH) {
      const batch = parsedRecipes.slice(i, i + RECIPE_BATCH);
      try {
        const res = await fetch("/api/imports/paprika-html", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            recipes: batch,
            jobId: jobId || undefined,
            expectedTotal: parsedRecipes.length,
          }),
        });
        const data = (await res.json()) as {
          jobId: string;
          imported: number;
          skipped: number;
          errors: string[];
        };
        if (!jobId) jobId = data.jobId;
        totalImported += data.imported;
        totalSkipped += data.skipped;
        if (data.errors?.length) allErrors.push(...data.errors);
      } catch (err) {
        allErrors.push(`Batch ${i}–${i + RECIPE_BATCH} failed: ${String(err)}`);
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

  // ─── Render ─────────────────────────────────────────────────────────────────
  return (
    <div className="min-h-screen bg-background">
      <header className="sticky top-0 z-10 bg-background/95 backdrop-blur border-b">
        <div className="max-w-2xl mx-auto px-4 h-14 flex items-center gap-3">
          <Link
            to="/recipes"
            className="text-muted-foreground hover:text-foreground text-sm"
          >
            ← Recipes
          </Link>
          <span className="text-muted-foreground">/</span>
          <span className="font-medium text-sm">Import Paprika HTML Export</span>
        </div>
      </header>

      <main className="max-w-2xl mx-auto px-4 py-8 space-y-6">
        <div>
          <h1 className="text-2xl font-bold">Import Paprika HTML Export</h1>
          <p className="text-muted-foreground mt-1 text-sm">
            Use this if you exported your Paprika library as an{" "}
            <strong>HTML folder</strong>. For the native{" "}
            <code className="font-mono text-xs bg-muted px-1 py-0.5 rounded">
              .paprikarecipes
            </code>{" "}
            binary format,{" "}
            <Link to="/imports/paprika" className="underline underline-offset-2">
              use the binary importer
            </Link>{" "}
            instead — it preserves photos and ratings more completely.
          </p>
        </div>

        {/* File picker */}
        {(step === "idle" || step === "error") && (
          <div className="space-y-3">
            <label htmlFor="file" className="block text-sm font-medium">
              Select Paprika HTML export ZIP
            </label>
            <input
              id="file"
              ref={inputRef}
              type="file"
              accept=".zip"
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
            <span className="text-sm text-muted-foreground">
              Unzipping and parsing HTML files…
            </span>
          </div>
        )}

        {/* Parsed preview */}
        {step === "parsed" && (
          <div className="space-y-4">
            <div className="rounded-lg border bg-card px-5 py-4 space-y-1">
              <p className="text-sm font-medium">Export parsed successfully</p>
              <p className="text-sm text-muted-foreground">
                <strong>{progress.total.toLocaleString()}</strong> recipes found
              </p>
              {progress.errors.length > 0 && (
                <p className="text-xs text-amber-600">
                  {progress.errors.length} file
                  {progress.errors.length !== 1 ? "s" : ""} skipped (see warnings
                  below)
                </p>
              )}
            </div>

            <div className="rounded-lg border bg-amber-50 px-4 py-3 text-xs text-amber-700 space-y-1">
              <p className="font-medium">About photos</p>
              <p>
                Photos inside the ZIP are not uploaded automatically. If you have
                the binary{" "}
                <code className="font-mono bg-amber-100 px-0.5 rounded">
                  .paprikarecipes
                </code>{" "}
                file, use the binary importer to include photos.
              </p>
            </div>

            <button
              onClick={handleImport}
              className="rounded-md bg-primary text-primary-foreground px-6 py-2.5 text-sm font-medium hover:bg-primary/90 transition-colors"
            >
              Import {progress.total.toLocaleString()} Recipes
            </button>

            {progress.errors.length > 0 && (
              <WarningList errors={progress.errors} />
            )}
          </div>
        )}

        {/* Import progress */}
        {step === "importing" && (
          <div className="space-y-4">
            <div className="flex items-center gap-3">
              <Spinner />
              <span className="text-sm text-muted-foreground">
                Importing recipes…
              </span>
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
                <li>
                  <strong>{progress.imported.toLocaleString()}</strong> recipes
                  imported
                </li>
                {progress.skipped > 0 && (
                  <li>
                    <strong>{progress.skipped.toLocaleString()}</strong> already
                    existed (skipped)
                  </li>
                )}
              </ul>
            </div>

            {progress.errors.length > 0 && (
              <WarningList errors={progress.errors} />
            )}

            <div className="flex gap-3 pt-2">
              <button
                onClick={() => navigate("/recipes")}
                className="rounded-md bg-primary text-primary-foreground px-6 py-2.5 text-sm font-medium hover:bg-primary/90 transition-colors"
              >
                View My Recipes
              </button>
              <button
                onClick={() => {
                  setStep("idle");
                  setParsedRecipes([]);
                  setProgress({
                    imported: 0,
                    skipped: 0,
                    total: 0,
                    errors: [],
                    jobId: "",
                  });
                  if (inputRef.current) inputRef.current.value = "";
                }}
                className="rounded-md border px-4 py-2.5 text-sm hover:bg-muted transition-colors"
              >
                Import Another File
              </button>
            </div>
          </div>
        )}

        {/* How-to instructions (idle only) */}
        {step === "idle" && (
          <div className="rounded-lg border bg-muted/30 px-5 py-4 space-y-2 text-sm text-muted-foreground">
            <p className="font-medium text-foreground">
              How to export as HTML from Paprika 3
            </p>
            <ol className="list-decimal pl-4 space-y-1">
              <li>Open Paprika 3 on Mac</li>
              <li>
                Go to <strong>File → Export…</strong>
              </li>
              <li>
                Choose <strong>Web Page</strong> (HTML) format
              </li>
              <li>
                Save the folder, then <strong>ZIP the Recipes subfolder only</strong>{" "}
                (not the full export with images) and select it above
              </li>
            </ol>
            <p className="pt-1">
              Tip: the binary{" "}
              <code className="font-mono text-xs bg-muted px-1 py-0.5 rounded">
                .paprikarecipes
              </code>{" "}
              format preserves photos and ratings. Use that if you can.
            </p>
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
      <circle
        className="opacity-25"
        cx="12"
        cy="12"
        r="10"
        stroke="currentColor"
        strokeWidth="4"
      />
      <path
        className="opacity-75"
        fill="currentColor"
        d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
      />
    </svg>
  );
}

function ProgressBar({
  current,
  total,
  label,
}: {
  current: number;
  total: number;
  label: string;
}) {
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

function WarningList({ errors }: { errors: string[] }) {
  return (
    <details className="rounded-md border px-4 py-3 text-sm">
      <summary className="cursor-pointer font-medium text-amber-700">
        {errors.length} warning{errors.length !== 1 ? "s" : ""}
      </summary>
      <ul className="mt-2 space-y-1 text-muted-foreground text-xs list-disc pl-4">
        {errors.slice(0, 20).map((e, i) => (
          <li key={i}>{e}</li>
        ))}
        {errors.length > 20 && (
          <li>…and {errors.length - 20} more</li>
        )}
      </ul>
    </details>
  );
}
