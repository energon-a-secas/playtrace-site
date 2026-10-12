-- Removes only anonymous measurement storage. Existing community data survives.
DROP TABLE IF EXISTS usage_receipts;
DROP TABLE IF EXISTS usage_daily;
