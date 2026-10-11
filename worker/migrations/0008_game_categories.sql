CREATE TABLE game_categories (
  id TEXT PRIMARY KEY NOT NULL CHECK(length(id) BETWEEN 1 AND 48 AND id <> 'all'),
  label TEXT NOT NULL CHECK(length(label) BETWEEN 1 AND 48),
  label_key TEXT NOT NULL UNIQUE,
  created_by TEXT NOT NULL,
  created_at TEXT NOT NULL
);
INSERT INTO game_categories(id,label,label_key,created_by,created_at) VALUES
 ('action','Action','action','bootstrap','2026-10-11T00:00:00.000Z'),
 ('adventure','Adventure','adventure','bootstrap','2026-10-11T00:00:00.000Z'),
 ('puzzle','Puzzle','puzzle','bootstrap','2026-10-11T00:00:00.000Z'),
 ('strategy','Strategy','strategy','bootstrap','2026-10-11T00:00:00.000Z'),
 ('rpg','RPG','rpg','bootstrap','2026-10-11T00:00:00.000Z'),
 ('simulation','Simulation','simulation','bootstrap','2026-10-11T00:00:00.000Z'),
 ('arcade','Arcade','arcade','bootstrap','2026-10-11T00:00:00.000Z'),
 ('clicker','Clicker','clicker','bootstrap','2026-10-11T00:00:00.000Z'),
 ('other','Other','other','bootstrap','2026-10-11T00:00:00.000Z');
