import { describe, expect, it } from "vitest";

import { parseScrapeUrl, RecipeScrapeFetchError } from "../recipe-scraper.fetcher";

describe("parseScrapeUrl", () => {
  it("accepts public HTTP and HTTPS URLs", () => {
    expect(parseScrapeUrl("https://example.com/recipe#card").toString()).toBe(
      "https://example.com/recipe",
    );
    expect(parseScrapeUrl("http://example.com/recipe").toString()).toBe(
      "http://example.com/recipe",
    );
  });

  it("blocks unsupported protocols and local/private hosts", () => {
    const blockedUrls = [
      "file:///etc/passwd",
      "http://localhost/recipe",
      "http://127.0.0.1/recipe",
      "http://10.0.0.4/recipe",
      "http://172.16.1.2/recipe",
      "http://192.168.0.2/recipe",
      "http://[::1]/recipe",
    ];

    for (const url of blockedUrls) {
      expect(() => parseScrapeUrl(url), url).toThrow(RecipeScrapeFetchError);
    }
  });
});
