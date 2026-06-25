CREATE TABLE user_preferences (
  user_id TEXT NOT NULL,
  preference_key TEXT NOT NULL,
  value_json TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  PRIMARY KEY (user_id, preference_key)
);

CREATE INDEX user_preferences_user_id_idx
  ON user_preferences (user_id);
