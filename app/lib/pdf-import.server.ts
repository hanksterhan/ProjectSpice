import { createDb, schema } from "~/db";
import { eq } from "drizzle-orm";
import type { RecipeImportCandidate } from "~/lib/import-candidates";

export type PdfRecipeCandidate = RecipeImportCandidate;

export type PdfImportMessage = {
  jobId: string;
  userId: string;
  fileR2Key: string;
  candidateR2Key: string;
};

type PdfImportEnv = Env & {
  PDF_OCR_ENDPOINT?: string;
  PDF_OCR_API_KEY?: string;
  AI?: {
    run: (model: string, input: unknown) => Promise<unknown>;
  };
};

const CANDIDATE_MODEL = "@cf/meta/llama-3.1-8b-instruct";

export async function processPdfImportJob(env: PdfImportEnv, message: PdfImportMessage): Promise<void> {
  const { db } = createDb(env.DB);

  try {
    await db
      .update(schema.importJobs)
      .set({ status: "processing", startedAt: new Date() })
      .where(eq(schema.importJobs.id, message.jobId));

    const object = await env.IMAGES.get(message.fileR2Key);
    if (!object) throw new Error("PDF upload was not found in R2.");

    const pdfBytes = new Uint8Array(await object.arrayBuffer());
    const rawText = await extractPdfText(env, pdfBytes);
    const candidates = await structurePdfCandidates(env, rawText, message.fileR2Key);

    await env.IMAGES.put(message.candidateR2Key, JSON.stringify({ candidates, rawTextLength: rawText.length }), {
      httpMetadata: { contentType: "application/json" },
    });

    await db
      .update(schema.importJobs)
      .set({
        status: "completed",
        recipeCountExpected: candidates.length,
        recipeCountImported: 0,
        completedAt: new Date(),
        errorLogJson: candidates.length ? null : ["No likely recipes found in OCR text."],
      })
      .where(eq(schema.importJobs.id, message.jobId));
  } catch (error) {
    await db
      .update(schema.importJobs)
      .set({
        status: "failed",
        completedAt: new Date(),
        errorLogJson: [error instanceof Error ? error.message : String(error)],
      })
      .where(eq(schema.importJobs.id, message.jobId));
    throw error;
  }
}

export async function extractPdfText(env: PdfImportEnv, pdfBytes: Uint8Array): Promise<string> {
  if (env.PDF_OCR_ENDPOINT) {
    const response = await fetch(env.PDF_OCR_ENDPOINT, {
      method: "POST",
      headers: {
        "Content-Type": "application/pdf",
        ...(env.PDF_OCR_API_KEY ? { Authorization: `Bearer ${env.PDF_OCR_API_KEY}` } : {}),
      },
      body: toArrayBuffer(pdfBytes),
    });
    if (!response.ok) throw new Error(`OCR service failed with ${response.status}`);
    const contentType = response.headers.get("content-type") ?? "";
    if (contentType.includes("application/json")) {
      const data = (await response.json()) as { text?: string; rawText?: string };
      return (data.text ?? data.rawText ?? "").trim();
    }
    return (await response.text()).trim();
  }

  return extractEmbeddedPdfText(pdfBytes);
}

export async function structurePdfCandidates(
  env: PdfImportEnv,
  rawText: string,
  sourcePath: string
): Promise<PdfRecipeCandidate[]> {
  const trimmed = rawText.trim();
  if (!trimmed) return [];

  if (env.AI?.run) {
    try {
      const response = await env.AI.run(CANDIDATE_MODEL, {
        messages: [
          {
            role: "system",
            content:
              "Extract cookbook recipes from OCR text. Return only JSON: {\"recipes\":[{\"title\":\"\",\"ingredients\":[\"\"],\"directions\":\"\",\"notes\":null,\"tags\":[],\"confidence\":0}]}",
          },
          { role: "user", content: trimmed.slice(0, 24000) },
        ],
      });
      const parsed = parseAiRecipeResponse(response, sourcePath);
      if (parsed.length > 0) return parsed;
    } catch {
      // Fall back to deterministic structuring for local/dev reliability.
    }
  }

  return heuristicCandidates(trimmed, sourcePath);
}

function extractEmbeddedPdfText(pdfBytes: Uint8Array): string {
  const text = new TextDecoder("latin1", { fatal: false }).decode(pdfBytes);
  const chunks: string[] = [];
  const literalRe = /\(((?:\\.|[^\\)]){2,})\)\s*Tj/g;
  const arrayRe = /\[((?:\s*\((?:\\.|[^\\)])*\)\s*)+)\]\s*TJ/g;
  let match: RegExpExecArray | null;

  while ((match = literalRe.exec(text))) chunks.push(unescapePdfString(match[1]));
  while ((match = arrayRe.exec(text))) {
    const strings = [...match[1].matchAll(/\(((?:\\.|[^\\)])*)\)/g)].map((m) => unescapePdfString(m[1]));
    chunks.push(strings.join(""));
  }

  return normaliseOcrText(chunks.join("\n"));
}

