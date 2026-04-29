WITH canonical_cookbooks AS (
  SELECT user_id, name, MIN(created_at) AS created_at, MIN(id) AS id
  FROM cookbooks
  GROUP BY user_id, name
),
duplicate_cookbooks AS (
  SELECT cb.id AS duplicate_id, canonical_cookbooks.id AS canonical_id
  FROM cookbooks cb
  INNER JOIN canonical_cookbooks
    ON canonical_cookbooks.user_id = cb.user_id
   AND canonical_cookbooks.name = cb.name
  WHERE cb.id <> canonical_cookbooks.id
)
INSERT OR IGNORE INTO cookbook_recipes (cookbook_id, recipe_id, sort_order)
SELECT duplicate_cookbooks.canonical_id, cr.recipe_id, MIN(cr.sort_order)
FROM duplicate_cookbooks
INNER JOIN cookbook_recipes cr ON cr.cookbook_id = duplicate_cookbooks.duplicate_id
GROUP BY duplicate_cookbooks.canonical_id, cr.recipe_id;
--> statement-breakpoint
WITH canonical_cookbooks AS (
  SELECT user_id, name, MIN(created_at) AS created_at, MIN(id) AS id
  FROM cookbooks
  GROUP BY user_id, name
),
duplicate_cookbooks AS (
  SELECT cb.id
  FROM cookbooks cb
  INNER JOIN canonical_cookbooks
    ON canonical_cookbooks.user_id = cb.user_id
   AND canonical_cookbooks.name = cb.name
  WHERE cb.id <> canonical_cookbooks.id
)
DELETE FROM cookbooks
WHERE id IN (SELECT id FROM duplicate_cookbooks);
--> statement-breakpoint
CREATE UNIQUE INDEX `cookbooks_user_name_idx` ON `cookbooks` (`user_id`,`name`);
