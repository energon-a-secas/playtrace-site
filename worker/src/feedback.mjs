import { query, getGame } from './store.mjs';
import { exactKeys, invalid, unavailable, forbidden, notFound, strongSecret } from './http.mjs';
import { hmac, mutationLimit } from './limits.mjs';
import { text } from './validation.mjs';
import { feedbackOptions, validChoices } from '../../js/feedback-options.js';

export const feedbackConfigured = env => Boolean(env.DB && strongSecret(env.RATE_LIMIT_SECRET));
const publicFields = 'id,display_name,body,ideal_price_cents,created_at,updated_at,choices_json';
const entry = row => ({ id: row.id, displayName: row.display_name, body: row.body,
  choices: JSON.parse(row.choices_json),
  idealPriceCents: row.ideal_price_cents, currency: 'USD', createdAt: row.created_at, updatedAt: row.updated_at });

export async function guestIdentity(request, env) {
  if (!feedbackConfigured(env)) throw unavailable();
  const key = request.headers.get('X-Feedback-Key');
  if (!/^[a-f0-9]{64}$/.test(key || '')) throw invalid('A browser edit key is required. Please reload and try again.');
  return hmac(env.RATE_LIMIT_SECRET, `guest-feedback:${key}`);
}
function cursorValue(value) {
  if (!value) return null;
  if (value.length > 200) throw invalid('Invalid feedback page.');
  try {
    const [at, id] = JSON.parse(atob(value.replace(/-/g, '+').replace(/_/g, '/')));
    if (!/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}Z$/.test(at) || !Number.isFinite(Date.parse(at))
      || !/^[a-f0-9-]{36}$/.test(id)) throw new Error();
    return [at, id];
  } catch { throw invalid('Invalid feedback page.'); }
}
const encodeCursor = row => btoa(JSON.stringify([row.created_at, row.id])).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');

export async function publicFeedback(db, gameId, cursor) {
  await getGame(db, gameId);
  const position = cursorValue(cursor);
  const [rows, totals, price, choices] = await db.batch([
    query(db, `SELECT ${publicFields} FROM feedback WHERE game_id=? AND status='published'
      ${position ? 'AND (created_at<? OR (created_at=? AND id>?))' : ''}
      ORDER BY created_at DESC,id LIMIT 21`, gameId, ...(position ? [position[0], position[0], position[1]] : [])),
    query(db, "SELECT count(*) AS count FROM feedback WHERE game_id=? AND status='published'", gameId),
    query(db, `WITH prices AS(SELECT ideal_price_cents,ROW_NUMBER() OVER(ORDER BY ideal_price_cents) AS rn,
        COUNT(*) OVER() AS n FROM feedback WHERE game_id=? AND status='published' AND ideal_price_cents IS NOT NULL)
      SELECT count(*) AS count,CAST(round(avg(CASE WHEN rn IN((n+1)/2,(n+2)/2) THEN ideal_price_cents END)) AS INTEGER) AS median
      FROM prices`, gameId),
    query(db, `SELECT j.value AS id,count(*) AS count FROM feedback f,json_each(f.choices_json) j
      WHERE f.game_id=? AND f.status='published' GROUP BY j.value`, gameId),
  ]);
  const visible = rows.results.slice(0, 20);
  return { gameId, entries: visible.map(entry), count: totals.results[0].count,
    choices: feedbackOptions.map(option => ({ id: option.id, count: choices.results.find(row => row.id === option.id)?.count || 0 })),
    idealPrices: { currency: 'USD', count: price.results[0].count, medianCents: price.results[0].median },
    nextCursor: rows.results.length > 20 ? encodeCursor(visible.at(-1)) : null };
}
export async function ownFeedback(db, env, request, gameId) {
  await getGame(db, gameId);
  const key = await guestIdentity(request, env);
  const row = await query(db, `SELECT ${publicFields},status FROM feedback WHERE game_id=? AND guest_key_hash=?`, gameId, key).first();
  return { gameId, feedback: row?.status === 'published' ? entry(row) : null, moderated: row?.status === 'hidden' };
}
export async function writeFeedback(db, env, request, gameId, body, deps) {
  await getGame(db, gameId);
  const key = await guestIdentity(request, env);
  if (request.method === 'DELETE') {
    await mutationLimit(db, env, `guest:${key}`, request, 'privacy', deps.now());
    // Keep a moderated record as a block against immediately reposting it.
    await query(db, "DELETE FROM feedback WHERE (game_id=? OR game_id IN(SELECT alias_id FROM game_aliases WHERE game_id=?)) AND guest_key_hash=? AND status='published'", gameId, gameId, key).run();
    return { deleted: true };
  }
  const hasChoices = Object.hasOwn(body || {}, 'choices');
  exactKeys(body, ['displayName', 'body', 'idealPriceCents', ...(hasChoices ? ['choices'] : [])]);
  if (hasChoices && !validChoices(body.choices)) throw invalid('Choose from the listed feedback options.');
  const choices = hasChoices ? [...body.choices].sort() : [];
  text(body.displayName, 40, 0); text(body.body, 1500, 0);
  const message = body.body.trim(), displayName = body.displayName.trim() || 'Guest';
  if (/[\r\n\t]/.test(displayName)) throw invalid('Use a single line for your display name.');
  const amount = body.idealPriceCents;
  if (amount !== null && (!Number.isInteger(amount) || amount < 0 || amount > 10000)) throw invalid('Your ideal price must be between $0 and $100.');
  if (message.length < 8 && amount === null && !choices.length) throw invalid('Pick a quick answer, write a note of at least 8 characters, or share an ideal price.');
  await mutationLimit(db, env, `guest:${key}`, request, 'price', deps.now());
  const at = new Date(deps.now()).toISOString();
  const row = await query(db, `INSERT INTO feedback(id,game_id,guest_key_hash,display_name,body,ideal_price_cents,created_at,updated_at,choices_json)
    SELECT ?,id,?,?,?,?,?,?,? FROM games WHERE id=? AND status='published'
      AND NOT EXISTS(SELECT 1 FROM removals WHERE game_id=games.id)
    ON CONFLICT(game_id,guest_key_hash) DO UPDATE SET
      display_name=excluded.display_name,body=excluded.body,ideal_price_cents=excluded.ideal_price_cents,updated_at=excluded.updated_at
      ,choices_json=CASE WHEN ? THEN excluded.choices_json ELSE feedback.choices_json END
    WHERE feedback.status='published' RETURNING ${publicFields}`, crypto.randomUUID(), key, displayName, message, amount, at, at, JSON.stringify(choices), gameId, hasChoices ? 1 : 0).first();
  if (!row) {
    // Removal may win after the initial read, including while media cleanup
    // keeps a tombstoned game row alive. An active game's hidden row is 403.
    await getGame(db, gameId);
    throw forbidden();
  }
  return { gameId, feedback: entry(row) };
}
export async function hideFeedback(db, id, body) {
  exactKeys(body, ['reason']); text(body.reason, 1200);
  const row = await query(db, "UPDATE feedback SET status='hidden',moderation_reason=? WHERE id=? RETURNING id", body.reason, id).first();
  if (!row) throw notFound();
  return { hidden: true };
}
