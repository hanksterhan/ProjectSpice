/**
 * /imports/pdf
 *
 * Async PDF cookbook import: upload to R2, wait for OCR/AI structuring, then
 * reuse the guided review pattern before saving confirmed recipes.
 */

import { useMemo, useRef, useState } from "react";
import { Link, useNavigate } from "react-router";
import type { Route } from "./+types/imports.pdf";
import { requireUser } from "~/lib/auth.server";
import type { RecipeImportCandidate } from "~/lib/import-candidates";

type Step = "idle" | "uploading" | "processing" | "review" | "importing" | "done" | "error";

type UploadResult = {
  jobId: string;
  queued: boolean;
  candidates?: RecipeImportCandidate[];
};

type ImportResult = {
  imported: number;
  errors: string[];
  firstRecipeId: string | null;
};

export function meta() {
  return [{ title: "Import PDF cookbook — ProjectSpice" }];
}

export async function loader({ request, context }: Route.LoaderArgs) {
  await requireUser(request, context);
  return null;
}

export default function ImportPdf() {
  const navigate = useNavigate();
  const inputRef = useRef<HTMLInputElement>(null);
  const [step, setStep] = useState<Step>("idle");
  const [jobId, setJobId] = useState<string | null>(null);
  const [candidates, setCandidates] = useState<RecipeImportCandidate[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [cookbookName, setCookbookName] = useState("");
  const [bulkTag, setBulkTag] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<ImportResult | null>(null);

  const selectedCandidate = candidates.find((c) => c.id === selectedId) ?? candidates[0] ?? null;
  const checkedCount = useMemo(() => candidates.filter((c) => c.checked).length, [candidates]);

  async function handleFileChange(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;

    setStep("uploading");
    setError(null);
    setCookbookName(file.name.replace(/\.pdf$/i, "").replace(/[-_]+/g, " "));

    const formData = new FormData();
    formData.append("file", file);
    const response = await fetch("/api/imports/pdf", { method: "POST", body: formData });
    const data = (await response.json()) as UploadResult | { error: string };
    if (!response.ok || "error" in data) {
      setStep("error");
      setError("error" in data ? data.error : "PDF upload failed.");
      return;
    }

    setJobId(data.jobId);
    if (data.candidates) {
      openReview(data.candidates);
      return;
    }
    setStep("processing");
    void pollForCandidates(data.jobId);
  }

  async function pollForCandidates(id: string) {
    for (let attempt = 0; attempt < 90; attempt++) {
      await new Promise((resolve) => setTimeout(resolve, attempt < 5 ? 1000 : 2500));
      const response = await fetch(`/api/imports/pdf/${id}`);
      const data = (await response.json()) as {
        status: string;
        candidates: RecipeImportCandidate[];
        errors?: string[] | null;
      };
      if (data.status === "completed") {
        openReview(data.candidates);
        return;
      }
      if (data.status === "failed") {
        setStep("error");
        setError(data.errors?.[0] ?? "PDF OCR failed.");
        return;
      }
    }
    setStep("error");
    setError("PDF OCR is still running. Try refreshing this import later.");
  }

  function openReview(nextCandidates: RecipeImportCandidate[]) {
    if (nextCandidates.length === 0) {
      setStep("error");
      setError("No likely recipes found. Try another PDF or add the recipe manually.");
      return;
    }
    setCandidates(nextCandidates);
    setSelectedId(nextCandidates[0]?.id ?? null);
    setStep("review");
  }

  function updateCandidate(id: string, patch: Partial<RecipeImportCandidate>) {
    setCandidates((items) => items.map((item) => (item.id === id ? { ...item, ...patch } : item)));
  }

  function applyBulkTag() {
    const tag = bulkTag.trim();
    if (!tag) return;
    setCandidates((items) =>
      items.map((item) =>
        item.checked && !item.tags.includes(tag) ? { ...item, tags: [...item.tags, tag] } : item
      )
    );
    setBulkTag("");
  }

  async function handleImport() {
    const selected = candidates.filter((c) => c.checked);
    if (selected.length === 0) {
      setError("Select at least one recipe before importing.");
      return;
    }

    setStep("importing");
    setError(null);
    const response = await fetch("/api/imports/epub", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ sourceType: "pdf", cookbookName: cookbookName.trim(), recipes: selected }),
    });
    const data = (await response.json()) as ImportResult | { error: string };
    if (!response.ok || "error" in data) {
      setStep("review");
      setError("error" in data ? data.error : "Import failed.");
      return;
    }
    setResult(data);
    setStep("done");
  }

  return (
    <div className="min-h-screen bg-background">
      <header className="sticky top-0 z-10 bg-background/95 backdrop-blur border-b">
        <div className="max-w-6xl mx-auto px-4 h-14 flex items-center gap-3">
          <Link to="/recipes" className="text-muted-foreground hover:text-foreground text-sm">
            ← Recipes
          </Link>
          <span className="text-muted-foreground">/</span>
          <span className="font-medium text-sm">Import PDF cookbook</span>
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-4 py-6 space-y-5">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <h1 className="text-2xl font-bold">Import PDF Cookbook</h1>
            <p className="text-sm text-muted-foreground mt-1">
              Upload a PDF, review OCR-detected recipes, then import selected entries.
            </p>
          </div>
          {(step === "idle" || step === "error") && (
            <input
              ref={inputRef}
              type="file"
              accept=".pdf,application/pdf"
              onChange={handleFileChange}
              className="block w-full sm:w-auto text-sm text-muted-foreground file:mr-3 file:py-2 file:px-4 file:rounded-md file:border-0 file:text-sm file:font-medium file:bg-primary file:text-primary-foreground hover:file:bg-primary/90 cursor-pointer"
            />
          )}
        </div>

        {(step === "uploading" || step === "processing") && (
          <div className="flex items-center gap-3 py-8">
            <Spinner />
            <span className="text-sm text-muted-foreground">
              {step === "uploading" ? "Uploading PDF to R2…" : `Running OCR${jobId ? ` for job ${jobId.slice(0, 8)}` : ""}…`}
            </span>
          </div>
        )}

        {error && <div className="rounded-md bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>}

        {step === "review" && selectedCandidate && (
          <div className="space-y-4">
            <div className="rounded-lg border bg-card px-4 py-3 flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
              <div className="grid gap-3 sm:grid-cols-2">
                <label className="text-sm font-medium">
                  Cookbook
                  <input
                    value={cookbookName}
                    onChange={(e) => setCookbookName(e.target.value)}
                    className="mt-1 w-full rounded-md border bg-background px-3 py-2 text-sm"
                  />
                </label>
                <label className="text-sm font-medium">
                  Bulk tag selected
                  <div className="mt-1 flex gap-2">
                    <input
                      value={bulkTag}
                      onChange={(e) => setBulkTag(e.target.value)}
                      className="w-full rounded-md border bg-background px-3 py-2 text-sm"
                      placeholder="Weeknight"
                    />
                    <button type="button" onClick={applyBulkTag} className="rounded-md border px-3 py-2 text-sm font-medium hover:bg-muted">
                      Add
                    </button>
                  </div>
                </label>
              </div>
              <button
                type="button"
                onClick={handleImport}
                className="rounded-md bg-primary text-primary-foreground px-5 py-2 text-sm font-medium hover:bg-primary/90"
              >
                Import {checkedCount} Selected
              </button>
            </div>

            <div className="grid gap-4 lg:grid-cols-[minmax(260px,360px)_1fr]">
              <aside className="rounded-lg border bg-card overflow-hidden">
                <div className="px-4 py-3 border-b text-sm font-medium">
                  {candidates.length} candidates · {checkedCount} selected
                </div>
                <div className="max-h-[70vh] overflow-y-auto divide-y">
                  {candidates.map((candidate) => (
                    <button
                      type="button"
                      key={candidate.id}
                      onClick={() => setSelectedId(candidate.id)}
                      className={`w-full px-4 py-3 text-left hover:bg-muted/60 ${
                        candidate.id === selectedCandidate.id ? "bg-muted" : ""
                      }`}
                    >
                      <div className="flex items-start gap-3">
                        <input
                          type="checkbox"
                          checked={candidate.checked}
                          onChange={(e) => updateCandidate(candidate.id, { checked: e.target.checked })}
                          onClick={(e) => e.stopPropagation()}
                          className="mt-1"
                        />
                        <div className="min-w-0">
                          <p className="text-sm font-medium truncate">{candidate.title}</p>
                          <p className="text-xs text-muted-foreground">
                            {candidate.confidence}% confidence · {candidate.ingredients.length} ingredients
                          </p>
                        </div>
                      </div>
                    </button>
                  ))}
                </div>
              </aside>

              <RecipeEditor candidate={selectedCandidate} onChange={(patch) => updateCandidate(selectedCandidate.id, patch)} />
            </div>
          </div>
        )}

        {step === "importing" && (
          <div className="flex items-center gap-3 py-8">
            <Spinner />
            <span className="text-sm text-muted-foreground">Saving confirmed PDF recipes…</span>
          </div>
        )}

        {step === "done" && result && (
          <div className="rounded-lg border bg-card px-5 py-4 space-y-4 max-w-2xl">
            <div>
              <p className="font-semibold text-green-700">Import complete</p>
              <p className="text-sm text-muted-foreground mt-1">{result.imported} PDF recipes imported.</p>
            </div>
            <div className="flex gap-3">
              <button
                type="button"
                onClick={() => navigate(result.firstRecipeId ? `/recipes/${result.firstRecipeId}` : "/recipes")}
                className="rounded-md bg-primary text-primary-foreground px-4 py-2 text-sm font-medium hover:bg-primary/90"
              >
                View Imported Recipes
              </button>
              <button
                type="button"
                onClick={() => {
                  setStep("idle");
                  setCandidates([]);
                  setResult(null);
                  inputRef.current?.click();
                }}
                className="rounded-md border px-4 py-2 text-sm font-medium hover:bg-muted"
              >
                Import Another PDF
              </button>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}

function RecipeEditor({
  candidate,
  onChange,
}: {
  candidate: RecipeImportCandidate;
  onChange: (patch: Partial<RecipeImportCandidate>) => void;
}) {
  return (
    <section className="rounded-lg border bg-card p-4 space-y-4">
      <div className="grid gap-3 sm:grid-cols-[1fr_auto] sm:items-start">
        <label className="text-sm font-medium">
          Title
          <input
            value={candidate.title}
            onChange={(e) => onChange({ title: e.target.value })}
            className="mt-1 w-full rounded-md border bg-background px-3 py-2 text-sm"
          />
        </label>
        <div className="rounded-md border px-3 py-2 text-sm text-muted-foreground">
          {candidate.confidence}% · {candidate.sourcePath}
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <label className="text-sm font-medium">
          Ingredients
          <textarea
            value={candidate.ingredients.join("\n")}
            onChange={(e) => onChange({ ingredients: e.target.value.split("\n").map((line) => line.trim()).filter(Boolean) })}
            rows={16}
            className="mt-1 w-full rounded-md border bg-background px-3 py-2 text-sm font-mono"
          />
        </label>
        <label className="text-sm font-medium">
          Directions
          <textarea
            value={candidate.directions}
            onChange={(e) => onChange({ directions: e.target.value })}
            rows={16}
            className="mt-1 w-full rounded-md border bg-background px-3 py-2 text-sm"
          />
        </label>
      </div>

      <label className="text-sm font-medium block">
        Tags
        <input
          value={candidate.tags.join(", ")}
          onChange={(e) => onChange({ tags: e.target.value.split(",").map((tag) => tag.trim()).filter(Boolean) })}
          className="mt-1 w-full rounded-md border bg-background px-3 py-2 text-sm"
          placeholder="Dessert, Weeknight"
        />
      </label>
    </section>
  );
}

function Spinner() {
  return <div className="h-5 w-5 rounded-full border-2 border-muted border-t-primary animate-spin" />;
}
