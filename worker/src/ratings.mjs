import { query, getGame } from './store.mjs';
import { guestIdentity } from './feedback.mjs';
import { mutationLimit } from './limits.mjs';
import { exactKeys, invalid, notFound } from './http.mjs';

export async function rating(db, gameId, guest = null) {
  await getGame(db, gameId);
  const row = await query(db, 'SELECT count(*) AS count,round(avg(stars),1) AS average FROM ratings WHERE game_id=?', gameId).first();
  const own = guest ? await query(db, 'SELECT stars FROM ratings WHERE game_id=? AND guest_key_hash=?', gameId, guest).first() : null;
  return { gameId, count: row.count, average: row.average, mine: own?.stars || null };
}
export async function rateGame(db, env, request, gameId, body, deps) {
  await getGame(db, gameId);
  const guest = await guestIdentity(request, env);
  if (request.method === 'GET') return rating(db, gameId, guest);
  if (request.method === 'PUT') { exactKeys(body, ['stars']); if (!Number.isInteger(body.stars) || body.stars < 1 || body.stars > 5) throw invalid('Choose one to five stars.'); }
  await mutationLimit(db, env, `guest:${guest}`, request, request.method === 'DELETE' ? 'privacy' : 'price', deps.now());
  if (request.method === 'DELETE') await query(db, 'DELETE FROM ratings WHERE game_id=? AND guest_key_hash=?', gameId, guest).run();
  else {
    const saved = await query(db, `INSERT INTO ratings(game_id,guest_key_hash,stars,updated_at)
      SELECT id,?,?,? FROM games WHERE id=? AND status='published' AND NOT EXISTS(SELECT 1 FROM removals WHERE game_id=games.id)
      ON CONFLICT(game_id,guest_key_hash) DO UPDATE SET stars=excluded.stars,updated_at=excluded.updated_at RETURNING game_id`, guest, body.stars, new Date(deps.now()).toISOString(), gameId).first();
    if (!saved) throw notFound();
  }
  return rating(db, gameId, guest);
}
