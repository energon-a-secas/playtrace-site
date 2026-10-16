-- Private model drafts and human decisions. No text copied into this table.
CREATE TABLE post_research (
  post_id TEXT PRIMARY KEY REFERENCES source_posts(id) ON DELETE CASCADE,
  game_id TEXT NOT NULL REFERENCES games(id) ON DELETE CASCADE,
  version TEXT NOT NULL,
  fingerprint TEXT NOT NULL,
  source_hash TEXT NOT NULL,
  model TEXT NOT NULL,
  classified_at TEXT NOT NULL,
  labels_json TEXT NOT NULL CHECK(json_valid(labels_json)),
  status TEXT NOT NULL DEFAULT 'draft' CHECK(status IN('draft','reviewed','dismissed')),
  reviewed_labels_json TEXT CHECK(reviewed_labels_json IS NULL OR json_valid(reviewed_labels_json)),
  questions_json TEXT NOT NULL DEFAULT '[]' CHECK(json_valid(questions_json)),
  reviewed_at TEXT,
  reviewed_by TEXT,
  revision INTEGER NOT NULL DEFAULT 1
);
CREATE INDEX post_research_status_idx ON post_research(status,classified_at);
-- Source removals must remove their dependent research, including drafts.
CREATE TRIGGER post_research_source_withdrawn AFTER UPDATE OF status ON source_posts
WHEN NEW.status!='published' BEGIN
  DELETE FROM post_research WHERE post_id=NEW.id;
END;
CREATE TRIGGER post_research_game_withdrawn AFTER UPDATE OF status ON games
WHEN NEW.status!='published' BEGIN
  DELETE FROM post_research WHERE game_id=NEW.id;
END;
CREATE TRIGGER post_research_evidence_withdrawn AFTER UPDATE OF payload_json ON source_evidence
WHEN json_extract(NEW.payload_json,'$.state')!='available' BEGIN
  DELETE FROM post_research WHERE post_id=NEW.post_id;
END;
