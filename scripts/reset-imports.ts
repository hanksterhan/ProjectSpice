// Reset local import test data without touching users or manual recipes.
// Usage: pnpm db:reset-imports

import { execFileSync } from "node:child_process";
import { writeFileSync, unlinkSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..");
const WRANGLER = join(ROOT, "node_modules", ".bin", "wrangler");

const sql = `
UPDATE ai_runs
SET recipe_id = NULL
WHERE recipe_id IN (
  SELECT id FROM recipes
  WHERE import_job_id IS NOT NULL
     OR imported_at IS NOT NULL
     OR source_type IN ('paprika_binary', 'paprika_html', 'pdf', 'epub')
);

UPDATE cooking_log
SET recipe_id = NULL
WHERE recipe_id IN (
  SELECT id FROM recipes
  WHERE import_job_id IS NOT NULL
     OR imported_at IS NOT NULL
     OR source_type IN ('paprika_binary', 'paprika_html', 'pdf', 'epub')
);

UPDATE meal_plan_entries
SET recipe_id = NULL
WHERE recipe_id IN (
  SELECT id FROM recipes
  WHERE import_job_id IS NOT NULL
     OR imported_at IS NOT NULL
     OR source_type IN ('paprika_binary', 'paprika_html', 'pdf', 'epub')
);

UPDATE shopping_list_items
SET recipe_id = NULL
WHERE recipe_id IN (
  SELECT id FROM recipes
  WHERE import_job_id IS NOT NULL
     OR imported_at IS NOT NULL
     OR source_type IN ('paprika_binary', 'paprika_html', 'pdf', 'epub')
);

UPDATE shopping_list_items
SET ingredient_id = NULL
WHERE ingredient_id IN (
  SELECT id FROM ingredients
  WHERE recipe_id IN (
    SELECT id FROM recipes
    WHERE import_job_id IS NOT NULL
       OR imported_at IS NOT NULL
       OR source_type IN ('paprika_binary', 'paprika_html', 'pdf', 'epub')
  )
);

UPDATE recipes
SET parent_recipe_id = NULL
WHERE parent_recipe_id IN (
  SELECT id FROM recipes
  WHERE import_job_id IS NOT NULL
     OR imported_at IS NOT NULL
     OR source_type IN ('paprika_binary', 'paprika_html', 'pdf', 'epub')
);

DELETE FROM shares
WHERE resource_type = 'recipe'
  AND resource_id IN (
    SELECT id FROM recipes
    WHERE import_job_id IS NOT NULL
       OR imported_at IS NOT NULL
       OR source_type IN ('paprika_binary', 'paprika_html', 'pdf', 'epub')
  );

DELETE FROM collection_recipes
WHERE recipe_id IN (
  SELECT id FROM recipes
  WHERE import_job_id IS NOT NULL
     OR imported_at IS NOT NULL
     OR source_type IN ('paprika_binary', 'paprika_html', 'pdf', 'epub')
);

DELETE FROM cookbooks
WHERE EXISTS (
    SELECT 1
    FROM cookbook_recipes cr
    INNER JOIN recipes r ON r.id = cr.recipe_id
    WHERE cr.cookbook_id = cookbooks.id
      AND (
        r.import_job_id IS NOT NULL
        OR r.imported_at IS NOT NULL
        OR r.source_type IN ('paprika_binary', 'paprika_html', 'pdf', 'epub')
      )
  )
  AND NOT EXISTS (
    SELECT 1
    FROM cookbook_recipes cr
    INNER JOIN recipes r ON r.id = cr.recipe_id
    WHERE cr.cookbook_id = cookbooks.id
      AND r.import_job_id IS NULL
      AND r.imported_at IS NULL
      AND r.source_type NOT IN ('paprika_binary', 'paprika_html', 'pdf', 'epub')
  );

DELETE FROM cookbook_recipes
WHERE recipe_id IN (
  SELECT id FROM recipes
  WHERE import_job_id IS NOT NULL
     OR imported_at IS NOT NULL
     OR source_type IN ('paprika_binary', 'paprika_html', 'pdf', 'epub')
);

DELETE FROM recipe_tags
WHERE recipe_id IN (
  SELECT id FROM recipes
  WHERE import_job_id IS NOT NULL
     OR imported_at IS NOT NULL
     OR source_type IN ('paprika_binary', 'paprika_html', 'pdf', 'epub')
);

DELETE FROM tags
WHERE NOT EXISTS (
  SELECT 1
  FROM recipe_tags rt
  WHERE rt.tag_id = tags.id
);

DELETE FROM ingredients
WHERE recipe_id IN (
  SELECT id FROM recipes
  WHERE import_job_id IS NOT NULL
     OR imported_at IS NOT NULL
     OR source_type IN ('paprika_binary', 'paprika_html', 'pdf', 'epub')
);

DELETE FROM recipes
WHERE import_job_id IS NOT NULL
   OR imported_at IS NOT NULL
   OR source_type IN ('paprika_binary', 'paprika_html', 'pdf', 'epub');

DELETE FROM import_review_items;
DELETE FROM import_jobs;

DELETE FROM cookbooks
WHERE NOT EXISTS (
    SELECT 1
    FROM cookbook_recipes cr
    WHERE cr.cookbook_id = cookbooks.id
  )
  AND EXISTS (
    SELECT 1
    FROM cookbooks duplicate
    WHERE duplicate.user_id = cookbooks.user_id
      AND duplicate.name = cookbooks.name
      AND duplicate.id <> cookbooks.id
  );
`;

function main() {
  console.log("Resetting local ProjectSpice import data...");
  const sqlFile = join(tmpdir(), `projectspice-reset-imports-${Date.now()}.sql`);
  writeFileSync(sqlFile, sql.trim() + "\n");

  try {
    execFileSync(WRANGLER, ["d1", "execute", "DB", "--local", `--file=${sqlFile}`], {
      stdio: "inherit",
      cwd: ROOT,
    });
  } finally {
    unlinkSync(sqlFile);
  }

  console.log("\nImport reset complete.");
}

main();
