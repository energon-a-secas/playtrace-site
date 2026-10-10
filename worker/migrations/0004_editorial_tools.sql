-- Roles are resolved from a verified Clerk identity on the server.
CREATE TABLE admins (
  email TEXT PRIMARY KEY NOT NULL,
  subject TEXT UNIQUE,
  role TEXT NOT NULL CHECK(role IN ('owner','admin')),
  enabled INTEGER NOT NULL DEFAULT 1 CHECK(enabled IN (0,1)),
  created_at TEXT NOT NULL,
  updated_by TEXT NOT NULL
);
INSERT INTO admins(email,role,created_at,updated_by)
VALUES('luciano.adonis.villarroel@gmail.com','owner','2026-10-10T00:00:00.000Z','bootstrap');

CREATE TABLE change_requests (
  id TEXT PRIMARY KEY NOT NULL,
  game_id TEXT NOT NULL REFERENCES games(id) ON DELETE CASCADE,
  kind TEXT NOT NULL CHECK(kind IN ('image','details','media','removal','other')),
  body TEXT NOT NULL CHECK(length(body) BETWEEN 12 AND 1500),
  suggested_url TEXT,
  reporter_hash TEXT NOT NULL,
  created_at TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'open' CHECK(status IN ('open','resolved','dismissed')),
  admin_note TEXT NOT NULL DEFAULT '',
  resolved_by TEXT,
  resolved_at TEXT
);
CREATE INDEX change_requests_inbox_idx ON change_requests(status,created_at DESC,id);

CREATE TABLE preview_overrides (
  game_id TEXT PRIMARY KEY NOT NULL REFERENCES games(id) ON DELETE CASCADE,
  preview_json TEXT NOT NULL CHECK(json_valid(preview_json)),
  approved_by TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE TABLE steam_cache (
  app_id TEXT PRIMARY KEY NOT NULL,
  payload_json TEXT CHECK(payload_json IS NULL OR json_valid(payload_json)),
  checked_at TEXT NOT NULL,
  retry_at INTEGER NOT NULL
);
ALTER TABLE source_posts ADD COLUMN media_checked_at TEXT;
