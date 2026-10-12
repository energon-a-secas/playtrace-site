import { query } from './store.mjs';

export const RANKING_POLICY = Object.freeze({ minimumRatings: 3, priorMean: 3, priorWeight: 5 });
export function weightedRating(count, sum) {
  if (!Number.isSafeInteger(count) || count < RANKING_POLICY.minimumRatings || sum < count || sum > count * 5) return null;
  return (sum + RANKING_POLICY.priorMean * RANKING_POLICY.priorWeight) / (count + RANKING_POLICY.priorWeight);
}
export async function communityRanks(db) {
  const rows = await query(db, `SELECT r.game_id,count(*) AS count,sum(r.stars) AS total
    FROM ratings r JOIN games g ON g.id=r.game_id WHERE g.status='published'
      AND NOT EXISTS(SELECT 1 FROM removals WHERE game_id=g.id)
    GROUP BY r.game_id HAVING count(*)>=?`, RANKING_POLICY.minimumRatings).all();
  return rows.results.map(row => ({ gameId: row.game_id, count: row.count, average: row.total / row.count,
    weighted: weightedRating(row.count, row.total) })).sort((a, b) => b.weighted - a.weighted || b.count - a.count || a.gameId.localeCompare(b.gameId));
}
