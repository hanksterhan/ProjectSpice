export function appImageUrl(imageKey: string | null | undefined): string | null {
  if (!imageKey) return null;
  return `/cdn/images/${imageKey}`;
}
