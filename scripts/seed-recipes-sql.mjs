import { execFileSync } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { createServer } from "vite";

const defaultDatabaseName = "projectspice-v1-production";
const defaultOutputPath = "/tmp/projectspice-seed-recipes.sql";

const args = parseArgs(process.argv.slice(2));
const outputPath = resolve(args.out ?? defaultOutputPath);
const databaseName = args.database ?? defaultDatabaseName;
const environment = args.env ?? "production";
const shouldApply = args.apply === true;
const shouldUseRemote = args.remote !== false;

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const vite = await createServer({
  root,
  appType: "custom",
  configFile: false,
  logLevel: "error",
  server: {
    hmr: false,
    middlewareMode: true,
    watch: null,
  },
});

try {
  const domain = await vite.ssrLoadModule("/app/modules/recipe-domain/index.ts");
  const fixtures = await vite.ssrLoadModule(
    "/app/modules/recipe-domain/seed-recipes.fixtures.ts",
  );
  const { createRecipeSlug, getCookCount, getLastCookedDate, recipeSchema } = domain;
  const seedRecipes = fixtures.seedRecipes.map((recipe) => recipeSchema.parse(recipe));
  const statements = [
    "PRAGMA foreign_keys = ON;",
    ...seedRecipes.map((recipe) =>
      toInsertStatement(recipe, {
        createRecipeSlug,
        getCookCount,
        getLastCookedDate,
      }),
    ),
  ];

  mkdirSync(dirname(outputPath), { recursive: true });
  writeFileSync(outputPath, `${statements.join("\n")}\n`);

  console.log(
    JSON.stringify(
      {
        outputPath,
        recipes: seedRecipes.length,
        mode: "insert-or-ignore",
        databaseName,
        environment,
        remote: shouldUseRemote,
        applied: shouldApply,
      },
      null,
      2,
    ),
  );

  if (shouldApply) {
    const wranglerArgs = [
      "wrangler",
      "d1",
      "execute",
      databaseName,
      "--env",
      environment,
      "--file",
      outputPath,
    ];

    if (shouldUseRemote) {
      wranglerArgs.push("--remote");
    }

    execFileSync("pnpm", wranglerArgs, {
      cwd: root,
      stdio: "inherit",
    });
  }
} finally {
  await vite.close();
}

function toInsertStatement(
  recipe,
  { createRecipeSlug, getCookCount, getLastCookedDate },
) {
  const slug = createRecipeSlug(recipe.title);
  const row = [
    recipe.id,
    slug ? `${slug}-${recipe.id}` : recipe.id,
    recipe.title,
    recipe.description ?? null,
    recipe.imageUrl ?? null,
    recipe.source?.type ?? null,
    recipe.source?.name ?? null,
    recipe.source?.url ?? null,
    JSON.stringify(recipe.tags),
    recipe.yield?.quantity ?? null,
    recipe.yield?.unit ?? null,
    recipe.yield?.notes ?? null,
    recipe.times?.prepMinutes ?? null,
    recipe.times?.cookMinutes ?? null,
    recipe.times?.totalMinutes ?? null,
    recipe.favorite === true ? 1 : 0,
    recipe.rating ?? null,
    getCookCount(recipe),
    getLastCookedDate(recipe) ?? null,
    JSON.stringify(recipe),
    recipe.version,
    recipe.createdAt,
    recipe.updatedAt,
    null,
  ];

  return `INSERT OR IGNORE INTO recipes (
  id,
  slug,
  title,
  description,
  image_url,
  source_type,
  source_name,
  source_url,
  tags_json,
  yield_quantity,
  yield_unit,
  yield_notes,
  prep_minutes,
  cook_minutes,
  total_minutes,
  favorite,
  rating,
  cook_count,
  last_cooked_on,
  recipe_json,
  version,
  created_at,
  updated_at,
  deleted_at
) VALUES (${row.map(toSqlLiteral).join(", ")});`;
}

function toSqlLiteral(value) {
  if (value === null || value === undefined) {
    return "NULL";
  }

  if (typeof value === "number") {
    return Number.isFinite(value) ? String(value) : "NULL";
  }

  return `'${String(value).replaceAll("'", "''")}'`;
}

function parseArgs(rawArgs) {
  const parsed = {};

  for (let index = 0; index < rawArgs.length; index += 1) {
    const arg = rawArgs[index];

    if (arg === "--apply") {
      parsed.apply = true;
    } else if (arg === "--local") {
      parsed.remote = false;
    } else if (arg === "--remote") {
      parsed.remote = true;
    } else if (arg === "--out") {
      parsed.out = requireValue(rawArgs, (index += 1), arg);
    } else if (arg === "--database") {
      parsed.database = requireValue(rawArgs, (index += 1), arg);
    } else if (arg === "--env") {
      parsed.env = requireValue(rawArgs, (index += 1), arg);
    } else {
      throw new Error(`Unknown argument: ${arg}`);
    }
  }

  return parsed;
}

function requireValue(rawArgs, index, flag) {
  const value = rawArgs[index];

  if (!value || value.startsWith("--")) {
    throw new Error(`Missing value for ${flag}.`);
  }

  return value;
}
