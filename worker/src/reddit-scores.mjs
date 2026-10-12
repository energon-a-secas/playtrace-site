import { query } from './store.mjs';

export function scoreObservation(raw, now) {
  if (!/^[a-z0-9]{5,12}$/.test(raw?.id || '') || !Number.isSafeInteger(raw.score) || Math.abs(raw.score) > 1e9) return null;
  const seconds = raw.retrieved_on;
  const observedAt = typeof seconds === 'number' && seconds >= 1104537600 && seconds * 1000 <= now + 30000
    && (!Number.isFinite(raw.created_utc) || seconds >= raw.created_utc) ? new Date(seconds * 1000).toISOString() : null;
  return { postId: raw.id, score: raw.score, observedAt, checkedAt: new Date(now).toISOString() };
}

export function saveScoreObservations(db, observations) {
  return query(db, `INSERT INTO reddit_scores(post_id,score,observed_at,checked_at)
    SELECT json_extract(j.value,'$.postId'),json_extract(j.value,'$.score'),json_extract(j.value,'$.observedAt'),json_extract(j.value,'$.checkedAt')
    FROM json_each(?) j JOIN source_posts p ON p.id=json_extract(j.value,'$.postId')
    JOIN games g ON g.id=p.game_id WHERE p.status='published' AND g.status='published'
      AND NOT EXISTS(SELECT 1 FROM removals WHERE game_id=g.id)
    ON CONFLICT(post_id) DO UPDATE SET score=excluded.score,observed_at=excluded.observed_at,checked_at=excluded.checked_at
    WHERE (reddit_scores.observed_at IS NULL OR excluded.observed_at>=reddit_scores.observed_at)
      AND excluded.checked_at>=reddit_scores.checked_at`, JSON.stringify(observations));
}

// Highest single source-post score. Adding posts never adds their scores together.
// Resolve membership at read time so merges, splits and removals remain correct.
export function projectScoresQuery(db, ids) {
  return query(db, `SELECT game_id,post_id,score,observed_at,checked_at,covered_posts FROM (
    SELECT p.game_id,s.*,count(*) OVER(PARTITION BY p.game_id) AS covered_posts,
      row_number() OVER(PARTITION BY p.game_id ORDER BY s.score DESC,p.created_at DESC,p.id DESC) AS rank
    FROM source_posts p JOIN reddit_scores s ON s.post_id=p.id
    WHERE p.status='published' AND p.game_id IN(SELECT value FROM json_each(?))) WHERE rank=1`, JSON.stringify(ids));
}

export function publicScore(row, posts) {
  const post = posts.find(post => post.id === row?.post_id);
  return post ? { score: row.score, postId: post.id, url: post.url, observedAt: row.observed_at,
    checkedAt: row.checked_at, coveredPosts: row.covered_posts, totalPosts: posts.length } : null;
}
