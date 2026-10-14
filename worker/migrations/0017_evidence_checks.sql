-- Private maintenance records contain source URLs and fingerprints, not bodies.
CREATE TABLE evidence_checks (
  game_id TEXT PRIMARY KEY NOT NULL REFERENCES games(id) ON DELETE CASCADE,
  checked_at TEXT NOT NULL,
  next_check_at TEXT NOT NULL,
  payload_json TEXT NOT NULL CHECK(json_valid(payload_json))
);
CREATE INDEX evidence_checks_due ON evidence_checks(next_check_at);
