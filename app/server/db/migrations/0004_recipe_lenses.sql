CREATE TABLE recipe_lenses (
  id TEXT PRIMARY KEY NOT NULL,
  recipe_id TEXT NOT NULL,
  lens_key TEXT NOT NULL CHECK (lens_key IN ('lower-cal', 'glucose-conscious', 'quick', 'max-flavor')),
  notes TEXT NOT NULL,
  recipe_draft_json TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (recipe_id) REFERENCES recipes (id) ON DELETE CASCADE
);

CREATE UNIQUE INDEX recipe_lenses_recipe_id_lens_key_unique
  ON recipe_lenses (recipe_id, lens_key);
CREATE INDEX recipe_lenses_recipe_id_idx ON recipe_lenses (recipe_id);
CREATE INDEX recipe_lenses_lens_key_idx ON recipe_lenses (lens_key);
