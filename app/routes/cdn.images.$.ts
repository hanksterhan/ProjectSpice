import type { Route } from "./+types/cdn.images.$";

export async function loader({ params, context }: Route.LoaderArgs): Promise<Response> {
  const key = params["*"];
  if (!key) return new Response("Not Found", { status: 404 });

  const object = await context.cloudflare.env.IMAGES.get(key);
  if (!object) return new Response("Not Found", { status: 404 });

  const contentType = object.httpMetadata?.contentType ?? "image/jpeg";

  return new Response(object.body, {
    headers: {
      "Content-Type": contentType,
      "Cache-Control": "public, max-age=31536000, immutable",
      ETag: `"${object.etag}"`,
    },
  });
}
