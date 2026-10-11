DROP TRIGGER catalog_count_restore;
DROP TRIGGER catalog_count_remove;
DROP TRIGGER catalog_count_status;
DROP TRIGGER catalog_count_delete;
DROP TRIGGER catalog_count_insert;
DELETE FROM app_meta WHERE key='catalog_total';
DROP INDEX editorial_game_maintenance;
DROP INDEX editorial_kind_queue;
DROP TABLE source_evidence;
