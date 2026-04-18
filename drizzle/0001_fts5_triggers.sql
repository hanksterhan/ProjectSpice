-- FTS5 virtual table for full-text recipe search.
-- Uses content=recipes so SQLite stores the index only (not duplicate content).
-- Triggers below keep the FTS index in sync with the recipes table.
-- Indexed columns: title, directions_text, notes.
-- Ingredient names and tags are concatenated into body (added in SLICE-8).
CREATE VIRTUAL TABLE IF NOT EXISTS `recipes_fts` USING fts5(
  title,
  directions_text,
  notes,
  content=`recipes`,
  content_rowid=`rowid`
);

-- Populate index for any rows already in the table at migration time.
INSERT INTO `recipes_fts`(`recipes_fts`) VALUES ('rebuild');

-- Sync triggers: insert
CREATE TRIGGER `recipes_ai` AFTER INSERT ON `recipes` BEGIN
  INSERT INTO `recipes_fts`(rowid, title, directions_text, notes)
  VALUES (new.rowid, new.title, new.directions_text, new.notes);
END;

-- Sync triggers: delete
CREATE TRIGGER `recipes_ad` AFTER DELETE ON `recipes` BEGIN
  INSERT INTO `recipes_fts`(`recipes_fts`, rowid, title, directions_text, notes)
  VALUES ('delete', old.rowid, old.title, old.directions_text, old.notes);
END;

-- Sync triggers: update
CREATE TRIGGER `recipes_au` AFTER UPDATE ON `recipes` BEGIN
  INSERT INTO `recipes_fts`(`recipes_fts`, rowid, title, directions_text, notes)
  VALUES ('delete', old.rowid, old.title, old.directions_text, old.notes);
  INSERT INTO `recipes_fts`(rowid, title, directions_text, notes)
  VALUES (new.rowid, new.title, new.directions_text, new.notes);
END;
