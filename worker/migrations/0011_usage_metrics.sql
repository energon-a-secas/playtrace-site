-- Anonymous action totals. No account, browser, IP, referrer or search text.
CREATE TABLE usage_daily (
  day TEXT NOT NULL,
  event TEXT NOT NULL,
  page TEXT NOT NULL,
  game_id TEXT NOT NULL DEFAULT '',
  count INTEGER NOT NULL CHECK(count>=0),
  PRIMARY KEY(day,event,page,game_id)
);
-- Random delivery IDs prevent a retried batch from inflating counters.
-- They are unrelated to users and expire after one day.
CREATE TABLE usage_receipts (
  id TEXT PRIMARY KEY NOT NULL,
  expires_at INTEGER NOT NULL
);
CREATE INDEX usage_receipt_expiry ON usage_receipts(expires_at);
