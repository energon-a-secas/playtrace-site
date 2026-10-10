import { unavailable, notFound, invalid } from './http.mjs';
import { validateCatalog, canonicalProjectUrl } from './validation.mjs';
import { enrichGames } from './steam.mjs';

export function database(env) { if (!env.DB) throw unavailable(); return env.DB; }
export const query = (db, sql, ...args) => db.prepare(sql).bind(...args);
export async function meta(db, key) {
  const row = await query(db, 'SELECT value_json FROM app_meta WHERE key = ?', key).first();
  return row ? JSON.parse(row.value_json) : null;
}
export function putMeta(db, key, value) {
  return query(db, 'INSERT INTO app_meta(key,value_json) VALUES(?,?) ON CONFLICT(key) DO UPDATE SET value_json=excluded.value_json', key, JSON.stringify(value));
}
export async function getGame(db, id) {
  const row = await query(db, `SELECT payload_json FROM games WHERE id = ? AND status='published'
    AND NOT EXISTS(SELECT 1 FROM removals WHERE game_id=games.id)`, id).first();
  if (!row) throw notFound();
  return JSON.parse(row.payload_json);
}
export async function catalog(db, page = null) {
  let position = null;
  const limit = page ? Number(page.limit || 200) : 2000;
  if (!Number.isInteger(limit) || limit < 1 || limit > (page ? 200 : 2000)) throw invalid('Invalid catalogue page size.');
  if (page?.cursor) {
    try {
      if (page.cursor.length > 200) throw new Error();
      position = JSON.parse(atob(page.cursor.replace(/-/g, '+').replace(/_/g, '/')));
      if (!Array.isArray(position) || position.length !== 2 || !/^\d{4}-\d\d-\d\dT.*Z$/.test(position[0])
        || !Number.isFinite(Date.parse(position[0])) || !/^g_[a-z0-9]{5,12}$/.test(position[1])) throw new Error();
    } catch { throw invalid('Invalid catalogue page.'); }
  }
  const [head, data] = await Promise.all([
    meta(db, 'catalog'),
    query(db, `SELECT payload_json FROM games WHERE status='published'
      AND NOT EXISTS(SELECT 1 FROM removals WHERE game_id=games.id)
      ${position ? 'AND (updated_at<? OR (updated_at=? AND id>?))' : ''}
      ORDER BY updated_at DESC,id LIMIT ?`, ...(position ? [position[0], position[0], position[1]] : []), limit + 1).all(),
  ]);
  if (!head || (!page && data.results.length > 2000)) throw unavailable();
  try {
    const result = validateCatalog({ ...head, games: data.results.slice(0, limit).map(row => JSON.parse(row.payload_json)) });
    if (page) {
      const total = await query(db, `SELECT count(*) AS count FROM games WHERE status='published'
        AND NOT EXISTS(SELECT 1 FROM removals WHERE game_id=games.id)`).first();
      const last = result.games.at(-1);
      result.pagination = { total: total.count, nextCursor: data.results.length > limit
        ? btoa(JSON.stringify([last.updatedAt, last.id])).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '') : null };
    }
    result.games = await enrichGames(db, result.games);
    return result;
  }
  catch { throw unavailable(); }
}
const eligible = `NOT EXISTS(SELECT 1 FROM removals r WHERE r.game_id=json_extract(j.value,'$.id')
  OR EXISTS(SELECT 1 FROM json_each(r.source_post_ids_json) removed
    JOIN json_each(j.value,'$.posts') post ON removed.value=json_extract(post.value,'$.id')))`;

