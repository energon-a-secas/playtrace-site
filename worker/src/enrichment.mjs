import { query, getGame, putMeta, meta } from './store.mjs';
import { applyDetails } from './details.mjs';
import { refreshSteam, steamAppId, STEAM_IMAGE_HOSTS } from './steam.mjs';
import { publicPage } from './public-fetch.mjs';
import { decodeEntities } from './archive.mjs';
import { readBytes } from './http.mjs';

export function storeImage(value) {
  try { const u = new URL(value); return u.protocol === 'https:' && !u.port && !u.username && !u.password && ['img.itch.zone', ...STEAM_IMAGE_HOSTS].includes(u.hostname) ? u.href : null; } catch { return null; }
}
export function pageMetadata(html, url) {
  const tags = [...html.matchAll(/<meta\b[^>]*>/gi)].map(match => Object.fromEntries([...match[0].matchAll(/([\w:-]+)\s*=\s*(["'])([\s\S]*?)\2/g)].map(m => [m[1].toLowerCase(), decodeEntities(m[3])])));
  const get = name => tags.find(tag => tag.property === name || tag.name === name)?.content;
  const title = (get('og:title') || html.match(/<title[^>]*>([^<]+)<\/title>/i)?.[1] || '').trim().slice(0,300);
  const image = storeImage(get('og:image'));
  const host = new URL(url).hostname;
  const itch = host.endsWith('.itch.io') && host.split('.').length === 3;
  // Presence of itch's actual embedded player or download control is evidence of a build.
  const playable = itch && /class=["'][^"']*(?:html_embed_widget|download_btn|buy_btn)[^"']*["']|id=["']game_drop["']/i.test(html);
  return { title: decodeEntities(title), image, playable, browser: itch && /html_embed_widget/.test(html), provider: itch ? 'itch' : 'website' };
}
async function ownedItchGames(db, env, deps) {
  if (!env.ITCHIO_API_TOKEN) return [];
  const cached = await meta(db, 'itch_owned_public');
  if (cached && deps.now() - cached.checkedAt < 86400000) return cached.games;
  const response = await deps.fetch('https://api.itch.io/profile/games', { headers: { Authorization: `Bearer ${env.ITCHIO_API_TOKEN}`, Accept: 'application/json' }, redirect: 'manual', signal: AbortSignal.timeout(8000) });
  if (!response.ok) { await response.body?.cancel(); return []; }
  const data = JSON.parse(new TextDecoder().decode(await readBytes(response.body, 1024 * 1024)));
  const games = (Array.isArray(data.games) ? data.games : []).filter(game => game.published === true && game.classification === 'game').slice(0,300)
    .map(game => ({ url: game.url, title: game.title, image: storeImage(game.cover_url), playable: true, browser: game.type === 'html' || game.traits?.includes('p_html') }));
  // Never persist purchases, earnings or account details returned alongside game metadata.
  await putMeta(db, 'itch_owned_public', { checkedAt: deps.now(), games }).run();
  return games;
}
export async function checkProject(db, env, gameId, deps, store = false) {
  const [game] = await applyDetails(db, [await getGame(db, gameId)]);
  if (!game.projectUrl) return { status: 'unlisted', note: 'No project destination is listed.', checkedAt: new Date(deps.now()).toISOString() };
  const checkedAt = new Date(deps.now()).toISOString(), appId = steamAppId(game.projectUrl);
  let result;
  if (store && appId) {
    const steam = await refreshSteam(db, appId, deps);
    result = steam ? { status: 'reachable', provider: 'steam', title: steam.title, image: steam.headerUrl, playable: steam.state === 'released', browser: false, steamState: steam.state, steamType: steam.type, finalUrl: steam.url }
      : { status: 'unverified', note: 'Steam did not return current game metadata.' };
  } else {
    try {
      const page = await publicPage(game.projectUrl, deps);
      const status = [404,410].includes(page.status) ? 'broken' : [401,403,429].includes(page.status) ? 'blocked' : page.status >= 200 && page.status < 300 ? 'reachable' : 'unverified';
      result = { status, httpStatus: page.status, finalUrl: page.url, ...(store && status === 'reachable' ? pageMetadata(page.html, page.url) : {}) };
      if (store && new URL(game.projectUrl).hostname.endsWith('.itch.io')) {
        const owned = (await ownedItchGames(db, env, deps)).find(entry => entry.url?.replace(/^http:/,'https:').replace(/\/$/,'') === game.projectUrl.replace(/\/$/,''));
        if (owned) result = { ...result, ...owned, provider: 'itch', evidence: 'Authorized itch.io game metadata' };
      }
      if (result.playable) result.evidence ||= result.browser ? 'Store page includes an embedded browser game.' : 'Store page offers a downloadable or purchasable build.';
    } catch { result = { status: 'unverified', note: 'This check could not verify the destination. A timeout or access restriction is not proof of a dead game.' }; }
  }
  const previous = await query(db, 'SELECT project_url,payload_json FROM project_enrichment WHERE game_id=?', gameId).first();
  const old = previous?.project_url === game.projectUrl ? JSON.parse(previous.payload_json) : {};
  const successfulStore=store&&result.status==='reachable';
  // A blocked page check cannot erase a recently verified build or its artwork.
  // Keep the last successful store evidence separate from general link health.
  const value = { ...(!successfulStore ? old : {}), ...result, checkedAt, projectUrl: game.projectUrl,
    ...(successfulStore ? {storeCheckedAt:checkedAt,storeStatus:result.status} : old.provider ? {storeCheckedAt:old.storeCheckedAt||old.checkedAt,storeStatus:old.storeStatus||old.status} : {}) };
  await query(db, `INSERT INTO project_enrichment(game_id,project_url,payload_json,checked_at) VALUES(?,?,?,?)
    ON CONFLICT(game_id) DO UPDATE SET project_url=excluded.project_url,payload_json=excluded.payload_json,checked_at=excluded.checked_at`, gameId, game.projectUrl, JSON.stringify(value), checkedAt).run();
  return value;
}
