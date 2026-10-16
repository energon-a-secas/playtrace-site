DROP TRIGGER IF EXISTS reddit_observation_insert;
DROP TRIGGER IF EXISTS reddit_observation_update;
DROP TRIGGER IF EXISTS reddit_observations_removed;
DROP TRIGGER IF EXISTS reddit_observations_post_withdrawn;
DROP TRIGGER IF EXISTS reddit_observations_evidence_removed;
DROP TABLE IF EXISTS reddit_observations;
ALTER TABLE reddit_scores DROP COLUMN provider;
ALTER TABLE reddit_scores DROP COLUMN comment_count;
