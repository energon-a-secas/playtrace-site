CREATE TABLE quiz_rounds (
  id TEXT PRIMARY KEY NOT NULL,
  guest_key_hash TEXT NOT NULL,
  pool_version TEXT NOT NULL,
  questions_json TEXT NOT NULL CHECK(json_valid(questions_json) AND json_array_length(questions_json)=5),
  created_at TEXT NOT NULL,
  expires_at INTEGER NOT NULL,
  answers_json TEXT CHECK(answers_json IS NULL OR (json_valid(answers_json) AND json_array_length(answers_json)=5)),
  completed_at TEXT,
  CHECK((answers_json IS NULL)=(completed_at IS NULL))
);
CREATE INDEX quiz_rounds_guest_idx ON quiz_rounds(guest_key_hash);
CREATE INDEX quiz_rounds_expiry_idx ON quiz_rounds(expires_at) WHERE completed_at IS NULL;
CREATE TABLE quiz_answers (
  round_id TEXT NOT NULL REFERENCES quiz_rounds(id) ON DELETE CASCADE,
  question INTEGER NOT NULL CHECK(question BETWEEN 0 AND 4),
  game_id TEXT NOT NULL REFERENCES games(id) ON DELETE CASCADE,
  choice_id TEXT REFERENCES games(id) ON DELETE CASCADE,
  skipped_reason TEXT CHECK(skipped_reason IS NULL OR skipped_reason IN ('skip','image-unavailable')),
  correct INTEGER NOT NULL CHECK(correct IN (0,1)),
  CHECK((choice_id IS NULL)=(skipped_reason IS NOT NULL)),
  CHECK(correct=CASE WHEN choice_id=game_id THEN 1 ELSE 0 END),
  PRIMARY KEY(round_id,question)
);
CREATE INDEX quiz_answers_game_idx ON quiz_answers(game_id,choice_id);
