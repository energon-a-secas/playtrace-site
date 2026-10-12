-- An optional first-look measurement followed by a later self-reported play
-- measurement from the same browser. Never join these hashes to other sources.
CREATE TABLE play_expectations (
  game_id TEXT NOT NULL REFERENCES games(id) ON DELETE CASCADE,
  guest_key_hash TEXT NOT NULL,
  first_interest INTEGER NOT NULL CHECK(first_interest BETWEEN 1 AND 5 AND typeof(first_interest)='integer'),
  first_at TEXT NOT NULL,
  played_interest INTEGER CHECK(played_interest IS NULL OR (played_interest BETWEEN 1 AND 5 AND typeof(played_interest)='integer')),
  expectation TEXT CHECK(expectation IN('less','matched','better','unsure')),
  played_at TEXT,
  updated_at TEXT NOT NULL,
  revision INTEGER NOT NULL DEFAULT 1 CHECK(revision>0),
  PRIMARY KEY(game_id,guest_key_hash),
  CHECK((played_interest IS NULL AND expectation IS NULL AND played_at IS NULL)
    OR (played_interest IS NOT NULL AND expectation IS NOT NULL AND played_at IS NOT NULL AND played_at>first_at))
);
CREATE INDEX play_expectations_cohort ON play_expectations(game_id,first_at,played_at);
