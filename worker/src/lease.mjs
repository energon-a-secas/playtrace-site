import { query } from './store.mjs';

export async function acquire(db, name, now, duration = 600000) {
  const owner = crypto.randomUUID();
  const result = await query(db, `INSERT INTO app_meta(key,value_json) VALUES(?,?)
    ON CONFLICT(key) DO UPDATE SET value_json=excluded.value_json
      WHERE CAST(json_extract(app_meta.value_json,'$.expiresAt') AS INTEGER)<=? RETURNING key`,
  name, JSON.stringify({ owner, expiresAt: now + duration }), now).first();
  return result ? owner : null;
}
export async function release(db, name, owner) {
  await query(db, "DELETE FROM app_meta WHERE key=? AND json_extract(value_json,'$.owner')=?", name, owner).run();
}
