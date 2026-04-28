import { readdirSync, readFileSync, statSync } from "node:fs";
import { resolve } from "node:path";
import {
  findBaselineRegressions,
  scanVisualDebt,
  type VisualDebtBaseline,
} from "../app/lib/visual-debt-scanner";

const ROOT = process.cwd();
const SCAN_ROOTS = ["app/components", "app/routes"];

const BASELINE: VisualDebtBaseline = {
  "legacy-gray-colors": {
    "app/routes/imports.gpt.tsx": 2,
  },
  "legacy-shadcn-tokens": {
    "app/routes/imports.epub.tsx": 27,
    "app/routes/imports.gpt.tsx": 15,
    "app/routes/imports.paprika-html.tsx": 22,
    "app/routes/imports.pdf.tsx": 26,
    "app/routes/imports.url.tsx": 19,
  },
  "route-local-sticky-header": {
    "app/routes/imports.epub.tsx": 1,
    "app/routes/imports.gpt.tsx": 1,
    "app/routes/imports.paprika-html.tsx": 1,
    "app/routes/imports.paprika.tsx": 1,
    "app/routes/imports.pdf.tsx": 1,
    "app/routes/imports.url.tsx": 1,
  },
  "ad-hoc-button": {
    "app/routes/imports.epub.tsx": 2,
    "app/routes/imports.gpt.tsx": 2,
    "app/routes/imports.paprika-html.tsx": 1,
    "app/routes/imports.paprika.tsx": 1,
    "app/routes/imports.pdf.tsx": 2,
    "app/routes/imports.url.tsx": 2,
    "app/routes/logs.$id.tsx": 1,
    "app/routes/recipes.$id.cook.tsx": 1,
    "app/routes/recipes.$id.tsx": 1,
    "app/routes/recipes.tsx": 3,
    "app/routes/settings.ai-profiles.tsx": 1,
    "app/routes/settings.collections.tsx": 2,
    "app/routes/settings.cookbooks.tsx": 3,
    "app/routes/settings.tags.tsx": 2,
  },
  "admin-card": {
    "app/routes/imports.epub.tsx": 12,
    "app/routes/imports.gpt.tsx": 4,
    "app/routes/imports.paprika-html.tsx": 4,
    "app/routes/imports.pdf.tsx": 12,
    "app/routes/imports.url.tsx": 3,
  },
};

const scannedFiles = ["app/root.tsx", ...SCAN_ROOTS.flatMap(findTsxFiles)].sort();
const files = scannedFiles.map((path) => ({
  path,
  source: readFileSync(resolve(ROOT, path), "utf8"),
}));

const findings = scanVisualDebt(files);
const regressions = findBaselineRegressions(findings, BASELINE);

if (regressions.length > 0) {
  console.error("Visual debt scanner found regressions over the current baseline:");
  for (const regression of regressions) {
    const allowed = BASELINE[regression.category]?.[regression.file] ?? 0;
    console.error(
      `- ${regression.category} in ${regression.file}: ${regression.count} found, ${allowed} allowed`
    );
  }
  process.exit(1);
}

console.log(
  `Visual debt scanner passed: ${findings.length} baseline findings tracked across ${scannedFiles.length} files.`
);

function findTsxFiles(directory: string): string[] {
  const absoluteDirectory = resolve(ROOT, directory);

  return readdirSync(absoluteDirectory).flatMap((entry) => {
    const absolutePath = resolve(absoluteDirectory, entry);
    const relativePath = `${directory}/${entry}`;

    if (statSync(absolutePath).isDirectory()) {
      return findTsxFiles(relativePath);
    }

    return entry.endsWith(".tsx") ? [relativePath] : [];
  });
}
