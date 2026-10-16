import { query } from './store.mjs';

export function scoreObservation(raw, now, provider = 'archive') {
  if (!/^[a-z0-9]{5,12}$/.test(raw?.id || '') || !Number.isSafeInteger(raw.score) || Math.abs(raw.score) > 1e9) return null;
  if(!['archive','reddit'].includes(provider))return null;
  const seconds = provider==='reddit'?now/1000:raw.retrieved_on;
  const observedAt = typeof seconds === 'number' && seconds >= 1104537600 && seconds * 1000 <= now + 30000
    && (!Number.isFinite(raw.created_utc) || seconds >= raw.created_utc) ? new Date(seconds * 1000).toISOString() : null;
  return { postId: raw.id, score: raw.score, observedAt, checkedAt: new Date(now).toISOString(),provider,
    commentCount:Number.isSafeInteger(raw.num_comments)&&raw.num_comments>=0&&raw.num_comments<=1e9?raw.num_comments:null };
}

export function saveScoreObservations(db, observations, { initialOnly = false } = {}) {
  // Keep the small observation batch as the outer loop; a reordered join scans
  // all published games once per incoming score, including no-op initial seeds.
  return query(db, `INSERT INTO reddit_scores(post_id,score,observed_at,checked_at,provider,comment_count)
    SELECT json_extract(j.value,'$.postId'),json_extract(j.value,'$.score'),json_extract(j.value,'$.observedAt'),json_extract(j.value,'$.checkedAt'),COALESCE(json_extract(j.value,'$.provider'),'archive'),json_extract(j.value,'$.commentCount')
    FROM json_each(?) j CROSS JOIN source_posts p ON p.id=json_extract(j.value,'$.postId')
    CROSS JOIN games g ON g.id=p.game_id WHERE p.status='published' AND g.status='published'
      AND NOT EXISTS(SELECT 1 FROM removals WHERE game_id=g.id)
    ON CONFLICT(post_id) ${initialOnly ? 'DO NOTHING' : `DO UPDATE SET score=excluded.score,observed_at=excluded.observed_at,checked_at=excluded.checked_at,provider=excluded.provider,comment_count=excluded.comment_count
    WHERE (reddit_scores.observed_at IS NULL OR excluded.observed_at>reddit_scores.observed_at)
      AND excluded.checked_at>=reddit_scores.checked_at`}`, JSON.stringify(observations));
}

// Highest single source-post score. Adding posts never adds their scores together.
// Resolve membership at read time so merges, splits and removals remain correct.
export function projectScoresQuery(db, ids) {
  // Resolve the best post and coverage through the game/post indexes. Keeping
  // requested IDs outermost avoids scanning unrelated games; separate lookups
  // also avoid the two window functions materializing every scored post.
  return query(db, `WITH selected AS (SELECT DISTINCT value AS game_id FROM json_each(?))
    SELECT selected.game_id,s.post_id,s.score,s.observed_at,s.checked_at,
      (SELECT count(*) FROM source_posts p CROSS JOIN reddit_scores covered ON covered.post_id=p.id
        WHERE p.game_id=selected.game_id AND p.status='published') AS covered_posts
    FROM selected CROSS JOIN reddit_scores s ON s.post_id=(
      SELECT p.id FROM source_posts p CROSS JOIN reddit_scores best ON best.post_id=p.id
      WHERE p.game_id=selected.game_id AND p.status='published'
      ORDER BY best.score DESC,p.created_at DESC,p.id DESC LIMIT 1)
    ORDER BY selected.game_id`, JSON.stringify(ids));
}

export function publicScore(row, posts) {
  const post = posts.find(post => post.id === row?.post_id);
  return post ? { score: row.score, postId: post.id, url: post.url, observedAt: row.observed_at,
    checkedAt: row.checked_at, coveredPosts: row.covered_posts, totalPosts: posts.length } : null;
}
