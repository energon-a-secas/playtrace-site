-- Initial schema rollback for an empty or disposable local database only.
-- Production rollback disables writes and restores the previous Worker instead.
-- Export and retain production data before considering any destructive rollback.
PRAGMA foreign_keys = ON;

DROP TABLE IF EXISTS media_assets;
DROP TABLE IF EXISTS follows;
DROP TABLE IF EXISTS price_signals;
DROP TABLE IF EXISTS source_posts;
DROP TABLE IF EXISTS rate_limits;
DROP TABLE IF EXISTS app_meta;
DROP TABLE IF EXISTS games;
DROP TABLE IF EXISTS removals;
