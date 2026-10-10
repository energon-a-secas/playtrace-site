CREATE INDEX games_published_date_idx ON games(status, updated_at DESC, id);
