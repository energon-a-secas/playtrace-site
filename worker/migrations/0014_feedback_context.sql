ALTER TABLE feedback ADD COLUMN experience TEXT NOT NULL DEFAULT 'unspecified'
  CHECK(experience IN('unspecified','preview','played'));
CREATE INDEX feedback_recent_context ON feedback(game_id,status,updated_at,experience);

-- Removing or changing a public note also withdraws every derived copy. New
-- drafts have a separate atomic source check for edits while Jev is running.
CREATE TRIGGER feedback_review_updated AFTER UPDATE ON feedback BEGIN
  DELETE FROM feedback_reviews WHERE game_id=OLD.game_id
    AND EXISTS(SELECT 1 FROM json_each(payload_json,'$.citations') c
      WHERE json_extract(c.value,'$.source')='playtrace' AND json_extract(c.value,'$.id')=OLD.id);
  DELETE FROM editorial_jobs WHERE kind='feedback' AND game_id=OLD.game_id
    AND EXISTS(SELECT 1 FROM json_each(payload_json,'$.evidence') e
      WHERE json_extract(e.value,'$.source')='playtrace' AND json_extract(e.value,'$.id')=OLD.id);
END;
CREATE TRIGGER feedback_review_deleted AFTER DELETE ON feedback BEGIN
  DELETE FROM feedback_reviews WHERE game_id=OLD.game_id
    AND EXISTS(SELECT 1 FROM json_each(payload_json,'$.citations') c
      WHERE json_extract(c.value,'$.source')='playtrace' AND json_extract(c.value,'$.id')=OLD.id);
  DELETE FROM editorial_jobs WHERE kind='feedback' AND game_id=OLD.game_id
    AND EXISTS(SELECT 1 FROM json_each(payload_json,'$.evidence') e
      WHERE json_extract(e.value,'$.source')='playtrace' AND json_extract(e.value,'$.id')=OLD.id);
END;
