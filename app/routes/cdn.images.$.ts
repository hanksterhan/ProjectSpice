import type { Route } from "./+types/cdn.images.$";
import { PhotonImage, SamplingFilter, resize } from "@cf-wasm/photon/workerd";

const MAX_VARIANT_SOURCE_BYTES = 8 * 1024 * 1024;
const VARIANT_WIDTHS = new Set([96, 128, 192, 256, 384, 512, 768, 1024, 1280]);
const VARIANT_FORMATS = new Set(["webp", "jpeg", "png"]);

export async function loader({ params, request, context }: Route.LoaderArgs): Promise<Response> {
  const key = params["*"];
  if (!key) return new Response("Not Found", { status: 404 });

  const url = new URL(request.url);
  const variant = parseVariant(url);
  const variantKey = variant ? optimizedImageKey(key, variant.width, variant.format) : null;

  if (variant && variantKey) {
    const cached = await context.cloudflare.env.IMAGES.get(variantKey);
    if (cached) return imageResponse(cached, contentTypeForFormat(variant.format), true);
  }

  const object = await context.cloudflare.env.IMAGES.get(key);
  if (!object) return new Response("Not Found", { status: 404 });

  if (variant && variantKey && isOptimizable(object)) {
    const sourceBytes = new Uint8Array(await object.arrayBuffer());
    const optimized = optimizeImage(sourceBytes, variant.width, variant.format);
    if (optimized) {
      await context.cloudflare.env.IMAGES.put(variantKey, optimized.bytes, {
        httpMetadata: { contentType: optimized.contentType },
      });
      return bytesResponse(optimized.bytes, optimized.contentType, true);
    }
    return bytesResponse(sourceBytes, object.httpMetadata?.contentType ?? "image/jpeg", false);
  }

  return imageResponse(object, object.httpMetadata?.contentType ?? "image/jpeg", false);
}

function parseVariant(url: URL): { width: number; format: "webp" | "jpeg" | "png" } | null {
  const width = Number(url.searchParams.get("w"));
  const format = url.searchParams.get("format") ?? "webp";
  if (!VARIANT_WIDTHS.has(width)) return null;
  if (!VARIANT_FORMATS.has(format)) return null;
  return { width, format: format as "webp" | "jpeg" | "png" };
}

function optimizedImageKey(key: string, width: number, format: string): string {
  return `_optimized/w${width}/${format}/${key}`;
}

function contentTypeForFormat(format: string): string {
  if (format === "png") return "image/png";
  if (format === "jpeg") return "image/jpeg";
  return "image/webp";
}

function isOptimizable(object: R2ObjectBody): boolean {
  const contentType = object.httpMetadata?.contentType ?? "";
  const size = object.size ?? 0;
  return size <= MAX_VARIANT_SOURCE_BYTES && /^image\/(jpeg|png|webp)$/.test(contentType);
}

function optimizeImage(
  inputBytes: Uint8Array,
  targetWidth: number,
  format: "webp" | "jpeg" | "png"
): { bytes: Uint8Array; contentType: string } | null {
  let input: PhotonImage | null = null;
  let output: PhotonImage | null = null;

  try {
    input = PhotonImage.new_from_byteslice(inputBytes);
    const originalWidth = input.get_width();
    const originalHeight = input.get_height();
    const width = Math.min(targetWidth, originalWidth);
    const height = Math.max(1, Math.round((originalHeight * width) / originalWidth));
    output = resize(input, width, height, SamplingFilter.Lanczos3);

    if (format === "png") {
      return { bytes: output.get_bytes(), contentType: "image/png" };
    }
    if (format === "jpeg") {
      return { bytes: output.get_bytes_jpeg(85), contentType: "image/jpeg" };
    }
    return { bytes: output.get_bytes_webp(), contentType: "image/webp" };
  } catch {
    return null;
  } finally {
    output?.free();
    input?.free();
  }
}

function imageResponse(object: R2ObjectBody, contentType: string, optimized: boolean): Response {
  return new Response(object.body, {
    headers: imageHeaders(contentType, object.etag, optimized),
  });
}

function bytesResponse(bytes: Uint8Array, contentType: string, optimized: boolean): Response {
  const body = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
  return new Response(body, {
    headers: imageHeaders(contentType, null, optimized),
  });
}

function imageHeaders(contentType: string, etag: string | null, optimized: boolean): HeadersInit {
  return {
    "Content-Type": contentType,
    "Cache-Control": "public, max-age=31536000, immutable",
    "Vary": "Accept",
    "X-Image-Variant": optimized ? "optimized" : "original",
    ...(etag ? { ETag: `"${etag}"` } : {}),
  };
}
