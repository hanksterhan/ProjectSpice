import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

describe("route module boundaries", () => {
  it("keeps AI diff helpers used by the improve page in a client-safe module", () => {
    const route = readFileSync(
      resolve(process.cwd(), "app/routes/recipes.$id.improve.tsx"),
      "utf8"
    );

    expect(route).not.toMatch(
      /import\s*\{[^}]*computeDiff[^}]*\}\s*from\s*["']~\/lib\/ai-improve\.server["']/
    );
    expect(route).toContain('from "~/lib/ai-improve.shared"');
  });
});
