-- Guest feedback is explicitly public. Existing account price_signals remain private.
CREATE TABLE feedback (
  id TEXT PRIMARY KEY NOT NULL,
  game_id TEXT NOT NULL REFERENCES games(id) ON DELETE CASCADE,
  guest_key_hash TEXT NOT NULL,
  display_name TEXT NOT NULL CHECK(length(display_name) BETWEEN 1 AND 40),
  body TEXT NOT NULL CHECK(length(body) <= 1500),
  ideal_price_cents INTEGER CHECK(ideal_price_cents IS NULL OR
    (typeof(ideal_price_cents)='integer' AND ideal_price_cents BETWEEN 0 AND 10000)),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'published' CHECK(status IN ('published','hidden')),
  moderation_reason TEXT,
  UNIQUE(game_id, guest_key_hash),
  CHECK(length(trim(body)) >= 8 OR ideal_price_cents IS NOT NULL)
);
CREATE INDEX feedback_game_date_idx ON feedback(game_id, status, created_at DESC, id);
