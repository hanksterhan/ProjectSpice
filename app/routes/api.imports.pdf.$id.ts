/**
 * GET /api/imports/pdf/:id
 *
 * Returns structured PDF candidates once the OCR queue has completed.
 */

import { and, eq } from "drizzle-orm";
import type { Route } from "./+types/api.imports.pdf.$id";
import { createDb, schema } from "~/db";
import { requireUser } from "~/lib/auth.server";

export async function loader({ params, request, context }: Route.LoaderArgs): Promise<Response> {
  const user = await requireUser(request, context);
  const { id } = params;
  if (!id) return Response.json({ error: "Missing job id" }, { status: 400 });

  const { db } = createDb(context.cloudflare.env.DB);
  const [job] = await db
    .select()
    .from(schema.importJobs)
    .where(and(eq(schema.importJobs.id, id), eq(schema.importJobs.userId, user.id)))
    .limit(1);
  if (!job || job.sourceType !== "pdf") return Response.json({ error: "PDF import job not found" }, { status: 404 });

  if (job.status !== "completed") {
    return Response.json({
      id: job.id,
      status: job.status,
      errors: job.errorLogJson,
      candidates: [],
    });
  }

  const candidateR2Key = `imports/pdf/${user.id}/${id}/candidates.json`;
  const object = await context.cloudflare.env.IMAGES.get(candidateR2Key);
  if (!object) {
    return Response.json({ id: job.id, status: "failed", errors: ["Structured candidate file is missing."], candidates: [] });
  }

  const data = (await object.json()) as { candidates?: unknown[]; rawTextLength?: number };
  return Response.json({
    id: job.id,
    status: job.status,
    recipeCountExpected: job.recipeCountExpected,
    rawTextLength: data.rawTextLength ?? 0,
    errors: job.errorLogJson,
    candidates: data.candidates ?? [],
  });
}
