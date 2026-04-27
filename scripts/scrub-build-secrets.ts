import { existsSync, readdirSync, rmSync, statSync } from "node:fs";
import { basename, join, relative } from "node:path";

const BUILD_ROOTS = ["build/server", "build/client"];
const FORBIDDEN_FILENAMES = new Set([".dev.vars", ".env"]);

function collectForbiddenFiles(root: string): string[] {
  if (!existsSync(root)) {
    return [];
  }

  const found: string[] = [];
  const stack = [root];

  while (stack.length > 0) {
    const current = stack.pop();
    if (!current) {
      continue;
    }

    const stat = statSync(current);
    if (stat.isDirectory()) {
      for (const entry of readdirSync(current)) {
        stack.push(join(current, entry));
      }
      continue;
    }

    if (stat.isFile() && FORBIDDEN_FILENAMES.has(basename(current))) {
      found.push(current);
    }
  }

  return found;
}

const forbiddenFiles = BUILD_ROOTS.flatMap(collectForbiddenFiles);

for (const file of forbiddenFiles) {
  rmSync(file, { force: true });
}

const remainingForbiddenFiles = BUILD_ROOTS.flatMap(collectForbiddenFiles);
if (remainingForbiddenFiles.length > 0) {
  throw new Error(
    `Secret-bearing build artifacts remain: ${remainingForbiddenFiles
      .map((file) => relative(process.cwd(), file))
      .join(", ")}`
  );
}

if (forbiddenFiles.length > 0) {
  console.warn(
    `Removed secret-bearing build artifact(s): ${forbiddenFiles
      .map((file) => relative(process.cwd(), file))
      .join(", ")}`
  );
}
