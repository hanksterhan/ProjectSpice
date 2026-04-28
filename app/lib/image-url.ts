export type AppImageFormat = "webp" | "jpeg" | "png";

export type AppImageVariantOptions = {
  width?: number;
  format?: AppImageFormat;
};

export function appImageUrl(
  imageKey: string | null | undefined,
  options: AppImageVariantOptions = {}
): string | null {
  if (!imageKey) return null;
  const params = new URLSearchParams();
  if (options.width) params.set("w", String(options.width));
  if (options.format) params.set("format", options.format);

  const query = params.toString();
  return `/cdn/images/${imageKey}${query ? `?${query}` : ""}`;
}

export function appImageSrcSet(
  imageKey: string | null | undefined,
  widths: number[],
  format: AppImageFormat = "webp"
): string | undefined {
  const entries = widths
    .map((width) => {
      const url = appImageUrl(imageKey, { width, format });
      return url ? `${url} ${width}w` : null;
    })
    .filter(Boolean);

  return entries.length > 0 ? entries.join(", ") : undefined;
}
