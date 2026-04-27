import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { appImageUrl } from "../image-url";

describe("appImageUrl", () => {
  it("routes app-owned image keys through the CDN image route", () => {
    expect(appImageUrl("recipes/recipe-1/hero.jpg")).toBe(
      "/cdn/images/recipes/recipe-1/hero.jpg"
    );
    expect(appImageUrl("logs/user/log/photo.webp")).toBe(
      "/cdn/images/logs/user/log/photo.webp"
    );
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
});