function parseAiRecipeResponse(response: unknown, sourcePath: string): PdfRecipeCandidate[] {
  const content =
    typeof response === "string"
      ? response
      : typeof response === "object" && response
        ? String(
            (response as { response?: unknown; result?: { response?: unknown } }).response ??
              (response as { result?: { response?: unknown } }).result?.response ??
              ""
          )
        : "";
  const jsonText = content.match(/\{[\s\S]*\}/)?.[0] ?? "";
  if (!jsonText) return [];
  const data = JSON.parse(jsonText) as { recipes?: Partial<PdfRecipeCandidate>[] };
  return (data.recipes ?? [])
    .map((recipe, index) => candidateFromPartial(recipe, sourcePath, index))
    .filter((candidate): candidate is PdfRecipeCandidate => candidate !== null);
}

function heuristicCandidates(rawText: string, sourcePath: string): PdfRecipeCandidate[] {
  const blocks = rawText
    .split(/\n{2,}(?=[A-Z][^\n]{3,80}\n)/)
    .map((block) => block.trim())
    .filter(Boolean);

  return blocks
    .map((block, index) => candidateFromBlock(block, sourcePath, index))
    .filter((candidate): candidate is PdfRecipeCandidate => candidate !== null);
}

function candidateFromBlock(block: string, sourcePath: string, index: number): PdfRecipeCandidate | null {
  const lines = block.split("\n").map((line) => line.trim()).filter(Boolean);
  if (lines.length < 3) return null;

  const title = lines[0].replace(/^\d+\s+/, "").trim();
  const ingredientIndex = lines.findIndex((line) => /^ingredients:?$/i.test(line));
  const directionIndex = lines.findIndex((line) => /^(directions|instructions|method|preparation):?$/i.test(line));
  const ingredientLines =
    ingredientIndex >= 0
      ? lines.slice(ingredientIndex + 1, directionIndex > ingredientIndex ? directionIndex : lines.length)
      : lines.slice(1).filter(looksLikeIngredient);
  const directions =
    directionIndex >= 0
      ? lines.slice(directionIndex + 1).join("\n")
      : lines.slice(1).filter((line) => !looksLikeIngredient(line)).join("\n");

  return candidateFromPartial(
    {
      title,
      ingredients: ingredientLines.filter((line) => !isSectionCue(line)).slice(0, 100),
      directions,
      confidence: scoreCandidate(ingredientLines, directions, ingredientIndex, directionIndex),
    },
    sourcePath,
    index
  );
}

function candidateFromPartial(
  recipe: Partial<PdfRecipeCandidate>,
  sourcePath: string,
  index: number
): PdfRecipeCandidate | null {
  const title = recipe.title?.trim();
  const ingredients = (recipe.ingredients ?? []).map((line) => line.trim()).filter(Boolean);
  const directions = recipe.directions?.trim() ?? "";
  if (!title || (ingredients.length === 0 && !directions)) return null;
  const confidence = Math.max(0, Math.min(100, Math.round(recipe.confidence ?? scoreCandidate(ingredients, directions))));

  return {
    id: stableId(`${sourcePath}:${index}:${title}`),
    title,
    sourcePath,
    confidence,
    checked: confidence >= 70,
    ingredients,
    directions,
    notes: recipe.notes?.trim() || null,
    tags: (recipe.tags ?? []).map((tag) => tag.trim()).filter(Boolean),
  };
}

function scoreCandidate(
  ingredients: string[],
  directions: string,
  ingredientIndex = -1,
  directionIndex = -1
): number {
  let confidence = 0;
  if (ingredientIndex >= 0) confidence += 35;
  if (directionIndex >= 0) confidence += 30;
  confidence += Math.min(ingredients.filter(looksLikeIngredient).length * 5, 25);
  if (directions.length > 40) confidence += 10;
  return confidence;
}

function looksLikeIngredient(line: string): boolean {
  return /^([\d¼½¾⅓⅔⅛⅜⅝⅞]+|a few|pinch|dash|one|two|three|four|five|six|seven|eight|nine|ten)\b/i.test(
    line.trim()
  );
}

function isSectionCue(line: string): boolean {
  return /^(ingredients|directions|instructions|method|preparation):?$/i.test(line.trim());
}

function normaliseOcrText(text: string): string {
  return text.replace(/\r/g, "\n").replace(/[ \t]+/g, " ").replace(/\n{3,}/g, "\n\n").trim();
}

function toArrayBuffer(bytes: Uint8Array): ArrayBuffer {
  const copy = new Uint8Array(bytes.byteLength);
  copy.set(bytes);
  return copy.buffer;
}

function unescapePdfString(value: string): string {
  return value
    .replace(/\\([nrtbf()\\])/g, (_, ch: string) => ({ n: "\n", r: "\r", t: "\t", b: "\b", f: "\f" })[ch] ?? ch)
    .replace(/\\(\d{1,3})/g, (_, octal: string) => String.fromCharCode(parseInt(octal, 8)));
}

function stableId(input: string): string {
  let hash = 0;
  for (let i = 0; i < input.length; i++) hash = (hash * 31 + input.charCodeAt(i)) | 0;
  return `pdf-${Math.abs(hash).toString(36)}`;
}
