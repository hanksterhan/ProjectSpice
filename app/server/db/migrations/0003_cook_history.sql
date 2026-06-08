ALTER TABLE recipes ADD COLUMN cook_count INTEGER NOT NULL DEFAULT 0;
ALTER TABLE recipes ADD COLUMN last_cooked_on TEXT;

CREATE INDEX recipes_cook_count_idx ON recipes (cook_count);
CREATE INDEX recipes_last_cooked_on_idx ON recipes (last_cooked_on);
