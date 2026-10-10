-- Playtrace schema v1. Apply with D1 migrations; no seed records or credentials.
PRAGMA foreign_keys = ON;

CREATE TABLE games (
  id TEXT PRIMARY KEY NOT NULL,
  author_key TEXT NOT NULL,
  project_url TEXT,
  updated_at TEXT NOT NULL,
  payload_json TEXT NOT NULL CHECK (json_valid(payload_json)),
  status TEXT NOT NULL DEFAULT 'published'
    CHECK (status IN ('published', 'hidden', 'removed'))
);
CREATE INDEX games_author_key_idx ON games(author_key);
CREATE INDEX games_updated_at_idx ON games(updated_at);

CREATE TABLE source_posts (
  id TEXT PRIMARY KEY NOT NULL,
  game_id TEXT REFERENCES games(id) ON DELETE CASCADE,
  author_key TEXT NOT NULL,
  created_at TEXT NOT NULL,
  retrieved_at TEXT NOT NULL,
  payload_json TEXT NOT NULL CHECK (json_valid(payload_json)),
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'published', 'rejected'))
);
CREATE INDEX source_posts_game_id_idx ON source_posts(game_id);

CREATE TABLE price_signals (
  subject TEXT NOT NULL,
  game_id TEXT NOT NULL REFERENCES games(id) ON DELETE CASCADE,
  amount_cents INTEGER NOT NULL
    CHECK (typeof(amount_cents) = 'integer' AND amount_cents BETWEEN 0 AND 10000),
  currency TEXT NOT NULL CHECK (currency = 'USD'),
  updated_at TEXT NOT NULL,
  PRIMARY KEY (subject, game_id)
);
CREATE INDEX price_signals_game_id_idx ON price_signals(game_id);

CREATE TABLE follows (
  subject TEXT NOT NULL,
  game_id TEXT NOT NULL REFERENCES games(id) ON DELETE CASCADE,
  created_at TEXT NOT NULL,
  PRIMARY KEY (subject, game_id)
);
CREATE INDEX follows_game_id_idx ON follows(game_id);

CREATE TABLE app_meta (
  key TEXT PRIMARY KEY NOT NULL,
  value_json TEXT NOT NULL CHECK (json_valid(value_json))
);

CREATE TABLE rate_limits (
  bucket_key TEXT PRIMARY KEY NOT NULL,
  count INTEGER NOT NULL CHECK (typeof(count) = 'integer' AND count >= 0),
  expires_at INTEGER NOT NULL CHECK (typeof(expires_at) = 'integer')
);
CREATE INDEX rate_limits_expires_at_idx ON rate_limits(expires_at);

CREATE TABLE media_assets (
  id TEXT PRIMARY KEY NOT NULL,
  game_id TEXT NOT NULL REFERENCES games(id) ON DELETE CASCADE,
  object_key TEXT NOT NULL UNIQUE,
  source_url TEXT NOT NULL,
  consent_evidence_url TEXT NOT NULL,
  consent_note TEXT NOT NULL,
  approved_by TEXT NOT NULL,
  created_at TEXT NOT NULL,
  mime_type TEXT NOT NULL,
  byte_size INTEGER NOT NULL CHECK (typeof(byte_size) = 'integer' AND byte_size > 0)
);
CREATE INDEX media_assets_game_id_idx ON media_assets(game_id);

-- No FK: removal tombstones must survive deleting the game they suppress.
CREATE TABLE removals (
  game_id TEXT PRIMARY KEY NOT NULL,
  source_post_ids_json TEXT NOT NULL CHECK (json_valid(source_post_ids_json)),
  reason TEXT NOT NULL,
  removed_at TEXT NOT NULL,
  removed_by TEXT NOT NULL
);
