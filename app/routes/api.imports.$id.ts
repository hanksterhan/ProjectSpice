/**
 * GET /api/imports/:id
 *
 * Returns the current status of an import job.
 */

import { and, eq } from "drizzle-orm";
import type { Route } from "./+types/api.imports.$id";
import { requireUser } from "~/lib/auth.server";
import { createDb, schema } from "~/db";

export async function loader({ params, request, context }: Route.LoaderArgs): Promise<Response> {
  const user = await requireUser(request, context);
  const { id } = params;

  if (!id) return Response.json({ error: "Missing job id" }, { status: 400 });

  const { db } = createDb(context.cloudflare.env.DB);
  const [job] = await db
    .select()
    .from(schema.importJobs)
    .where(
      and(
        eq(schema.importJobs.id, id),
        eq(schema.importJobs.userId, user.id)
      )
    )
    .limit(1);

  if (!job) return Response.json({ error: "Job not found" }, { status: 404 });

  return Response.json({
    id: job.id,
    status: job.status,
    sourceType: job.sourceType,
    recipeCountExpected: job.recipeCountExpected,
    recipeCountImported: job.recipeCountImported,
    startedAt: job.startedAt,
    completedAt: job.completedAt,
    errors: job.errorLogJson,
  });
}
