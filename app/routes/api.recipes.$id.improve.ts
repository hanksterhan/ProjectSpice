/**
 * SSE endpoint: POST /api/recipes/:id/improve
 *
 * Body (JSON): { profileId: string }
 *
 * Streams SSE events:
 *   data: {"type":"start"}
 *   data: {"type":"result","improved":{...},"provider":"...","fromCache":bool}
 *   data: {"type":"error","message":"...","tosError"?:true,"quotaExceeded"?:true}
 *   data: {"type":"done"}
 */

import { data } from "react-router";
import { and, eq, isNull, asc } from "drizzle-orm";
import type { Route } from "./+types/api.recipes.$id.improve";
import { requireUser } from "~/lib/auth.server";
import { createDb, schema } from "~/db";
import {
  improveRecipe,
  type ImprovementEnv,
} from "~/lib/ai-improve.server";
import type { RecipeInput } from "~/lib/ai-improve.shared";

function sseEvent(payload: Record<string, unknown>): string {
  return `data: ${JSON.stringify(payload)}\n\n`;
}

function today(): string {
  return new Date().toISOString().slice(0, 10);
}

export async function action({ params, request, context }: Route.ActionArgs) {
  const user = await requireUser(request, context);
  const env = context.cloudflare.env;

  let profileId: string;
  try {
    const body = (await request.json()) as { profileId?: string };
    profileId = String(body.profileId ?? "").trim();
  } catch {
    throw data({ error: "Invalid JSON body" }, { status: 400 });
  }

  if (!profileId) {
    throw data({ error: "profileId is required" }, { status: 400 });
  }

  const { db } = createDb(env.DB);

  // Load recipe + ingredients (ownership check)
  const [recipeRows, ingredientRows, profileRows] = await Promise.all([
    db
      .select()
      .from(schema.recipes)
      .where(
        and(
          eq(schema.recipes.id, params.id),
          eq(schema.recipes.userId, user.id),
          isNull(schema.recipes.deletedAt)
        )
      )
      .limit(1),
    db
      .select()
      .from(schema.ingredients)
      .where(eq(schema.ingredients.recipeId, params.id))
      .orderBy(asc(schema.ingredients.sortOrder)),
    db
      .select()
      .from(schema.aiProfiles)
      .where(
        and(
          eq(schema.aiProfiles.id, profileId),
          eq(schema.aiProfiles.userId, user.id)
        )
      )
      .limit(1),
  ]);

  if (!recipeRows[0]) {
    throw data({ error: "Recipe not found" }, { status: 404 });
  }
  if (!profileRows[0]) {
    throw data({ error: "Profile not found" }, { status: 404 });
  }

  const recipe = recipeRows[0];
  const profile = profileRows[0];

  const recipeInput: RecipeInput = {
    id: recipe.id,
    title: recipe.title,
    description: recipe.description ?? null,
    directionsText: recipe.directionsText ?? null,
    notes: recipe.notes ?? null,
    contentHash: recipe.contentHash ?? null,
    ingredients: ingredientRows.map((i) => ({
      sortOrder: i.sortOrder,
      groupName: i.groupName ?? null,
      quantityRaw: i.quantityRaw ?? null,
      unitRaw: i.unitRaw ?? null,
      name: i.name,
      notes: i.notes ?? null,
      isGroupHeader: i.isGroupHeader,
    })),
  };

  const improvementEnv: ImprovementEnv = {
    kv: env.SESSIONS,
    anthropicToken: env.ANTHROPIC_OAUTH_TOKEN || undefined,
    openaiToken: env.OPENAI_CODEX_TOKEN || undefined,
    // Workers AI would need a Queue consumer or service binding in this app.
    // Until that is wired, this endpoint uses the Anthropic/OpenAI token chain directly.
    callWorkersAI: null,
  };

  const { readable, writable } = new TransformStream<Uint8Array, Uint8Array>();
  const writer = writable.getWriter();
  const encoder = new TextEncoder();

  const write = (payload: Record<string, unknown>) =>
    writer.write(encoder.encode(sseEvent(payload)));

  // Run improvement async so we can return the stream immediately
  (async () => {
    try {
      await write({ type: "start" });

      const result = await improveRecipe(
        recipeInput,
        { id: profile.id, systemPrompt: profile.systemPrompt },
        improvementEnv,
        user.id,
        today()
      );

      // Persist to ai_runs (best-effort, don't block response)
      try {
        await db.insert(schema.aiRuns).values({
          userId: user.id,
          recipeId: recipe.id,
          profileId: profile.id,
          requestHash: recipe.contentHash ?? recipe.id,
          responseJson: result.improved as unknown as Record<string, unknown>,
          tokensIn: result.tokensIn,
          tokensOut: result.tokensOut,
          neuronCount: result.tokensIn + result.tokensOut,
          usdCents: 0,
        });
      } catch {
        // non-blocking
      }

      await write({
        type: "result",
        improved: result.improved,
        provider: result.provider,
        fromCache: result.fromCache,
      });
    } catch (e) {
      const err = e as Error & { quotaExceeded?: boolean; tosError?: boolean };
      await write({
        type: "error",
        message: err.message,
        quotaExceeded: err.quotaExceeded ?? false,
        tosError: err.tosError ?? false,
      });
    } finally {
      await write({ type: "done" });
      await writer.close();
    }
  })();

  return new Response(readable as unknown as BodyInit, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
    },
  });
}
