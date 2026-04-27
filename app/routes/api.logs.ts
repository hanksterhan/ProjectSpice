import type { Route } from "./+types/api.logs";
import { requireUser } from "~/lib/auth.server";
import { createDb } from "~/db";
import { createCookingLog, type CookingLogPayload } from "~/lib/cooking-log.server";

export async function action({ request, context }: Route.ActionArgs): Promise<Response> {
  if (request.method !== "POST") {
    return new Response("Method Not Allowed", { status: 405 });
  }

  const user = await requireUser(request, context);

  let payload: CookingLogPayload;
  try {
    payload = (await request.json()) as CookingLogPayload;
  } catch {
    return Response.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const { db } = createDb(context.cloudflare.env.DB);
  const result = await createCookingLog(db, user.id, payload);

  if (!result.ok) {
    return Response.json({ error: result.error }, { status: result.status });
  }

  return Response.json({
    logId: result.logId,
    status: result.status,
  });
}
