import { exactKeys, invalid, notFound, ApiError } from './http.mjs';
import { getGame, query } from './store.mjs';
import { guestIdentity } from './feedback.mjs';
import { hmac, take } from './limits.mjs';
import { text, httpsUrl } from './validation.mjs';

export async function submitChange(db, env, request, gameId, body, deps) {
  await getGame(db, gameId);
  exactKeys(body, ['kind', 'body', 'suggestedUrl']);
  if (!['image', 'details', 'media', 'removal', 'other'].includes(body.kind)) throw invalid();
  text(body.body, 1500, 12); httpsUrl(body.suggestedUrl, true);
  const reporter = await guestIdentity(request, env);
  const ip = request.headers.get('CF-Connecting-IP');
  if (!ip || !/^[\da-fA-F:.]{1,64}$/.test(ip)) throw invalid('This request could not be verified.');
  const now = Math.floor(deps.now() / 1000), hour = Math.floor(now / 3600), expires = (hour + 1) * 3600;
  const network = await hmac(env.RATE_LIMIT_SECRET, `change:${new Date(deps.now()).toISOString().slice(0, 10)}:${ip}`);
  await query(db, 'DELETE FROM rate_limits WHERE expires_at<=?', now).run();
  for (const [key, limit] of [[`change-browser:${reporter}:${hour}`, 5], [`change-network:${network}:${hour}`, 20]]) {
    if (!await take(db, key, limit, expires, now)) throw new ApiError('RATE_LIMITED', 'Your earlier requests are saved. Please wait before sending another.', 429, expires - now);
  }
  const id = crypto.randomUUID();
  const row = await query(db, `INSERT INTO change_requests(id,game_id,kind,body,suggested_url,reporter_hash,created_at)
    SELECT ?,id,?,?,?,?,? FROM games WHERE id=? AND status='published'
    AND NOT EXISTS(SELECT 1 FROM removals WHERE game_id=games.id) RETURNING id`,
  id, body.kind, body.body.trim(), body.suggestedUrl, reporter, new Date(deps.now()).toISOString(), gameId).first();
  if (!row) throw notFound();
  return { id, status: 'open' };
}
export async function inbox(db, status, cursor) {
  if (!['open', 'resolved', 'dismissed'].includes(status || 'open')) throw invalid();
  let position;
  if (cursor) {
    try {
      if (cursor.length > 200) throw new Error();
      position = JSON.parse(atob(cursor.replace(/-/g, '+').replace(/_/g, '/')));
      if (!Array.isArray(position) || position.length !== 2 || !Number.isFinite(Date.parse(position[0])) || !/^[a-f0-9-]{36}$/.test(position[1])) throw new Error();
    } catch { throw invalid('Invalid inbox page.'); }
  }
  const rows = await query(db, `SELECT r.id,r.game_id,r.kind,r.body,r.suggested_url,r.created_at,r.status,r.admin_note,
    json_extract(g.payload_json,'$.title') AS title FROM change_requests r JOIN games g ON g.id=r.game_id
    WHERE r.status=? AND g.status='published' AND NOT EXISTS(SELECT 1 FROM removals WHERE game_id=g.id)
    ${position ? 'AND (r.created_at<? OR (r.created_at=? AND r.id>?))' : ''}
    ORDER BY r.created_at DESC,r.id LIMIT 51`, status || 'open', ...(position ? [position[0], position[0], position[1]] : [])).all();
  const entries = rows.results.slice(0, 50).map(row => ({ id: row.id, gameId: row.game_id, title: row.title, kind: row.kind,
    body: row.body, suggestedUrl: row.suggested_url, createdAt: row.created_at, status: row.status, adminNote: row.admin_note }));
  const last = entries.at(-1);
  return { entries, nextCursor: rows.results.length > 50 ? btoa(JSON.stringify([last.createdAt, last.id])).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '') : null };
}
export async function resolveChange(db, id, body, admin, deps) {
  exactKeys(body, ['status', 'note']); text(body.note, 1200, 0);
  if (!['open', 'resolved', 'dismissed'].includes(body.status)) throw invalid();
  const result = await query(db, `UPDATE change_requests SET status=?,admin_note=?,resolved_by=?,resolved_at=?
    WHERE id=? AND EXISTS(SELECT 1 FROM games g WHERE g.id=game_id AND g.status='published'
      AND NOT EXISTS(SELECT 1 FROM removals WHERE game_id=g.id)) RETURNING id`,
  body.status, body.note.trim(), admin.subject, new Date(deps.now()).toISOString(), id).first();
  if (!result) throw notFound();
  return { id, status: body.status };
}
