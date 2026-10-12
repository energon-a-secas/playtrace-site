import { query } from './store.mjs';

export const publicFeedbackUrl = (gameId, id) => `https://playtrace.neorgon.com/games/${gameId}/?feedback=${id}#feedback-${id}`;
export async function siteFeedbackSample(db, gameId, since, until) {
  const [notes, totals] = await db.batch([
    query(db, `SELECT id,display_name,body,created_at,updated_at,experience FROM feedback
      WHERE game_id=? AND status='published' AND updated_at>=? AND updated_at<=? AND length(trim(body))>=8
      ORDER BY updated_at DESC,id LIMIT 31`, gameId, since, until),
    query(db, `SELECT count(*) AS contributions,sum(CASE WHEN length(trim(body))>=8 THEN 1 ELSE 0 END) AS notes FROM feedback
      WHERE game_id=? AND status='published' AND updated_at>=? AND updated_at<=?`, gameId, since, until),
  ]);
  return { evidence: notes.results.slice(0,30).map(row => ({ source: 'playtrace', id: row.id, author: row.display_name,
    body: row.body, createdAt: row.created_at, updatedAt: row.updated_at, experience: row.experience,
    url: publicFeedbackUrl(gameId, row.id) })), contributions: totals.results[0].contributions,
    eligibleNotes: totals.results[0].notes || 0, sampled: notes.results.length > 30 };
}

// Use in the same SQLite statement/transaction that saves a draft or review.
// Names and timestamps are checked too, including a same-millisecond edit.
export function currentNotesSql(path) {
  if (!['evidence','citations'].includes(path)) throw new Error('Invalid source path');
  return `NOT EXISTS(SELECT 1 FROM json_each(?,'$.${path}') e WHERE json_extract(e.value,'$.source')='playtrace'
    AND NOT EXISTS(SELECT 1 FROM feedback f WHERE f.id=json_extract(e.value,'$.id') AND f.game_id=? AND f.status='published'
      AND f.updated_at=json_extract(e.value,'$.updatedAt') AND f.display_name=json_extract(e.value,'$.author')
      AND f.body=json_extract(e.value,'$.body') AND f.experience=json_extract(e.value,'$.experience')))`;
}
