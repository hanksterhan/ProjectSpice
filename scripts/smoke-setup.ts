import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const smokeImageBase64 =
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAFgwJ/lR0LxwAAAABJRU5ErkJggg==";

function run(command: string, args: string[]) {
  execFileSync(command, args, {
    cwd: process.cwd(),
    stdio: "inherit",
    env: process.env,
  });
}

run("pnpm", ["db:migrate"]);
run("pnpm", ["seed"]);

const dir = mkdtempSync(join(tmpdir(), "projectspice-smoke-"));
const imagePath = join(dir, "readiness.png");

try {
  writeFileSync(imagePath, Buffer.from(smokeImageBase64, "base64"));
  run("pnpm", [
    "exec",
    "wrangler",
    "r2",
    "object",
    "put",
    "projectspice-images-dev/smoke/readiness.png",
    "--local",
    "--file",
    imagePath,
    "--content-type",
    "image/png",
  ]);
} finally {
  rmSync(dir, { recursive: true, force: true });
}
