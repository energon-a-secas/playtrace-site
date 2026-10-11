-- Retain only allowlisted public source evidence, separately from catalogue DTOs.
CREATE TABLE source_evidence (
  post_id TEXT PRIMARY KEY NOT NULL REFERENCES source_posts(id) ON DELETE CASCADE,
  payload_json TEXT NOT NULL CHECK(json_valid(payload_json)),
  content_hash TEXT NOT NULL,
  checked_at TEXT NOT NULL,
  changed_at TEXT NOT NULL
);
CREATE INDEX source_evidence_checked ON source_evidence(checked_at,post_id);
CREATE INDEX editorial_kind_queue ON editorial_jobs(status,kind,created_at,id);
CREATE INDEX editorial_game_maintenance ON editorial_jobs(game_id,kind,status,updated_at);
-- Refresh old basic-only Steam payloads through the existing six-app batch.
UPDATE steam_cache SET retry_at=0 WHERE json_extract(payload_json,'$.metadataVersion') IS NULL;

-- A transactional count avoids scanning every published game on every page.
INSERT INTO app_meta(key,value_json) SELECT 'catalog_total',CAST(count(*) AS TEXT)
  FROM games WHERE status='published' AND NOT EXISTS(SELECT 1 FROM removals WHERE game_id=games.id);
CREATE TRIGGER catalog_count_insert AFTER INSERT ON games
WHEN NEW.status='published' AND NOT EXISTS(SELECT 1 FROM removals WHERE game_id=NEW.id)
BEGIN UPDATE app_meta SET value_json=CAST(CAST(value_json AS INTEGER)+1 AS TEXT) WHERE key='catalog_total'; END;
CREATE TRIGGER catalog_count_delete AFTER DELETE ON games
WHEN OLD.status='published' AND NOT EXISTS(SELECT 1 FROM removals WHERE game_id=OLD.id)
BEGIN UPDATE app_meta SET value_json=CAST(CAST(value_json AS INTEGER)-1 AS TEXT) WHERE key='catalog_total'; END;
CREATE TRIGGER catalog_count_status AFTER UPDATE OF status ON games
WHEN OLD.status<>NEW.status AND NOT EXISTS(SELECT 1 FROM removals WHERE game_id=NEW.id)
BEGIN UPDATE app_meta SET value_json=CAST(CAST(value_json AS INTEGER)+(NEW.status='published')-(OLD.status='published') AS TEXT) WHERE key='catalog_total'; END;
CREATE TRIGGER catalog_count_remove AFTER INSERT ON removals
WHEN EXISTS(SELECT 1 FROM games WHERE id=NEW.game_id AND status='published')
BEGIN UPDATE app_meta SET value_json=CAST(CAST(value_json AS INTEGER)-1 AS TEXT) WHERE key='catalog_total'; END;
CREATE TRIGGER catalog_count_restore AFTER DELETE ON removals
WHEN EXISTS(SELECT 1 FROM games WHERE id=OLD.game_id AND status='published')
BEGIN UPDATE app_meta SET value_json=CAST(CAST(value_json AS INTEGER)+1 AS TEXT) WHERE key='catalog_total'; END;
