-- Rebuild the old content CHECK to permit a contribution made only of choices.
-- IDs, edit access, timestamps, moderation and private legacy prices survive.
CREATE TABLE feedback_next (
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
  choices_json TEXT NOT NULL DEFAULT '[]' CHECK(json_valid(choices_json) AND json_type(choices_json)='array' AND json_array_length(choices_json)<=10),
  UNIQUE(game_id, guest_key_hash),
  CHECK(length(trim(body)) >= 8 OR ideal_price_cents IS NOT NULL OR json_array_length(choices_json)>0)
);
INSERT INTO feedback_next(id,game_id,guest_key_hash,display_name,body,ideal_price_cents,created_at,updated_at,status,moderation_reason)
SELECT id,game_id,guest_key_hash,display_name,body,ideal_price_cents,created_at,updated_at,status,moderation_reason FROM feedback;
DROP TABLE feedback;
ALTER TABLE feedback_next RENAME TO feedback;
CREATE INDEX feedback_game_date_idx ON feedback(game_id,status,created_at DESC,id);
