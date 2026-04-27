import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const releaseTruthFiles = [
  "app/routes/imports.gpt.tsx",
  "app/routes/imports.url.tsx",
  "app/lib/url-scraper.ts",
  "app/lib/ai-improve.server.ts",
  "app/routes/api.recipes.$id.improve.ts",
];

describe("AI/import release truth", () => {
  it("does not advertise TODO or stubbed AI/import fallback behavior", () => {
    const combined = releaseTruthFiles
      .map((file) => readFileSync(resolve(process.cwd(), file), "utf8"))
      .join("\n");

    expect(combined).not.toMatch(/\bTODO\b/i);
    expect(combined).not.toMatch(/\bstub(?:bed)?\b/i);
    expect(combined).not.toMatch(/Workers AI fallback/i);
    expect(combined).not.toMatch(/3-tier pipeline/i);
  });

  it("documents that the deployed improve endpoint bypasses Workers AI unless wired", () => {
    const route = readFileSync(
      resolve(process.cwd(), "app/routes/api.recipes.$id.improve.ts"),
      "utf8"
    );

    expect(route).toContain("callWorkersAI: null");
    expect(route).toContain("uses the Anthropic/OpenAI token chain directly");
  });
});
