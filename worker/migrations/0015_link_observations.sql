-- Point-in-time checks, not uptime measurements. Keep up to 52 observations per
-- project. Import the existing last check with its original timestamp.
CREATE TABLE link_observations (
  game_id TEXT NOT NULL REFERENCES games(id) ON DELETE CASCADE,
  project_url TEXT NOT NULL,
  checked_at TEXT NOT NULL,
  status TEXT NOT NULL CHECK(status IN('reachable','broken','blocked','unverified')),
  http_status INTEGER,
  final_url TEXT,
  reason TEXT,
  redirect_count INTEGER,
  PRIMARY KEY(game_id,project_url,checked_at)
);
CREATE INDEX link_observations_recent ON link_observations(game_id,checked_at DESC);
INSERT INTO link_observations
  SELECT game_id,project_url,checked_at,json_extract(payload_json,'$.status'),
    json_extract(payload_json,'$.httpStatus'),json_extract(payload_json,'$.finalUrl'),
    json_extract(payload_json,'$.failureReason'),json_extract(payload_json,'$.redirectCount')
  FROM project_enrichment WHERE json_extract(payload_json,'$.status') IN('reachable','broken','blocked','unverified');
CREATE TRIGGER link_check_inserted AFTER INSERT ON project_enrichment BEGIN
  INSERT INTO link_observations SELECT NEW.game_id,NEW.project_url,NEW.checked_at,
    json_extract(NEW.payload_json,'$.status'),json_extract(NEW.payload_json,'$.httpStatus'),
    json_extract(NEW.payload_json,'$.finalUrl'),json_extract(NEW.payload_json,'$.failureReason'),json_extract(NEW.payload_json,'$.redirectCount')
    WHERE json_extract(NEW.payload_json,'$.status') IN('reachable','broken','blocked','unverified')
    ON CONFLICT(game_id,project_url,checked_at) DO UPDATE SET status=excluded.status,http_status=excluded.http_status,final_url=excluded.final_url,reason=excluded.reason,redirect_count=excluded.redirect_count;
  DELETE FROM link_observations WHERE game_id=NEW.game_id AND (project_url,checked_at) IN
    (SELECT project_url,checked_at FROM link_observations WHERE game_id=NEW.game_id ORDER BY checked_at DESC,project_url LIMIT -1 OFFSET 52);
END;
CREATE TRIGGER link_check_updated AFTER UPDATE ON project_enrichment BEGIN
  INSERT INTO link_observations SELECT NEW.game_id,NEW.project_url,NEW.checked_at,
    json_extract(NEW.payload_json,'$.status'),json_extract(NEW.payload_json,'$.httpStatus'),
    json_extract(NEW.payload_json,'$.finalUrl'),json_extract(NEW.payload_json,'$.failureReason'),json_extract(NEW.payload_json,'$.redirectCount')
    WHERE json_extract(NEW.payload_json,'$.status') IN('reachable','broken','blocked','unverified')
    ON CONFLICT(game_id,project_url,checked_at) DO UPDATE SET status=excluded.status,http_status=excluded.http_status,final_url=excluded.final_url,reason=excluded.reason,redirect_count=excluded.redirect_count;
  DELETE FROM link_observations WHERE game_id=NEW.game_id AND (project_url,checked_at) IN
    (SELECT project_url,checked_at FROM link_observations WHERE game_id=NEW.game_id ORDER BY checked_at DESC,project_url LIMIT -1 OFFSET 52);
END;
