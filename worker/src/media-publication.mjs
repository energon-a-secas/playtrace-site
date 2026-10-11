import { query } from './store.mjs';

// Public delivery uses R2 only. Database quotas must not hide approved uploads.
export const publicationKey = id => `published-previews/${id}.json`;
export const withdrawalKey = id => `withdrawn-previews/${id}.json`;
export async function publishPreview(db, bucket, gameId) {
  if (!bucket) return;
  const rows = await query(db, `SELECT a.id,a.object_key,a.mime_type,g.status,
    json_extract(COALESCE(o.preview_json,json_extract(g.payload_json,'$.preview')),'$.url') AS current_url
    FROM media_assets a JOIN games g ON g.id=a.game_id LEFT JOIN preview_overrides o ON o.game_id=g.id WHERE a.game_id=?`, gameId).all();
  for (const asset of rows.results) {
    const key = publicationKey(asset.id);
    if (asset.status === 'published' && asset.current_url?.endsWith(`/api/v1/media/${asset.id}`)) {
      await bucket.put(key, JSON.stringify({ gameId, objectKey: asset.object_key, mime: asset.mime_type }), { httpMetadata: { contentType: 'application/json' } });
    } else await bucket.delete(key);
  }
}
export async function withdrawPreviews(db, bucket, gameId) {
  // A tombstone is written before the DB removal. It overrides all publication
  // records, including an upload that has not inserted its asset row yet.
  if (bucket) await bucket.put(withdrawalKey(gameId), '{"removed":true}', { httpMetadata: { contentType: 'application/json' } });
}
export async function publishedPreview(bucket, id) {
  const record = await bucket.get(publicationKey(id));
  if (!record) return null;
  const value = await new Response(record.body).json();
  if (!/^g_[a-z0-9]{5,12}$/.test(value.gameId) || !value.objectKey?.startsWith('previews/')
    || !['image/png','image/jpeg','image/webp'].includes(value.mime)) return null;
  if (await bucket.get(withdrawalKey(value.gameId))) return null;
  const object = await bucket.get(value.objectKey);
  return object ? { body: object.body, mime: value.mime } : null;
}
