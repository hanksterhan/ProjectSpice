PRAGMA foreign_keys = ON;

CREATE TABLE recipes (
  id TEXT PRIMARY KEY NOT NULL,
  slug TEXT NOT NULL,
  title TEXT NOT NULL,
  description TEXT,
  image_url TEXT,
  source_type TEXT,
  source_name TEXT,
  source_url TEXT,
  tags_json TEXT NOT NULL,
  yield_quantity REAL,
  yield_unit TEXT,
  yield_notes TEXT,
  prep_minutes INTEGER,
  cook_minutes INTEGER,
  total_minutes INTEGER,
  recipe_json TEXT NOT NULL,
  version INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  deleted_at TEXT
);

CREATE UNIQUE INDEX recipes_slug_unique ON recipes (slug);
CREATE INDEX recipes_title_idx ON recipes (title);
CREATE INDEX recipes_source_type_idx ON recipes (source_type);
CREATE INDEX recipes_deleted_at_idx ON recipes (deleted_at);
CREATE INDEX recipes_updated_at_idx ON recipes (updated_at);

CREATE TABLE recipe_versions (
  id TEXT PRIMARY KEY NOT NULL,
  recipe_id TEXT NOT NULL,
  version INTEGER NOT NULL,
  recipe_json TEXT NOT NULL,
  change_summary TEXT,
  created_at TEXT NOT NULL,
  FOREIGN KEY (recipe_id) REFERENCES recipes (id) ON DELETE CASCADE
);

CREATE UNIQUE INDEX recipe_versions_recipe_id_version_unique
  ON recipe_versions (recipe_id, version);
CREATE INDEX recipe_versions_recipe_id_idx ON recipe_versions (recipe_id);

CREATE TABLE ai_runs (
  id TEXT PRIMARY KEY NOT NULL,
  recipe_id TEXT,
  operation TEXT NOT NULL CHECK (operation IN ('generate', 'transform')),
  provider TEXT NOT NULL,
  model TEXT NOT NULL,
  prompt_json TEXT NOT NULL,
  response_json TEXT,
  draft_recipe_json TEXT,
  status TEXT NOT NULL CHECK (status IN ('succeeded', 'failed')),
  error TEXT,
  change_summary TEXT,
  created_at TEXT NOT NULL,
  FOREIGN KEY (recipe_id) REFERENCES recipes (id) ON DELETE SET NULL
);

CREATE INDEX ai_runs_recipe_id_idx ON ai_runs (recipe_id);
CREATE INDEX ai_runs_operation_idx ON ai_runs (operation);
CREATE INDEX ai_runs_status_idx ON ai_runs (status);
CREATE INDEX ai_runs_created_at_idx ON ai_runs (created_at);
