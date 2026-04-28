import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import {
  findBaselineRegressions,
  scanVisualDebt,
} from "../visual-debt-scanner";

describe("visual debt scanner", () => {
  it("detects legacy style patterns that should not be reintroduced", () => {
    const findings = scanVisualDebt([
      {
        path: "app/routes/example.tsx",
        source: `
          <header className="sticky top-0 z-10 bg-background/95 border-b" />
          <div className="rounded-lg border bg-card text-muted-foreground" />
          <button className="rounded-md border px-3 py-2">Legacy</button>
          <pre className="bg-white text-gray-800" />
        `,
      },
    ]);

    expect(findings.map((finding) => finding.category).sort()).toEqual([
      "ad-hoc-button",
      "admin-card",
      "legacy-gray-colors",
      "legacy-gray-colors",
      "legacy-shadcn-tokens",
      "legacy-shadcn-tokens",
      "legacy-shadcn-tokens",
      "route-local-sticky-header",
    ]);
  });

  it("keeps migrated recipe detail styling free of legacy color debt", () => {
    const file = "app/routes/recipes.$id.tsx";
    const source = readFileSync(resolve(process.cwd(), file), "utf8");

    expect(
      scanVisualDebt([{ path: file, source }]).filter((finding) =>
        ["legacy-gray-colors", "legacy-shadcn-tokens", "route-local-sticky-header"].includes(
          finding.category
        )
      )
    ).toEqual([]);
  });

  it("flags counts above a declared baseline", () => {
    const findings = scanVisualDebt([
      {
        path: "app/routes/example.tsx",
        source: `
          <div className="bg-card" />
          <div className="bg-card" />
        `,
      },
    ]);

    expect(
      findBaselineRegressions(findings, {
        "legacy-shadcn-tokens": { "app/routes/example.tsx": 1 },
      })
    ).toEqual([
      {
        category: "legacy-shadcn-tokens",
        file: "app/routes/example.tsx",
        count: 2,
      },
    ]);
  });
});
