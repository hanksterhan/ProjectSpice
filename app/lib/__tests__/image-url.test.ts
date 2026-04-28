import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { appImageSrcSet, appImageUrl } from "../image-url";

describe("appImageUrl", () => {
  it("routes app-owned image keys through the CDN image route", () => {
    expect(appImageUrl("recipes/recipe-1/hero.jpg")).toBe(
      "/cdn/images/recipes/recipe-1/hero.jpg"
    );
    expect(appImageUrl("logs/user/log/photo.webp")).toBe(
      "/cdn/images/logs/user/log/photo.webp"
    );
  });

  it("builds optimized variant URLs", () => {
    expect(appImageUrl("recipes/recipe-1/hero.jpg", { width: 384, format: "webp" })).toBe(
      "/cdn/images/recipes/recipe-1/hero.jpg?w=384&format=webp"
    );
  });

  it("builds responsive srcsets for optimized variants", () => {
    expect(appImageSrcSet("recipes/recipe-1/hero.jpg", [192, 384])).toBe(
      "/cdn/images/recipes/recipe-1/hero.jpg?w=192&format=webp 192w, /cdn/images/recipes/recipe-1/hero.jpg?w=384&format=webp 384w"
    );
    expect(appImageSrcSet(null, [192, 384])).toBeUndefined();
  });

  it("returns null for empty keys", () => {
    expect(appImageUrl(null)).toBeNull();
    expect(appImageUrl(undefined)).toBeNull();
  });
});

describe("image route normalization", () => {
  it("does not leave stale /images/ references in app source or the service worker", () => {
    const files = [
      "app/routes/cookbooks.$id.tsx",
      "app/routes/collections.$id.tsx",
      "app/routes/logs.$id.tsx",
      "app/routes/recipes.tsx",
      "public/sw.js",
    ];

    for (const file of files) {
      const source = readFileSync(resolve(process.cwd(), file), "utf8");
      expect(source, file).not.toMatch(/["'`]\/images\//);
    }
  });

  it("caches the canonical CDN image route offline", () => {
    const serviceWorker = readFileSync(resolve(process.cwd(), "public/sw.js"), "utf8");
    expect(serviceWorker).toContain('url.pathname.startsWith("/cdn/images/")');
    expect(serviceWorker).toContain("cacheFirst(request, IMAGE_CACHE");
  });

  it("serves cached optimized variants from the CDN image route", () => {
    const source = readFileSync(resolve(process.cwd(), "app/routes/cdn.images.$.ts"), "utf8");
    expect(source).toContain("@cf-wasm/photon/workerd");
    expect(source).toContain("_optimized/w");
    expect(source).toContain('"X-Image-Variant"');
    expect(source).toContain('"Cache-Control": "public, max-age=31536000, immutable"');
  });

  it("uses lazy responsive images in recipe surfaces", () => {
    const files = [
      "app/routes/cookbooks.$id.tsx",
      "app/routes/collections.$id.tsx",
      "app/routes/logs.$id.tsx",
      "app/routes/recipes.tsx",
    ];

    for (const file of files) {
      const source = readFileSync(resolve(process.cwd(), file), "utf8");
      expect(source, file).toContain("srcSet=");
      expect(source, file).toContain('loading="lazy"');
      expect(source, file).toContain('decoding="async"');
    }
  });
});
