import { exactKeys, invalid, readBytes, unavailable, notFound } from './http.mjs';
import { getGame, query } from './store.mjs';
import { httpsUrl, text } from './validation.mjs';
import { acquire, release } from './lease.mjs';

export const allowedHosts = env => String(env.PREVIEW_ALLOWED_HOSTS || '').split(',').map(value => value.trim().toLowerCase()).filter(Boolean);
export const mediaConfigured = env => Boolean(env.DB && env.PREVIEWS && allowedHosts(env).length);
export function safePreviewUrl(value, env) {
  const url = new URL(httpsUrl(value));
  if (url.port || !allowedHosts(env).includes(url.hostname) || !url.hostname.includes('.') ||
    url.hostname.endsWith('.localhost') || /^(?:[0-9.]+|\[.*\])$/.test(url.hostname)) throw invalid('This preview host is not allowed.');
  return url.href;
}
export function imageType(bytes, mime) {
  const starts = pattern => pattern.every((value, index) => bytes[index] === value);
  if (mime === 'image/png' && starts([137, 80, 78, 71, 13, 10, 26, 10])) return 'png';
  if (mime === 'image/jpeg' && starts([255, 216, 255])) return 'jpg';
  if (mime === 'image/webp' && bytes.length >= 12 && new TextDecoder().decode(bytes.slice(0, 4)) === 'RIFF' && new TextDecoder().decode(bytes.slice(8, 12)) === 'WEBP') return 'webp';
  throw invalid('Only validated PNG, JPEG and WebP previews are supported.');
}
export async function storePreview(db, env, gameId, body, request, deps) {
  if (!mediaConfigured(env)) throw unavailable();
  exactKeys(body, ['sourceUrl', 'consentEvidenceUrl', 'consentNote']);
  const source = safePreviewUrl(body.sourceUrl, env);
  httpsUrl(body.consentEvidenceUrl); text(body.consentNote, 1200);
  const game = await getGame(db, gameId);
  const lockName = `media_lock:${gameId}`;
  const owner = await acquire(db, lockName, deps.now(), 120000);
  if (!owner) throw unavailable();
  const id = crypto.randomUUID();
  let key, recorded = false;
  try {
    const response = await deps.fetch(source, { redirect: 'error', signal: AbortSignal.timeout(20000) });
    if (!response.ok || response.redirected) throw invalid('The preview could not be fetched.');
    if (Number(response.headers.get('Content-Length')) > 5 * 1024 * 1024) throw invalid('The preview exceeds 5 MiB.');
    const mime = response.headers.get('Content-Type')?.split(';')[0].trim().toLowerCase();
    const bytes = await readBytes(response.body, 5 * 1024 * 1024);
    const extension = imageType(bytes, mime);
    key = `previews/${gameId}/${id}.${extension}`;
    const record = await query(db, `INSERT INTO media_assets(id,game_id,object_key,source_url,consent_evidence_url,consent_note,approved_by,created_at,mime_type,byte_size)
      SELECT ?,id,?,?,?,?,'operator',?,?,? FROM games WHERE id=? AND status='published'
        AND NOT EXISTS(SELECT 1 FROM removals WHERE game_id=games.id) RETURNING id`,
    id, key, source, body.consentEvidenceUrl, body.consentNote, new Date(deps.now()).toISOString(), mime, bytes.byteLength, gameId).first();
    if (!record) throw notFound();
    recorded = true;
    await env.PREVIEWS.put(key, bytes, { httpMetadata: { contentType: mime }, customMetadata: { gameId } });
    const url = new URL(`/api/v1/media/${id}`, request.url).href;
    httpsUrl(url);
    const preview = { kind: 'image', url, posterUrl: null, alt: game.preview.alt || game.title,
      storage: 'r2', rights: 'owner-consent', sourceUrl: game.preview.sourceUrl };
    const updated = await query(db, `UPDATE games SET payload_json=json_set(payload_json,'$.preview',json(?))
      WHERE id=? AND status='published' AND NOT EXISTS(SELECT 1 FROM removals WHERE game_id=games.id) RETURNING id`, JSON.stringify(preview), gameId).first();
    if (!updated) throw notFound();
    return { preview };
  } catch (error) {
    // Keep the object key if cleanup fails, for a later operator removal retry.
    if (recorded) {
      await env.PREVIEWS.delete(key);
      await query(db, 'DELETE FROM media_assets WHERE id=?', id).run();
    }
    throw error;
  } finally { await release(db, lockName, owner); }
}
export async function serveMedia(db, env, id) {
  if (!env.PREVIEWS) throw unavailable();
  const suffix = `/api/v1/media/${id}`;
  const asset = await query(db, `SELECT a.object_key,a.mime_type FROM media_assets a JOIN games g ON g.id=a.game_id
    WHERE a.id=? AND g.status='published' AND NOT EXISTS(SELECT 1 FROM removals WHERE game_id=g.id)
    AND substr(json_extract(g.payload_json,'$.preview.url'),-?)=?`, id, suffix.length, suffix).first();
  if (!asset) throw notFound();
  const object = await env.PREVIEWS.get(asset.object_key);
  if (!object) throw notFound();
  return new Response(object.body, { headers: { 'Content-Type': asset.mime_type, 'X-Content-Type-Options': 'nosniff',
    'Cache-Control': 'no-store', 'Content-Security-Policy': "default-src 'none'; sandbox" } });
}
