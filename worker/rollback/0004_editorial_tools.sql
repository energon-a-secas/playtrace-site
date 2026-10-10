-- Destructive: for disposable test databases, or an explicitly authorized data
-- rollback. A code rollback should normally retain these additive tables.
DROP TABLE IF EXISTS preview_overrides;
DROP TABLE IF EXISTS change_requests;
DROP TABLE IF EXISTS steam_cache;
DROP TABLE IF EXISTS admins;
ALTER TABLE source_posts DROP COLUMN media_checked_at;
