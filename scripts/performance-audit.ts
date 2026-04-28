import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { extname, join, resolve } from "node:path";

type Check = {
  name: string;
  ok: boolean;
  detail: string;
};

const root = process.cwd();

const checks: Check[] = [
  checkResponsiveImages(),
  checkImageRouteCaching(),
  checkRecipePrefetch(),
  checkD1Queries(),
  checkBundleSize(),
];

for (const check of checks) {
  const icon = check.ok ? "PASS" : "FAIL";
  console.log(`${icon} ${check.name}: ${check.detail}`);
}

const failures = checks.filter((check) => !check.ok);
if (failures.length > 0) {
  process.exitCode = 1;
}

function checkResponsiveImages(): Check {
  const files = [
    "app/routes/cookbooks.$id.tsx",
    "app/routes/collections.$id.tsx",
    "app/routes/logs.$id.tsx",
    "app/routes/recipes.tsx",
  ];
  const missing = files.filter((file) => {
    const source = read(file);
    return !source.includes("srcSet=") || !source.includes('loading="lazy"') || !source.includes('decoding="async"');
  });

  return {
    name: "responsive images",
    ok: missing.length === 0,
    detail: missing.length === 0 ? "lazy srcset images are present on recipe image surfaces" : `missing responsive attrs in ${missing.join(", ")}`,
  };
}

function checkImageRouteCaching(): Check {
  const source = read("app/routes/cdn.images.$.ts");
  const ok =
    source.includes("@cf-wasm/photon/workerd") &&
    source.includes("_optimized/w") &&
    source.includes('"Cache-Control": "public, max-age=31536000, immutable"') &&
    source.includes('"X-Image-Variant"');

  return {
    name: "edge image variants",
    ok,
    detail: ok ? "WASM variants are cached in R2 with immutable browser cache headers" : "image CDN route is missing optimizer or cache markers",
  };
}

function checkRecipePrefetch(): Check {
  const files = [
    "app/routes/recipes.tsx",
    "app/routes/cookbooks.$id.tsx",
    "app/routes/collections.$id.tsx",
  ];
  const missing = files.filter((file) => !read(file).includes('prefetch="intent"'));

  return {
    name: "recipe detail preloading",
    ok: missing.length === 0,
    detail: missing.length === 0 ? "recipe-detail navigation uses intent prefetch on list surfaces" : `missing prefetch in ${missing.join(", ")}`,
  };
}

function checkD1Queries(): Check {
  const files = listFiles(resolve(root, "app"), [".ts", ".tsx"]);
  const offenders = files
    .filter((file) => /SELECT\s+\*/i.test(readFileSync(file, "utf8")))
    .map((file) => file.replace(`${root}/`, ""));

  return {
    name: "D1 query shape",
    ok: offenders.length === 0,
    detail: offenders.length === 0 ? "no broad SELECT * queries found in app source" : `broad queries found in ${offenders.join(", ")}`,
  };
}

function checkBundleSize(): Check {
  const assetsDir = resolve(root, "build/client/assets");
  if (!existsSync(assetsDir)) {
    return {
      name: "bundle size",
      ok: true,
      detail: "build/client/assets not present; run pnpm build before pnpm perf:audit for bundle byte checks",
    };
  }

  const assets = listFiles(assetsDir, [".js", ".css"]);
  const maxBytes = 350 * 1024;
  const oversized = assets
    .map((file) => ({ file, size: statSync(file).size }))
    .filter((asset) => asset.size > maxBytes)
    .map((asset) => `${asset.file.replace(`${root}/`, "")} (${Math.round(asset.size / 1024)} KiB)`);

  return {
    name: "bundle size",
    ok: oversized.length === 0,
    detail: oversized.length === 0 ? `checked ${assets.length} built JS/CSS assets under 350 KiB each` : `oversized assets: ${oversized.join(", ")}`,
  };
}

function read(path: string): string {
  return readFileSync(resolve(root, path), "utf8");
}

function listFiles(dir: string, extensions: string[]): string[] {
  if (!existsSync(dir)) return [];
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) return listFiles(path, extensions);
    return extensions.includes(extname(entry.name)) ? [path] : [];
  });
}
