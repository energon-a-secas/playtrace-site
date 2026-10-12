DROP TRIGGER IF EXISTS feedback_review_updated;
DROP TRIGGER IF EXISTS feedback_review_deleted;
DROP INDEX IF EXISTS feedback_recent_context;
-- Keep the additive experience column and its answers. Older handlers ignore
-- it, and the complete schema rollback drops feedback in 0002.
