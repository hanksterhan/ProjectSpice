/**
 * POST /api/imports/paprika/photos
 *
 * Accepts batches of { paprikaUid, base64 } pairs from the browser, decodes
 * each photo, uploads it to R2, and updates the recipe's image_key.
 *
 * Request body: { photos: Array<{ paprikaUid: string; base64: string }> }
 * Response:     { uploaded: number; errors: string[] }
 */

import { and, eq, isNull } from "drizzle-orm";
import type { Route } from "./+types/api.imports.paprika.photos";
import { requireUser } from "~/lib/auth.server";
import { createDb, schema } from "~/db";

type PhotoItem = { paprikaUid: string; base64: string };
type PhotoPayload = { photos: PhotoItem[] };

export async function action({ request, context }: Route.ActionArgs): Promise<Response> {
  if (request.method !== "POST") {
    return new Response("Method Not Allowed", { status: 405 });
  }

  const user = await requireUser(request, context);

  let payload: PhotoPayload;
  try {
    payload = (await request.json()) as PhotoPayload;
  } catch {
    return Response.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const { photos } = payload;
  if (!Array.isArray(photos) || photos.length === 0) {
    return Response.json({ uploaded: 0, errors: [] });
  }

  const { db } = createDb(context.cloudflare.env.DB);
  const errors: string[] = [];
  let uploaded = 0;

  for (const item of photos) {
    if (!item.paprikaUid || !item.base64) continue;

    try {
      // Look up the recipe for this user by paprika_original_id
      const [recipe] = await db
        .select({ id: schema.recipes.id })
        .from(schema.recipes)
        .where(
          and(
            eq(schema.recipes.userId, user.id),
            eq(schema.recipes.paprikaOriginalId, item.paprikaUid),
            isNull(schema.recipes.deletedAt)
          )
        )
        .limit(1);

      if (!recipe) {
        errors.push(`No recipe found for uid ${item.paprikaUid}`);
        continue;
      }

      // Decode base64 → binary bytes
      const binaryStr = atob(item.base64);
      const bytes = new Uint8Array(binaryStr.length);
      for (let i = 0; i < binaryStr.length; i++) {
        bytes[i] = binaryStr.charCodeAt(i);
      }

      const imageKey = `images/${user.id}/${recipe.id}.jpg`;

      await context.cloudflare.env.IMAGES.put(imageKey, bytes, {
        httpMetadata: { contentType: "image/jpeg" },
      });

      await db
        .update(schema.recipes)
        .set({ imageKey, updatedAt: new Date() })
        .where(eq(schema.recipes.id, recipe.id));

      uploaded++;
    } catch (err) {
      errors.push(`Photo upload failed for uid ${item.paprikaUid}: ${String(err)}`);
    }
  }

  return Response.json({ uploaded, errors });
}
