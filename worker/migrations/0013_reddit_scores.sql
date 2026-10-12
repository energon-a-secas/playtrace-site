-- Archive observations, separate from editable details and repeat imports.
CREATE TABLE reddit_scores (
  post_id TEXT PRIMARY KEY NOT NULL REFERENCES source_posts(id) ON DELETE CASCADE,
  score INTEGER NOT NULL CHECK(score BETWEEN -1000000000 AND 1000000000),
  observed_at TEXT,
  checked_at TEXT NOT NULL
);
