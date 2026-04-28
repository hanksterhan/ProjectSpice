export type VisualDebtCategory =
  | "legacy-gray-colors"
  | "legacy-shadcn-tokens"
  | "route-local-sticky-header"
  | "ad-hoc-button"
  | "admin-card";

export type VisualDebtFinding = {
  category: VisualDebtCategory;
  file: string;
  line: number;
  pattern: string;
  text: string;
};

export type VisualDebtBaseline = Partial<
  Record<VisualDebtCategory, Partial<Record<string, number>>>
>;

type SourceFile = {
  path: string;
  source: string;
};

const CLASS_PATTERNS: Array<{
  category: VisualDebtCategory;
  pattern: RegExp;
  label: string;
}> = [
  {
    category: "legacy-gray-colors",
    pattern: /\b(?:bg-white|bg-gray-\d{2,3}|text-gray-\d{2,3})\b/g,
    label: "legacy gray/white utility",
  },
  {
    category: "legacy-shadcn-tokens",
    pattern:
      /\b(?:bg-card|bg-muted(?:\/\d+)?|text-muted-foreground|text-foreground|bg-background(?:\/\d+)?|focus:ring-ring)\b/g,
    label: "legacy shadcn token",
  },
  {
    category: "route-local-sticky-header",
    pattern: /<header[^>]*className=["'][^"']*\bsticky\b[^"']*\btop-0\b[^"']*["']/g,
    label: "route-local sticky header",
  },
  {
    category: "admin-card",
    pattern:
      /\brounded-(?:md|lg|xl)\b(?=[^"`'\n]*\bborder\b)(?=[^"`'\n]*\b(?:bg-card|bg-muted|bg-white|bg-gray-\d{2,3}|bg-background)\b)/g,
    label: "unmigrated admin card",
  },
];

const BUTTON_OPEN_PATTERN = /<button\b[^>]*className=(?:"([^"]*)"|'([^']*)'|{`([^`]*)`})/g;

export function scanVisualDebt(files: SourceFile[]): VisualDebtFinding[] {
  const findings: VisualDebtFinding[] = [];

  for (const file of files) {
    for (const rule of CLASS_PATTERNS) {
      if (rule.category === "route-local-sticky-header" && !file.path.startsWith("app/routes/")) {
        continue;
      }

      for (const match of file.source.matchAll(rule.pattern)) {
        findings.push({
          category: rule.category,
          file: file.path,
          line: lineNumberAt(file.source, match.index ?? 0),
          pattern: rule.label,
          text: lineAt(file.source, match.index ?? 0),
        });
      }
    }

    for (const match of file.source.matchAll(BUTTON_OPEN_PATTERN)) {
      const className = match[1] ?? match[2] ?? match[3] ?? "";
      if (isAdHocButton(className)) {
        findings.push({
          category: "ad-hoc-button",
          file: file.path,
          line: lineNumberAt(file.source, match.index ?? 0),
          pattern: "button without ProjectSpice control primitive",
          text: lineAt(file.source, match.index ?? 0),
        });
      }
    }
  }

  return findings.sort((a, b) =>
    a.file === b.file ? a.line - b.line : a.file.localeCompare(b.file)
  );
}

export function summarizeVisualDebt(findings: VisualDebtFinding[]) {
  const summary = new Map<string, number>();

  for (const finding of findings) {
    const key = `${finding.category}\u0000${finding.file}`;
    summary.set(key, (summary.get(key) ?? 0) + 1);
  }

  return [...summary.entries()].map(([key, count]) => {
    const [category, file] = key.split("\u0000") as [VisualDebtCategory, string];
    return { category, file, count };
  });
}

export function findBaselineRegressions(
  findings: VisualDebtFinding[],
  baseline: VisualDebtBaseline
) {
  return summarizeVisualDebt(findings).filter(({ category, file, count }) => {
    const allowed = baseline[category]?.[file] ?? 0;
    return count > allowed;
  });
}

function isAdHocButton(className: string) {
  const normalized = className.replace(/\s+/g, " ").trim();
  if (!normalized) return true;

  return ![
    "ps-control",
    "focus-visible:ps-focus-ring",
    "sr-only",
    "file:",
  ].some((requiredPattern) => normalized.includes(requiredPattern));
}

function lineNumberAt(source: string, index: number) {
  return source.slice(0, index).split("\n").length;
}

function lineAt(source: string, index: number) {
  const lineStart = source.lastIndexOf("\n", index) + 1;
  const lineEnd = source.indexOf("\n", index);
  return source
    .slice(lineStart, lineEnd === -1 ? source.length : lineEnd)
    .trim();
}
