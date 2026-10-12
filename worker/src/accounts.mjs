import { query, getGame } from './store.mjs';
import { invalid, exactKeys, notFound, unavailable } from './http.mjs';
import { mutationLimit, verifyChallenge, signalProtection } from './limits.mjs';

export function aggregate(gameId, values) {
  const base = { gameId, currency: 'USD', minimum: 5 };
  if (values.length < 5) return { ...base, state: 'insufficient', count: null, medianCents: null, buckets: null };
  const ordered = [...values].sort((a, b) => a - b), middle = Math.floor(ordered.length / 2);
  const medianCents = ordered.length % 2 ? ordered[middle] : Math.round((ordered[middle - 1] + ordered[middle]) / 2);
  return { ...base, state: 'ready', count: ordered.length, medianCents, buckets: [[0, 0], [1, 999], [1000, 1999], [2000, 3999], [4000, 10000]]
    .map(([minCents, maxCents]) => ({ minCents, maxCents, count: ordered.filter(n => n >= minCents && n <= maxCents).length })) };
}
export async function signals(db, gameId) {
  await getGame(db, gameId);
  // SQL computes public counts/median without returning private subjects or
  // unbounded account rows to the Worker. One PK row exists per account/game.
  const row = await query(db, `WITH prices AS(SELECT amount_cents,ROW_NUMBER() OVER(ORDER BY amount_cents) AS rn,
      COUNT(*) OVER() AS n FROM price_signals WHERE game_id=?)
    SELECT count(*) AS count,
      CAST(round(avg(CASE WHEN rn IN((n+1)/2,(n+2)/2) THEN amount_cents END)) AS INTEGER) AS median,
      sum(amount_cents=0) AS b0,sum(amount_cents BETWEEN 1 AND 999) AS b1,
      sum(amount_cents BETWEEN 1000 AND 1999) AS b2,sum(amount_cents BETWEEN 2000 AND 3999) AS b3,
      sum(amount_cents BETWEEN 4000 AND 10000) AS b4 FROM prices`, gameId).first();
  if (row.count < 5) return aggregate(gameId, []);
  return { gameId, currency: 'USD', state: 'ready', minimum: 5, count: row.count, medianCents: row.median,
    buckets: [[0, 0], [1, 999], [1000, 1999], [2000, 3999], [4000, 10000]].map(([minCents, maxCents], i) => ({ minCents, maxCents, count: row[`b${i}`] })) };
}
export async function getMe(db, subject) {
  const [follows, prices] = await db.batch([
    query(db, "SELECT f.game_id FROM follows f JOIN games g ON g.id=f.game_id WHERE f.subject=? AND g.status='published' ORDER BY f.created_at DESC LIMIT 2001", subject),
    query(db, "SELECT p.game_id,p.amount_cents,p.updated_at FROM price_signals p JOIN games g ON g.id=p.game_id WHERE p.subject=? AND g.status='published' ORDER BY p.updated_at DESC LIMIT 2001", subject),
  ]);
  return { follows: follows.results.map(row => row.game_id), prices: prices.results.map(row => ({ gameId: row.game_id, amountCents: row.amount_cents, currency: 'USD', updatedAt: row.updated_at })) };
}
export async function syncFavorites(db, env, subject, request, body, deps) {
  exactKeys(body, ['changes']);
  if (!Array.isArray(body.changes) || !body.changes.length || body.changes.length > 200) throw invalid();
  const ids = new Set();
  for (const change of body.changes) {
    exactKeys(change, ['gameId','saved']);
    if (!/^g_[a-z0-9]{5,12}$/.test(change.gameId) || typeof change.saved !== 'boolean' || ids.has(change.gameId)) throw invalid();
    ids.add(change.gameId);
  }
  await mutationLimit(db, env, subject, request, 'account', deps.now());
  const input = JSON.stringify(body.changes), now = new Date(deps.now()).toISOString();
  // Resolve consolidated entries and ignore withdrawn projects. A single batch
  // avoids one mutation/rate-limit charge for every locally saved favorite.
  const targets = `SELECT COALESCE(a.game_id,json_extract(j.value,'$.gameId')) AS id,json_extract(j.value,'$.saved') AS saved
    FROM json_each(?) j LEFT JOIN game_aliases a ON a.alias_id=json_extract(j.value,'$.gameId')`;
  await db.batch([
    query(db, `INSERT INTO follows(subject,game_id,created_at)
      SELECT ?,g.id,? FROM (${targets}) t JOIN games g ON g.id=t.id
      WHERE t.saved=1 AND g.status='published' AND NOT EXISTS(SELECT 1 FROM removals WHERE game_id=g.id)
      ON CONFLICT(subject,game_id) DO NOTHING`, subject, now, input),
    query(db, `DELETE FROM follows WHERE subject=? AND game_id IN(SELECT id FROM (${targets}) WHERE saved=0)`, subject, input),
  ]);
  return { follows: (await getMe(db, subject)).follows };
}
export async function deleteMe(db, env, subject, request, body, deps) {
  exactKeys(body, ['confirm']);
  if (body.confirm !== 'delete-my-data') throw invalid();
  await mutationLimit(db, env, subject, request, 'privacy', deps.now());
  await db.batch([query(db, 'DELETE FROM price_signals WHERE subject=?', subject), query(db, 'DELETE FROM follows WHERE subject=?', subject)]);
  return { deleted: true };
}
export async function mutateGame(db, env, subject, request, gameId, action, body, deps) {
  await getGame(db, gameId);
  const isPut = request.method === 'PUT';
  if (isPut && action === 'price') {
    const protection = signalProtection(env);
    if (protection === 'unconfigured') throw unavailable();
    const keys = ['amountCents', 'currency'];
    if (protection === 'turnstile' || Object.hasOwn(body || {}, 'turnstileToken')) keys.push('turnstileToken');
    exactKeys(body, keys);
    if (!Number.isInteger(body.amountCents) || body.amountCents < 0 || body.amountCents > 10000 || body.currency !== 'USD') throw invalid('Enter a whole number of US cents from 0 to 10000.');
  } else if (isPut) exactKeys(body, []);
  await mutationLimit(db, env, subject, request, isPut && action === 'price' ? 'price' : 'account', deps.now());
  const now = new Date(deps.now()).toISOString();
  if (action === 'price') {
    if (!isPut) { await query(db, 'DELETE FROM price_signals WHERE subject=? AND game_id=?', subject, gameId).run(); return { deleted: true }; }
    if (signalProtection(env) === 'turnstile') await verifyChallenge(db, env, body.turnstileToken, deps);
    const result = await query(db, `INSERT INTO price_signals(subject,game_id,amount_cents,currency,updated_at)
      SELECT ?,id,?,'USD',? FROM games WHERE id=? AND status='published' AND NOT EXISTS(SELECT 1 FROM removals WHERE game_id=games.id)
      ON CONFLICT(subject,game_id) DO UPDATE SET amount_cents=excluded.amount_cents,updated_at=excluded.updated_at RETURNING game_id`, subject, body.amountCents, now, gameId).first();
    if (!result) throw notFound();
    return { gameId, amountCents: body.amountCents, currency: 'USD', updatedAt: now };
  }
  if (isPut) {
    const result = await query(db, `INSERT INTO follows(subject,game_id,created_at) SELECT ?,id,? FROM games
      WHERE id=? AND status='published' AND NOT EXISTS(SELECT 1 FROM removals WHERE game_id=games.id)
      ON CONFLICT(subject,game_id) DO UPDATE SET created_at=follows.created_at RETURNING game_id`, subject, now, gameId).first();
    if (!result) throw notFound();
  } else await query(db, 'DELETE FROM follows WHERE subject=? AND game_id=?', subject, gameId).run();
  return { gameId, following: isPut };
}
