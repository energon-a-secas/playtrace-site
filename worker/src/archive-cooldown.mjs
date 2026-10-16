import { query } from './store.mjs';

// Every archive consumer shares this deadline. Merge in SQL so overlapping jobs
// cannot shorten another job's wait or erase an unrelated provider's cooldown.
export function providerCooldownStatement(db, provider, retryAt) {
  if (!['archive', 'jev', 'reddit'].includes(provider) || !Number.isFinite(retryAt)) throw new Error('Invalid provider cooldown.');
  return query(db, `INSERT INTO app_meta(key,value_json) VALUES('editorial_cooldown',json_object(?,?))
    ON CONFLICT(key) DO UPDATE SET value_json=json_set(app_meta.value_json,?,
      MAX(COALESCE(json_extract(app_meta.value_json,?),0),?))`, provider, retryAt, `$.${provider}`, `$.${provider}`, retryAt);
}
export const rememberArchiveCooldown = (db, retryAt) => providerCooldownStatement(db, 'archive', retryAt).run();
