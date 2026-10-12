-- Accepted source-linked observations are separate from source imports and
-- administrator overrides. Explicit admin choices always take precedence.
CREATE TABLE project_facts (
  game_id TEXT NOT NULL REFERENCES games(id) ON DELETE CASCADE,
  field TEXT NOT NULL CHECK(field IN('title','summary','category','stage','platforms','projectUrl','repositoryUrl')),
  value_json TEXT NOT NULL CHECK(json_valid(value_json)),
  source_url TEXT NOT NULL,
  evidence_text TEXT NOT NULL CHECK(length(evidence_text)<=1200),
  checked_at TEXT NOT NULL,
  PRIMARY KEY(game_id,field)
);