export async function importCatalog(db, input) {
  const validated = validateCatalog(input);
  const { games, ...head } = validated;
  // Canonical matching metadata is server-derived, never an author-only merge key.
  const rows = games.map(game => ({ ...game, _canonical: canonicalProjectUrl(game.projectUrl) }));
  const payload = JSON.stringify(rows);
  const eligibleInput = `SELECT j.value FROM json_each(?) j WHERE ${eligible}`;
  // D1 batch is a transaction. A NOT NULL guard aborts the entire import on an
  // existing source membership conflict, including concurrent operator imports.
  const statements = [
    query(db, `INSERT INTO app_meta(key,value_json) VALUES('catalog_import_guard',
      CASE WHEN EXISTS(SELECT 1 FROM (${eligibleInput}) j JOIN json_each(j.value,'$.posts') p
        JOIN source_posts old ON old.id=json_extract(p.value,'$.id')
        WHERE old.game_id IS NOT NULL AND old.game_id<>json_extract(j.value,'$.id'))
      OR EXISTS(SELECT 1 FROM (${eligibleInput}) j WHERE json_extract(j.value,'$.preview.storage')='r2'
        AND NOT EXISTS(SELECT 1 FROM games g JOIN media_assets a ON a.game_id=g.id
          WHERE g.id=json_extract(j.value,'$.id') AND json_extract(g.payload_json,'$.preview.url')=json_extract(j.value,'$.preview.url')))
      THEN NULL ELSE 'true' END) ON CONFLICT(key) DO UPDATE SET value_json=excluded.value_json`, payload, payload),
    query(db, `INSERT INTO games(id,author_key,project_url,updated_at,payload_json,status)
      SELECT json_extract(j.value,'$.id'),lower(json_extract(j.value,'$.author.name')),json_extract(j.value,'$._canonical'),
        json_extract(j.value,'$.updatedAt'),json_remove(j.value,'$._canonical'),'published'
      FROM json_each(?) j WHERE ${eligible}
      ON CONFLICT(id) DO UPDATE SET author_key=excluded.author_key,project_url=excluded.project_url,
        updated_at=excluded.updated_at,payload_json=CASE WHEN json_extract(games.payload_json,'$.preview.storage')='r2'
          THEN json_set(excluded.payload_json,'$.preview',json_extract(games.payload_json,'$.preview')) ELSE excluded.payload_json END,
        status='published' RETURNING id`, payload),
    query(db, `INSERT INTO source_posts(id,game_id,author_key,created_at,retrieved_at,payload_json,status,media_checked_at)
      SELECT json_extract(p.value,'$.id'),json_extract(j.value,'$.id'),lower(json_extract(p.value,'$.author')),
        json_extract(p.value,'$.createdAt'),?,p.value,'published',CASE WHEN json_type(p.value,'$.assets')='array' THEN ? ELSE NULL END
      FROM json_each(?) j JOIN json_each(j.value,'$.posts') p WHERE ${eligible}
      ON CONFLICT(id) DO UPDATE SET game_id=excluded.game_id,author_key=excluded.author_key,created_at=excluded.created_at,
        retrieved_at=excluded.retrieved_at,payload_json=CASE WHEN json_type(source_posts.payload_json,'$.assets')='array' AND json_type(excluded.payload_json,'$.assets') IS NULL
          THEN json_set(excluded.payload_json,'$.assets',json_extract(source_posts.payload_json,'$.assets')) ELSE excluded.payload_json END,
        media_checked_at=COALESCE(excluded.media_checked_at,source_posts.media_checked_at),status='published' RETURNING id`, head.source.retrievedAt, head.source.retrievedAt, payload),
    // Preserve already-published timeline entries when reimporting an older seed.
    query(db, `UPDATE games SET payload_json=json_set(payload_json,'$.posts',
      json((SELECT json_group_array(json(payload_json)) FROM
        (SELECT payload_json FROM source_posts WHERE game_id=games.id AND status='published' ORDER BY created_at,id))),
      '$.firstSeenAt',(SELECT min(created_at) FROM source_posts WHERE game_id=games.id AND status='published'),
      '$.updatedAt',(SELECT max(created_at) FROM source_posts WHERE game_id=games.id AND status='published')),
      updated_at=(SELECT max(created_at) FROM source_posts WHERE game_id=games.id AND status='published')
      WHERE id IN(SELECT json_extract(value,'$.id') FROM json_each(?)) AND status='published'`, payload),
    putMeta(db, 'catalog', head),
    query(db, "DELETE FROM app_meta WHERE key='catalog_import_guard'"),
  ];
  let result;
  try { result = await db.batch(statements); }
  catch (error) {
    if (/NOT NULL.*app_meta\.value_json/.test(error.message)) throw invalid('A source post already belongs to another game or stored-preview consent is missing.');
    throw error;
  }
  return { importedGames: result[1].results.length, importedPosts: result[2].results.length };
}

export async function removal(db, bucket, id, reason, now) {
  const known = await query(db, 'SELECT id FROM games WHERE id=? UNION SELECT game_id AS id FROM removals WHERE game_id=?', id, id).first();
  if (!known) throw notFound();
  await db.batch([
    query(db, `INSERT INTO removals(game_id,source_post_ids_json,reason,removed_at,removed_by)
      VALUES(?,COALESCE((SELECT json_group_array(id) FROM source_posts WHERE game_id=?),'[]'),?,?,'operator')
      ON CONFLICT(game_id) DO NOTHING`, id, id, reason, now),
    query(db, "UPDATE games SET status='removed',author_key='',project_url=NULL,payload_json='{}' WHERE id=?", id),
    query(db, 'DELETE FROM price_signals WHERE game_id=?', id),
    query(db, 'DELETE FROM follows WHERE game_id=?', id),
    query(db, 'DELETE FROM feedback WHERE game_id=?', id),
    query(db, 'DELETE FROM change_requests WHERE game_id=?', id),
    query(db, 'DELETE FROM preview_overrides WHERE game_id=?', id),
    query(db, 'DELETE FROM source_posts WHERE game_id=?', id),
  ]);
  const { acquire, release } = await import('./lease.mjs');
  const lockName = `media_lock:${id}`;
  const owner = await acquire(db, lockName, Date.parse(now), 120000);
  if (!owner) throw unavailable();
  const assets = await query(db, 'SELECT object_key FROM media_assets WHERE game_id=?', id).all();
  try {
    if (assets.results.length && !bucket) throw unavailable();
    // Tombstone is already committed. Keep asset keys if deletion fails so retry
    // can clean them up; all public routes deny the game during this interval.
    for (const asset of assets.results) await bucket.delete(asset.object_key);
    await query(db, 'DELETE FROM games WHERE id=?', id).run();
    return { removed: true };
  } finally { await release(db, lockName, owner); }
}
