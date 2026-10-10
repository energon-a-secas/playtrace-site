import { invalid, readBytes, unavailable } from './http.mjs';
import { httpsUrl, sourceUrl } from './validation.mjs';
import { decodeEntities } from './archive.mjs';
import { query } from './store.mjs';
import { acquire, release } from './lease.mjs';

const IMAGE_HOSTS = ['i.redd.it', 'preview.redd.it', 'external-preview.redd.it', 'a.thumbs.redditmedia.com', 'b.thumbs.redditmedia.com'];
export function assetUrl(value, kind) {
  const u = new URL(httpsUrl(value));
  const hosts = kind === 'video' ? ['v.redd.it', 'preview.redd.it', 'i.redd.it'] : IMAGE_HOSTS;
  if (u.port || !hosts.includes(u.hostname)) throw invalid('Unsupported media host.');
  return u.href;
}
export function validateAssets(assets) {
  if (!Array.isArray(assets) || assets.length > 6) throw invalid('Invalid project media.');
  for (const asset of assets) {
    if (!asset || Object.keys(asset).sort().join(',') !== 'kind,posterUrl,url' || !['image', 'gif', 'video'].includes(asset.kind)) throw invalid();
    assetUrl(asset.url, asset.kind);
    if (asset.posterUrl !== null) assetUrl(asset.posterUrl, 'image');
  }
}
export function extractAssets(raw) {
  const assets = [], seen = new Set();
  const sourceImage = raw.preview?.images?.[0];
  const poster = sourceImage?.resolutions?.find(item => item.width >= 640)?.url || sourceImage?.source?.url;
  const add = (kind, value, posterValue = null) => {
    try {
      const url = assetUrl(decodeEntities(value), kind);
      if (seen.has(url) || assets.length >= 6) return;
      let posterUrl = null;
      try { if (posterValue) posterUrl = assetUrl(decodeEntities(posterValue), 'image'); } catch {}
      assets.push({ kind, url, posterUrl }); seen.add(url);
    } catch {}
  };
  const video = raw.secure_media?.reddit_video || raw.media?.reddit_video || raw.preview?.reddit_video_preview;
  if (video?.fallback_url) add('video', video.fallback_url, poster);
  const variants = sourceImage?.variants;
  if (variants?.mp4?.source?.url) add('video', variants.mp4.source.url, poster);
  else if (variants?.gif?.source?.url) add('gif', variants.gif.source.url, poster);
  if (typeof raw.url === 'string' && /\.gif(?:\?|$)/i.test(raw.url)) add('gif', raw.url, poster);
  if (typeof raw.url === 'string' && /\.(mp4|webm)(?:\?|$)/i.test(raw.url)) add('video', raw.url, poster);
  const gallery = raw.gallery_data?.items;
  if (Array.isArray(gallery)) for (const item of gallery.slice(0, 6)) {
    const media = raw.media_metadata?.[item.media_id];
    if (media?.s?.mp4) add('video', media.s.mp4, media.s.u);
    else if (media?.s?.gif) add('gif', media.s.gif, media.s.u);
    else if (media?.s?.u) add('image', media.s.u);
  }
  if (poster) add('image', poster);
  if (typeof raw.url === 'string' && /\.(png|jpe?g|webp)(?:\?|$)/i.test(raw.url)) add('image', raw.url);
  return assets;
}
export async function hydrateMedia(env, deps, gameId = null) {
  const db = env.DB;
  const owner = await acquire(db, 'ingestion_lock', deps.now());
  if (!owner) throw unavailable();
  try {
    const rows = await query(db, `SELECT s.id,s.game_id,s.author_key FROM source_posts s JOIN games g ON g.id=s.game_id
      WHERE s.status='published' AND s.media_checked_at IS NULL AND g.status='published'
      AND NOT EXISTS(SELECT 1 FROM removals WHERE game_id=g.id) ${gameId ? 'AND g.id=?' : ''}
      ORDER BY CASE WHEN json_extract(g.payload_json,'$.preview.kind')='video' THEN 0 ELSE 1 END,s.created_at DESC LIMIT 10`, ...(gameId ? [gameId] : [])).all();
    if (!rows.results.length) return { checked: 0, assets: 0 };
    const url = `https://arctic-shift.photon-reddit.com/api/posts/ids?ids=${rows.results.map(row => row.id).join(',')}`;
    const response = await deps.fetch(url, { redirect: 'manual', signal: AbortSignal.timeout(12000), headers: { Accept: 'application/json' } });
    // One bounded request, no immediate retry on throttling.
    if (!response.ok) { await response.body?.cancel(); throw unavailable(); }
    const data = JSON.parse(new TextDecoder().decode(await readBytes(response.body, 8 * 1024 * 1024)));
    if (!Array.isArray(data?.data) || data.data.length > 10) throw unavailable();
    const rawById = new Map(data.data.map(raw => [raw.id, raw]));
    let count = 0;
    const updates = rows.results.map(row => {
      const raw = rawById.get(row.id);
      const visible = raw?.subreddit?.toLowerCase() === 'aigamedev' && raw.author?.toLowerCase() === row.author_key
        && !raw.over_18 && !raw.removed_by_category && !raw.removed_by && !raw.banned_by && !raw.removed
        && !/^\[(removed|deleted)\]$/i.test(raw.selftext || '') && !/^\[(removed|deleted)\]$/i.test(raw.title || '');
      const assets = visible ? extractAssets(raw) : [];
      count += assets.length;
      return query(db, `UPDATE source_posts SET payload_json=json_set(payload_json,'$.assets',json(?)),media_checked_at=?
        WHERE id=? AND game_id=? AND status='published' AND EXISTS(SELECT 1 FROM games WHERE id=? AND status='published')
        AND NOT EXISTS(SELECT 1 FROM removals WHERE game_id=?)`, JSON.stringify(assets), new Date(deps.now()).toISOString(), row.id, row.game_id, row.game_id, row.game_id);
    });
    updates.push(query(db, `UPDATE games SET payload_json=json_set(payload_json,'$.posts',json((SELECT json_group_array(json(payload_json))
      FROM (SELECT payload_json FROM source_posts WHERE game_id=games.id AND status='published' ORDER BY created_at,id))))
      WHERE id IN(SELECT value FROM json_each(?)) AND status='published' AND NOT EXISTS(SELECT 1 FROM removals WHERE game_id=games.id)`, JSON.stringify([...new Set(rows.results.map(row => row.game_id))])));
    await db.batch(updates);
    return { checked: rows.results.length, assets: count };
  } finally { await release(db, 'ingestion_lock', owner); }
}
