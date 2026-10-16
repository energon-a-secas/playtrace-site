ALTER TABLE reddit_scores ADD COLUMN provider TEXT NOT NULL DEFAULT 'archive' CHECK(provider IN('archive','reddit'));
ALTER TABLE reddit_scores ADD COLUMN comment_count INTEGER CHECK(comment_count IS NULL OR comment_count BETWEEN 0 AND 1000000000);
CREATE TABLE reddit_observations (
  post_id TEXT NOT NULL REFERENCES source_posts(id) ON DELETE CASCADE,
  provider TEXT NOT NULL CHECK(provider IN('archive','reddit')),
  observed_at TEXT NOT NULL,
  checked_at TEXT NOT NULL,
  score INTEGER NOT NULL CHECK(score BETWEEN -1000000000 AND 1000000000),
  comment_count INTEGER CHECK(comment_count IS NULL OR comment_count BETWEEN 0 AND 1000000000),
  PRIMARY KEY(post_id,provider,observed_at)
);
INSERT INTO reddit_observations(post_id,provider,observed_at,checked_at,score)
 SELECT post_id,'archive',observed_at,checked_at,score FROM reddit_scores WHERE observed_at IS NOT NULL;
CREATE TRIGGER reddit_observation_insert AFTER INSERT ON reddit_scores WHEN NEW.observed_at IS NOT NULL BEGIN
 INSERT OR IGNORE INTO reddit_observations VALUES(NEW.post_id,NEW.provider,NEW.observed_at,NEW.checked_at,NEW.score,NEW.comment_count);
END;
CREATE TRIGGER reddit_observation_update AFTER UPDATE ON reddit_scores WHEN NEW.observed_at IS NOT NULL BEGIN
 INSERT OR IGNORE INTO reddit_observations VALUES(NEW.post_id,NEW.provider,NEW.observed_at,NEW.checked_at,NEW.score,NEW.comment_count);
 DELETE FROM reddit_observations WHERE post_id=NEW.post_id AND (provider,observed_at) NOT IN
   (SELECT provider,observed_at FROM reddit_observations WHERE post_id=NEW.post_id ORDER BY observed_at DESC LIMIT 52);
END;
CREATE TRIGGER reddit_observations_removed AFTER DELETE ON reddit_scores BEGIN
 DELETE FROM reddit_observations WHERE post_id=OLD.post_id;
END;
CREATE TRIGGER reddit_observations_post_withdrawn AFTER UPDATE OF status ON source_posts WHEN NEW.status!='published' BEGIN
 DELETE FROM reddit_scores WHERE post_id=NEW.id;
 DELETE FROM reddit_observations WHERE post_id=NEW.id;
END;
CREATE TRIGGER reddit_observations_evidence_removed AFTER UPDATE OF payload_json ON source_evidence
WHEN json_extract(NEW.payload_json,'$.state')='removed' BEGIN
 DELETE FROM reddit_scores WHERE post_id=NEW.post_id;
 DELETE FROM reddit_observations WHERE post_id=NEW.post_id;
END;
