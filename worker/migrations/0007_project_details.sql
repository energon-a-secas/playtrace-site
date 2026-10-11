CREATE TABLE project_overrides (
  game_id TEXT PRIMARY KEY NOT NULL REFERENCES games(id) ON DELETE CASCADE,
  details_json TEXT NOT NULL CHECK(json_valid(details_json)),
  updated_by TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  revision INTEGER NOT NULL CHECK(revision > 0)
);
