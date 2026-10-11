import { publishPreview } from './media-publication.mjs';
import { exactKeys, invalid, unavailable, notFound } from './http.mjs';
import { text, httpsUrl } from './validation.mjs';
import { query, getGame } from './store.mjs';
import { safePreviewUrl, imageType } from './media.mjs';
import { enrichGames } from './steam.mjs';
import { acquire, release } from './lease.mjs';
import { detailsOf } from './details.mjs';
import { listCategories } from './categories.mjs';

export async function editorGame(db, id) {
  const source = await getGame(db, id);
  const [game] = await enrichGames(db, [source]);
  const override = await query(db, 'SELECT approved_by,updated_at FROM preview_overrides WHERE game_id=?', id).first();
  const details = await query(db, 'SELECT details_json,updated_at,revision FROM project_overrides WHERE game_id=?', id).first();
  return { game, categories: await listCategories(db), sourcePreview: source.preview, override: override ? { updatedAt: override.updated_at } : null,
    sourceDetails: detailsOf(source), detailsRevision: details?.revision || 0,
    detailsOverride: details && Object.keys(JSON.parse(details.details_json)).length ? { updatedAt: details.updated_at } : null };
}
export async function editPreview(db, env, gameId, body, request, admin, deps) {
  const game = await getGame(db, gameId);
  if (body?.mode === 'reset') {
    exactKeys(body, ['mode']);
    const name = `media_lock:${gameId}`, owner = await acquire(db, name, deps.now(), 120000);
    if (!owner) throw unavailable();
    try {
      await query(db, 'DELETE FROM preview_overrides WHERE game_id=?', gameId).run();
      await publishPreview(db, env.PREVIEWS, gameId);
      return await editorGame(db, gameId);
    } finally { await release(db, name, owner); }
  }
  if (body?.mode === 'external') exactKeys(body, ['mode', 'url', 'alt', 'sourcePostId']);
  else if (body?.mode === 'upload') exactKeys(body, ['mode', 'dataUrl', 'alt', 'sourcePostId', 'permission']);
  else throw invalid();
  text(body.alt, 300);
  const post = game.posts.find(post => post.id === body.sourcePostId);
  if (!post) throw invalid('Choose an original post from this project.');
  let url, bytes, mime, extension;
  if (body.mode === 'external') url = safePreviewUrl(body.url, env);
  else {
    if (!env.PREVIEWS) throw unavailable();
    if (body.permission !== true) throw invalid('Confirm you have permission to use this image.');
    if (typeof body.dataUrl !== 'string' || body.dataUrl.length > 7 * 1024 * 1024) throw invalid('Choose an image smaller than 5 MiB.');
    const match = /^data:(image\/(?:png|jpeg|webp));base64,([A-Za-z0-9+/]+={0,2})$/.exec(body.dataUrl);
    if (!match) throw invalid('Choose a PNG, JPEG or WebP image.');
    try { bytes = Uint8Array.from(atob(match[2]), char => char.charCodeAt(0)); } catch { throw invalid('The image could not be read.'); }
    if (!bytes.length || bytes.length > 5 * 1024 * 1024) throw invalid('Choose an image smaller than 5 MiB.');
    mime = match[1]; extension = imageType(bytes, mime);
  }
  const lock = `media_lock:${gameId}`, owner = await acquire(db, lock, deps.now(), 120000);
  if (!owner) throw unavailable();
  let assetId, key, recorded = false;
  try {
    if (bytes) {
      assetId = crypto.randomUUID(); key = `previews/${gameId}/${assetId}.${extension}`;
      const row = await query(db, `INSERT INTO media_assets(id,game_id,object_key,source_url,consent_evidence_url,consent_note,approved_by,created_at,mime_type,byte_size)
        SELECT ?,id,?,?,?,?,?,?,?,? FROM games WHERE id=? AND status='published'
        AND NOT EXISTS(SELECT 1 FROM removals WHERE game_id=games.id) RETURNING id`,
      assetId, key, post.url, post.url, 'Administrator confirmed permission to upload this preview.', admin.subject,
      new Date(deps.now()).toISOString(), mime, bytes.length, gameId).first();
      if (!row) throw notFound();
      recorded = true;
      await env.PREVIEWS.put(key, bytes, { httpMetadata: { contentType: mime }, customMetadata: { gameId } });
      url = new URL(`/api/v1/media/${assetId}`, request.url).href; httpsUrl(url);
    }
    const preview = { kind: 'image', url, posterUrl: null, alt: body.alt.trim(), storage: bytes ? 'r2' : 'external',
      rights: bytes ? 'owner-consent' : 'source-linked', sourceUrl: post.url };
    const updated = await query(db, `INSERT INTO preview_overrides(game_id,preview_json,approved_by,updated_at)
      SELECT id,?,?,? FROM games WHERE id=? AND status='published' AND NOT EXISTS(SELECT 1 FROM removals WHERE game_id=games.id)
      ON CONFLICT(game_id) DO UPDATE SET preview_json=excluded.preview_json,approved_by=excluded.approved_by,updated_at=excluded.updated_at RETURNING game_id`,
    JSON.stringify(preview), admin.subject, new Date(deps.now()).toISOString(), gameId).first();
    if (!updated) throw notFound();
    await publishPreview(db, env.PREVIEWS, gameId);
    return editorGame(db, gameId);
  } catch (error) {
    if (recorded) { await env.PREVIEWS.delete(key); await query(db, 'DELETE FROM media_assets WHERE id=?', assetId).run(); }
    throw error;
  } finally { await release(db, lock, owner); }
}
