ALTER TABLE recipes ADD COLUMN favorite INTEGER NOT NULL DEFAULT 0;
ALTER TABLE recipes ADD COLUMN rating REAL;

CREATE INDEX recipes_favorite_idx ON recipes (favorite);
CREATE INDEX recipes_rating_idx ON recipes (rating);
