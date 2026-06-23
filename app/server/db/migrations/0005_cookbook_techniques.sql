CREATE TABLE cookbook_techniques (
  id TEXT PRIMARY KEY NOT NULL,
  slug TEXT NOT NULL,
  title TEXT NOT NULL,
  summary TEXT,
  technique_type TEXT NOT NULL,
  source_name TEXT NOT NULL,
  source_document_path TEXT NOT NULL,
  page_number INTEGER,
  image_url TEXT,
  blocks_json TEXT NOT NULL,
  tags_json TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  deleted_at TEXT
);

CREATE UNIQUE INDEX cookbook_techniques_slug_unique
  ON cookbook_techniques (slug);
CREATE INDEX cookbook_techniques_source_name_idx
  ON cookbook_techniques (source_name);
CREATE INDEX cookbook_techniques_technique_type_idx
  ON cookbook_techniques (technique_type);
CREATE INDEX cookbook_techniques_deleted_at_idx
  ON cookbook_techniques (deleted_at);
