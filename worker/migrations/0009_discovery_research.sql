-- Guest ratings, reusable research and an evidence-first editorial queue.
CREATE TABLE ratings (
  game_id TEXT NOT NULL REFERENCES games(id) ON DELETE CASCADE,
  guest_key_hash TEXT NOT NULL,
  stars INTEGER NOT NULL CHECK(typeof(stars)='integer' AND stars BETWEEN 1 AND 5),
  updated_at TEXT NOT NULL,
  PRIMARY KEY(game_id,guest_key_hash)
);
CREATE TABLE game_aliases (
  alias_id TEXT PRIMARY KEY NOT NULL,
  game_id TEXT NOT NULL REFERENCES games(id) ON DELETE CASCADE,
  reason TEXT NOT NULL,
  created_at TEXT NOT NULL,
  CHECK(alias_id<>game_id)
);
CREATE TABLE project_references (
  game_id TEXT NOT NULL REFERENCES games(id) ON DELETE CASCADE,
  url TEXT NOT NULL,
  title TEXT NOT NULL,
  source_post_id TEXT NOT NULL,
  PRIMARY KEY(game_id,url)
);
CREATE TABLE project_enrichment (
  game_id TEXT PRIMARY KEY NOT NULL REFERENCES games(id) ON DELETE CASCADE,
  project_url TEXT NOT NULL,
  payload_json TEXT NOT NULL CHECK(json_valid(payload_json)),
  checked_at TEXT NOT NULL
);
CREATE TABLE questionnaires (
  id TEXT PRIMARY KEY NOT NULL,
  title TEXT NOT NULL,
  category TEXT NOT NULL,
  game_id TEXT REFERENCES games(id) ON DELETE CASCADE,
  questions_json TEXT NOT NULL CHECK(json_valid(questions_json)),
  revision INTEGER NOT NULL DEFAULT 1,
  active INTEGER NOT NULL DEFAULT 1 CHECK(active IN(0,1)),
  updated_at TEXT NOT NULL,
  updated_by TEXT NOT NULL
);
CREATE TABLE research_responses (
  questionnaire_id TEXT NOT NULL REFERENCES questionnaires(id) ON DELETE CASCADE,
  game_id TEXT NOT NULL REFERENCES games(id) ON DELETE CASCADE,
  guest_key_hash TEXT NOT NULL,
  revision INTEGER NOT NULL,
  questions_json TEXT NOT NULL CHECK(json_valid(questions_json)),
  answers_json TEXT NOT NULL CHECK(json_valid(answers_json)),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  PRIMARY KEY(questionnaire_id,game_id,guest_key_hash)
);
CREATE INDEX research_game ON research_responses(game_id,updated_at);
CREATE TABLE editorial_jobs (
  id TEXT PRIMARY KEY NOT NULL,
  game_id TEXT NOT NULL REFERENCES games(id) ON DELETE CASCADE,
  kind TEXT NOT NULL CHECK(kind IN('links','store','feedback','references','research')),
  status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN('pending','running','ready','failed','published','dismissed')),
  window_start TEXT NOT NULL,
  payload_json TEXT NOT NULL DEFAULT '{}' CHECK(json_valid(payload_json)),
  attempts INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  requested_by TEXT NOT NULL,
  UNIQUE(game_id,kind,window_start)
);
CREATE INDEX editorial_queue ON editorial_jobs(status,created_at);
CREATE TABLE feedback_reviews (
  game_id TEXT PRIMARY KEY NOT NULL REFERENCES games(id) ON DELETE CASCADE,
  payload_json TEXT NOT NULL CHECK(json_valid(payload_json)),
  published_at TEXT NOT NULL,
  published_by TEXT NOT NULL
);
