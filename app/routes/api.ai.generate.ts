import { z } from "zod";

import type { Route } from "./+types/api.ai.generate";
import { recipeDraftSchema } from "~/modules/recipe-domain";
import {
  RecipeAiRateLimitError,
  formatOpenAiRecipeAiProviderError,
  getRecipeAiProviderOverride,
} from "~/server/ai";
import { getRecipeAiService } from "~/server/ai/recipe-ai.runtime";

const generateRequestSchema = z
  .object({
    prompt: z.string().trim().min(1),
    preferences: z.array(z.string().trim().min(1)).optional(),
    currentDraft: recipeDraftSchema.optional(),
    conversation: z
      .array(
        z
          .object({
            role: z.enum(["user", "assistant"]),
            content: z.string().trim().min(1),
          })
          .strict(),
      )
      .max(12)
      .optional(),
  })
  .strict();

export function loader() {
  return json({ error: "Method not allowed" }, 405);
}

export async function action({ request, context }: Route.ActionArgs) {
  const parsedBody = await parseJsonBody(request, generateRequestSchema);

  if (!parsedBody.ok) {
    return json({ error: parsedBody.error }, 400);
  }

  try {
    const result = await getRecipeAiService(
      context,
      getRecipeAiProviderOverride(request, context),
    ).generateRecipeDraft(
      parsedBody.data,
      {
        rateLimitKey: getRateLimitKey(request),
      },
    );

    return json(result);
  } catch (error) {
    return json(toAiErrorResponse(error), getAiErrorStatus(error));
  }
}

async function parseJsonBody<T>(
  request: Request,
  schema: z.ZodType<T>,
): Promise<{ ok: true; data: T } | { ok: false; error: string }> {
  try {
    return {
      ok: true,
      data: schema.parse(await request.json()),
    };
  } catch (error) {
    if (error instanceof z.ZodError) {
      return { ok: false, error: error.issues[0]?.message ?? "Invalid request." };
    }

    return { ok: false, error: "Invalid JSON body." };
  }
}

function getRateLimitKey(request: Request): string {
  return request.headers.get("CF-Connecting-IP") ?? "single-user";
}

function toAiErrorResponse(error: unknown) {
  return {
    error:
      error instanceof RecipeAiRateLimitError
        ? "AI rate limit exceeded. Try again later."
        : formatOpenAiRecipeAiProviderError(error) ?? "AI recipe generation failed.",
  };
}

function getAiErrorStatus(error: unknown): number {
  return error instanceof RecipeAiRateLimitError ? 429 : 502;
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "Content-Type": "application/json",
    },
  });
}
