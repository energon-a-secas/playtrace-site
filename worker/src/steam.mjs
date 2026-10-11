import { steamAppId, nameForGame } from './names.mjs';
export { steamAppId } from './names.mjs';
import { readBytes } from './http.mjs';
import { query, getGame } from './store.mjs';
import { acquire, release } from './lease.mjs';
import { applyDetails } from './details.mjs';

export const STEAM_IMAGE_HOSTS = ['shared.akamai.steamstatic.com', 'shared.fastly.steamstatic.com', 'cdn.akamai.steamstatic.com', 'cdn.cloudflare.steamstatic.com'];
function steamImage(value) {
  try { const u = new URL(value); return u.protocol === 'https:' && !u.port && !u.username && !u.password && STEAM_IMAGE_HOSTS.includes(u.hostname) ? u.href : null; }
  catch { return null; }
}
export function normalizeSteam(payload, appId, now) {
  const entry = payload?.[appId], data = entry?.data;
  if (entry?.success !== true || !data || String(data.steam_appid) !== appId || !['game','demo'].includes(data.type)
    || typeof data.name !== 'string' || !data.name.trim() || data.name.length > 300 || typeof data.is_free !== 'boolean') return null;
  const state = data.release_date?.coming_soon === false ? 'released' : data.release_date?.coming_soon === true ? 'coming-soon' : 'listed';
  const p = data.price_overview;
  const validPrice = state === 'released' && p?.currency === 'USD' && Number.isInteger(p.final) && p.final >= 0 && p.final <= 1000000;
  const free = state === 'released' && data.is_free === true;
  const cents = free ? 0 : validPrice ? p.final : null;
  return { appId, type: data.type, title: data.name, url: `https://store.steampowered.com/app/${appId}/`, state,
    isFree: free, priceCents: cents, originalPriceCents: validPrice && Number.isInteger(p.initial) && p.initial > cents && p.initial <= 1000000 ? p.initial : null,
    currency: cents === null ? null : 'USD', headerUrl: steamImage(data.header_image), checkedAt: new Date(now).toISOString() };
}
export async function refreshSteam(db, appId, deps) {
  const cached = await query(db, 'SELECT payload_json,retry_at FROM steam_cache WHERE app_id=?', appId).first();
  if (cached && cached.retry_at > deps.now()) return cached.payload_json ? JSON.parse(cached.payload_json) : null;
  const owner = await acquire(db, `steam:${appId}`, deps.now(), 20000);
  if (!owner) return cached?.payload_json ? JSON.parse(cached.payload_json) : null;
  try {
    const url = `https://store.steampowered.com/api/appdetails?appids=${appId}&cc=us&l=english&filters=basic,price_overview,release_date`;
    const response = await deps.fetch(url, { redirect: 'manual', signal: AbortSignal.timeout(8000), headers: { Accept: 'application/json' } });
    if (!response.ok) { await response.body?.cancel(); throw new Error('Store unavailable'); }
    const payload = JSON.parse(new TextDecoder().decode(await readBytes(response.body, 1024 * 1024)));
    if (typeof payload?.[appId]?.success !== 'boolean') throw new Error('Malformed store response');
    const steam = normalizeSteam(payload, appId, deps.now());
    await query(db, `INSERT INTO steam_cache(app_id,payload_json,checked_at,retry_at) VALUES(?,?,?,?)
      ON CONFLICT(app_id) DO UPDATE SET payload_json=excluded.payload_json,checked_at=excluded.checked_at,retry_at=excluded.retry_at`,
    appId, steam ? JSON.stringify(steam) : null, new Date(deps.now()).toISOString(), deps.now() + 86400000).run();
    return steam;
  } catch {
    // Keep the date of the last successful result. The UI suppresses stale prices.
    await query(db, `INSERT INTO steam_cache(app_id,payload_json,checked_at,retry_at) VALUES(?,NULL,?,?)
      ON CONFLICT(app_id) DO UPDATE SET retry_at=excluded.retry_at`, appId, new Date(deps.now()).toISOString(), deps.now() + 3600000).run();
    return cached?.payload_json ? JSON.parse(cached.payload_json) : null;
  } finally { await release(db, `steam:${appId}`, owner); }
}
export async function gameStore(db, gameId, deps) {
  const [game] = await applyDetails(db, [await getGame(db, gameId)]), appId = steamAppId(game.projectUrl);
  if (!appId) return { gameId, steam: null };
  const steam = await refreshSteam(db, appId, deps);
  const [current] = await applyDetails(db, [await getGame(db, gameId)]);
  return { gameId, steam: steamAppId(current.projectUrl) === appId ? steam : null };
}
export async function refreshSteamBatch(db, deps) {
  const rows = await query(db, `SELECT DISTINCT CASE WHEN json_type(o.details_json,'$.projectUrl') IS NOT NULL
      THEN json_extract(o.details_json,'$.projectUrl') ELSE g.project_url END AS project_url
    FROM games g LEFT JOIN project_overrides o ON o.game_id=g.id WHERE g.status='published'
    AND NOT EXISTS(SELECT 1 FROM removals WHERE game_id=g.id)`).all();
  const ids = [...new Set(rows.results.map(row => steamAppId(row.project_url)).filter(Boolean))];
  const checked = await query(db, 'SELECT app_id,retry_at FROM steam_cache').all();
  const retry = new Map(checked.results.map(row => [row.app_id, row.retry_at]));
  const due = ids.filter(id => (retry.get(id) || 0) <= deps.now()).sort((a,b) => (retry.get(a) || 0) - (retry.get(b) || 0)).slice(0, 6);
  for (const id of due) { await refreshSteam(db, id, deps); if (id !== due.at(-1)) await deps.sleep(250); }
  return { checked: due.length, remaining: ids.filter(id => (retry.get(id) || 0) <= deps.now()).length - due.length };
}
export async function enrichGames(db, games) {
  const originals = new Map(games.map(game => [game.id, game]));
  const editedTitles = new Set();
  games = await applyDetails(db, games, (id, details) => { if (Object.hasOwn(details, 'title')) editedTitles.add(id); });
  const [overrides, cache] = await db.batch([
    query(db, 'SELECT game_id,preview_json FROM preview_overrides WHERE game_id IN(SELECT value FROM json_each(?))', JSON.stringify(games.map(game => game.id))),
    query(db, 'SELECT app_id,payload_json FROM steam_cache WHERE app_id IN(SELECT value FROM json_each(?))', JSON.stringify([...new Set(games.map(game => steamAppId(game.projectUrl)).filter(Boolean))])),
  ]);
  const previews = new Map(overrides.results.map(row => [row.game_id, JSON.parse(row.preview_json)]));
  const stores = new Map(cache.results.filter(row => row.payload_json).map(row => [row.app_id, JSON.parse(row.payload_json)]));
  return games.map(game => {
    const steam = stores.get(steamAppId(game.projectUrl)) || null;
    const override = previews.get(game.id);
    const preview = override && game.posts.some(post => post.url === override.sourceUrl) ? override
      : game.preview.storage === 'r2' || !steam?.headerUrl ? game.preview
        : { ...game.preview, kind: 'image', url: steam.headerUrl, posterUrl: null, alt: `${steam.title} · Steam store artwork` };
    const source = originals.get(game.id);
    const name = !editedTitles.has(game.id) && game.projectUrl === source.projectUrl ? nameForGame(source, {steamTitle: steam?.title}) : null;
    return { ...game, ...(name ? {title: name.title} : {}), preview, ...(steam ? { steam } : {}) };
  });
}
