/**
 * POST /api/imports/pdf
 *
 * Stores a PDF cookbook in R2 and starts the OCR/structuring job. Local/dev
 * falls back to inline processing when a Cloudflare Queue binding is absent.
 */

import type { Route } from "./+types/api.imports.pdf";
import { requireUser } from "~/lib/auth.server";
import { createDb, schema } from "~/db";
import { processPdfImportJob, type PdfImportMessage } from "~/lib/pdf-import.server";
import type { RecipeImportCandidate } from "~/lib/import-candidates";

type PdfQueueEnv = Env & {
  PDF_IMPORT_QUEUE?: Queue<PdfImportMessage>;
};

type CandidatePayload = {
  candidates: RecipeImportCandidate[];
  rawTextLength?: number;
};

export async function action({ request, context }: Route.ActionArgs): Promise<Response> {
  if (request.method !== "POST") return new Response("Method Not Allowed", { status: 405 });

  const user = await requireUser(request, context);
  const formData = await request.formData();
  const file = formData.get("file");
  if (!(file instanceof File) || file.size === 0) {
    return Response.json({ error: "Choose a PDF cookbook to import." }, { status: 400 });
  }
  if (!file.name.toLowerCase().endsWith(".pdf") && file.type !== "application/pdf") {
    return Response.json({ error: "PDF import accepts .pdf files only." }, { status: 400 });
  }

  const env = context.cloudflare.env as PdfQueueEnv;
  const { db } = createDb(env.DB);
  const jobId = crypto.randomUUID();
  const safeName = file.name.replace(/[^a-z0-9._-]+/gi, "-").replace(/^-+|-+$/g, "") || "cookbook.pdf";
  const fileR2Key = `imports/pdf/${user.id}/${jobId}/${safeName}`;
  const candidateR2Key = `imports/pdf/${user.id}/${jobId}/candidates.json`;

  await env.IMAGES.put(fileR2Key, await file.arrayBuffer(), {
    httpMetadata: { contentType: "application/pdf" },
  });
  await db.insert(schema.importJobs).values({
    id: jobId,
    userId: user.id,
    status: "pending",
    sourceType: "pdf",
    fileR2Key,
    startedAt: new Date(),
  });

  const message: PdfImportMessage = { jobId, userId: user.id, fileR2Key, candidateR2Key };
  if (env.PDF_IMPORT_QUEUE) {
    await env.PDF_IMPORT_QUEUE.send(message);
    return Response.json({ jobId, queued: true });
  }

  await processPdfImportJob(env, message);
  const candidatesObject = await env.IMAGES.get(candidateR2Key);
  const data: CandidatePayload = candidatesObject
    ? ((await candidatesObject.json()) as CandidatePayload)
    : { candidates: [] };
  return Response.json({ jobId, queued: false, ...data });
}
