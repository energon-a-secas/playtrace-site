import { steamAppId, nameForGame } from './names.mjs';
export { steamAppId } from './names.mjs';
import { readBytes } from './http.mjs';
import { query, getGame } from './store.mjs';
import { acquire, release } from './lease.mjs';
import { applyDetails, effectiveProjectUrl } from './details.mjs';
import { projectScoresQuery, publicScore } from './reddit-scores.mjs';
import { storeCategory } from './taxonomy.mjs';
import { plainExcerpt } from './source-evidence.mjs';
import { verifiedSteamDemo } from '../../js/steam-demo.js';

export const STEAM_IMAGE_HOSTS = ['shared.akamai.steamstatic.com', 'shared.fastly.steamstatic.com', 'cdn.akamai.steamstatic.com', 'cdn.cloudflare.steamstatic.com'];
function steamImage(value) {
  try { const u = new URL(value); return u.protocol === 'https:' && !u.port && !u.username && !u.password && STEAM_IMAGE_HOSTS.includes(u.hostname) ? u.href : null; }
  catch { return null; }
}
const labels=(values,limit=20)=>(Array.isArray(values)?values:[]).filter(value=>typeof value==='string'&&value.trim()&&value.length<=120&&!/[\x00-\x1f<>]/.test(value)).slice(0,limit);
const descriptions=values=>labels(Array.isArray(values)?values.map(value=>value?.description):[]);
export function normalizeSteam(payload, appId, now) {
  const entry = payload?.[appId], data = entry?.data;
  if (entry?.success !== true || !data || String(data.steam_appid) !== appId || !['game','demo'].includes(data.type)
    || typeof data.name !== 'string' || !data.name.trim() || data.name.length > 300 || typeof data.is_free !== 'boolean') return null;
  const state = data.release_date?.coming_soon === false ? 'released' : data.release_date?.coming_soon === true ? 'coming-soon' : 'listed';
  const p = data.price_overview;
  const validPrice = state === 'released' && p?.currency === 'USD' && Number.isInteger(p.final) && p.final >= 0 && p.final <= 1000000;
  const free = state === 'released' && data.is_free === true;
  const cents = free ? 0 : validPrice ? p.final : null;
  const genres=descriptions(data.genres),features=descriptions(data.categories);
  const earlyAccess=Array.isArray(data.genres)&&data.genres.some(genre=>String(genre?.id)==='70'||genre?.description==='Early Access');
  const parentId=String(data.fullgame?.appid||'');
  const fullGame=data.type==='demo'&&/^[1-9]\d{0,9}$/.test(parentId)&&parentId!==appId&&typeof data.fullgame.name==='string'&&data.fullgame.name.trim()&&data.fullgame.name.length<=300
    ?{appId:parentId,title:data.fullgame.name,url:`https://store.steampowered.com/app/${parentId}/`}:null;
  const screenshots=[...new Set((Array.isArray(data.screenshots)?data.screenshots:[]).map(shot=>steamImage(shot?.path_full)).filter(Boolean))].slice(0,6);
  const demoAppIds=data.type==='game'?[...new Set((Array.isArray(data.demos)?data.demos:[]).map(demo=>String(demo?.appid||'')).filter(id=>/^[1-9]\d{0,9}$/.test(id)&&id!==appId))].slice(0,3):[];
  return { appId, type: data.type, title: data.name, url: `https://store.steampowered.com/app/${appId}/`, state,
    metadataVersion:2, releaseKind:data.type==='demo'?'demo':earlyAccess?'early-access':'game',
    description:plainExcerpt(data.short_description||'',600),
    platforms:['windows','mac','linux'].filter(key=>data.platforms?.[key]===true).map(key=>({windows:'Windows',mac:'macOS',linux:'Linux'})[key]),
    genres,features,developers:labels(data.developers,10),publishers:labels(data.publishers,10),
    releaseDateLabel:typeof data.release_date?.date==='string'?plainExcerpt(data.release_date.date,100):null,
    fullGame,screenshots,demoAppIds,
    isFree: free, priceCents: cents, originalPriceCents: validPrice && Number.isInteger(p.initial) && p.initial > cents && p.initial <= 1000000 ? p.initial : null,
    currency: cents === null ? null : 'USD', headerUrl: steamImage(data.header_image), checkedAt: new Date(now).toISOString() };
}
export async function refreshSteam(db, appId, deps, options = {}) {
  const cached = await query(db, 'SELECT payload_json,retry_at FROM steam_cache WHERE app_id=?', appId).first();
  if (cached && cached.retry_at > deps.now()) return cached.payload_json ? JSON.parse(cached.payload_json) : null;
  if (options.budget && options.budget.remaining <= 0) return cached?.payload_json ? JSON.parse(cached.payload_json) : null;
  const owner = await acquire(db, `steam:${appId}`, deps.now(), 20000);
  if (!owner) return cached?.payload_json ? JSON.parse(cached.payload_json) : null;
  try {
    // This public endpoint is best effort. Normalize an allowlist from the full
    // response; "basic" filters omit demo parent, OS and screenshot evidence.
    const url = `https://store.steampowered.com/api/appdetails?appids=${appId}&cc=us&l=english`;
    if(options.budget)options.budget.remaining--;
    const response = await deps.fetch(url, { redirect: 'manual', signal: AbortSignal.timeout(8000), headers: { Accept: 'application/json' } });
    if (!response.ok) { await response.body?.cancel(); throw new Error('Store unavailable'); }
    const payload = JSON.parse(new TextDecoder().decode(await readBytes(response.body, 1024 * 1024)));
    if (typeof payload?.[appId]?.success !== 'boolean') throw new Error('Malformed store response');
    const steam = normalizeSteam(payload, appId, deps.now());
    if(payload[appId].success===true&&!steam)throw new Error('Malformed store details');
    // One related lookup at most; never follow chains or assume a listed demo
    // is released. Both apps retain their own dated, daily cache records.
    if(steam?.demoAppIds.length && options.related!==false){
      const demo=await refreshSteam(db,steam.demoAppIds[0],deps,{...options,related:false});
      if(demo?.type==='demo'&&demo.state==='released'&&demo.isFree&&demo.fullGame?.appId===appId){
        steam.demo=Object.fromEntries(['appId','url','title','checkedAt','platforms','releaseDateLabel'].map(key=>[key,demo[key]]));
      }
    }
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
  const rows = await query(db, `SELECT DISTINCT ${effectiveProjectUrl()} AS project_url
    FROM games g LEFT JOIN project_overrides o ON o.game_id=g.id WHERE g.status='published'
    AND NOT EXISTS(SELECT 1 FROM removals WHERE game_id=g.id)`).all();
  const ids = [...new Set(rows.results.map(row => steamAppId(row.project_url)).filter(Boolean))];
  const cachedRows = await query(db, 'SELECT app_id,retry_at FROM steam_cache').all();
  const retry = new Map(cachedRows.results.map(row => [row.app_id, row.retry_at]));
  const due = ids.filter(id => (retry.get(id) || 0) <= deps.now()).sort((a,b) => (retry.get(a) || 0) - (retry.get(b) || 0)).slice(0, 6);
  const budget={remaining:6};let checked=0;
  for (const id of due) { if(!budget.remaining)break;await refreshSteam(db, id, deps,{budget});checked++;if (id !== due.at(-1)) await deps.sleep(250); }
  return { checked, requests:6-budget.remaining, remaining: ids.filter(id => (retry.get(id) || 0) <= deps.now()).length - checked };
}
export async function enrichGames(db, games) {
  const originals = new Map(games.map(game => [game.id, game]));
  const editedTitles = new Set(), editedStages = new Set(), editedPlatforms = new Set(), editedSummaries = new Set(), editedCategories = new Set();
  games = await applyDetails(db, games, (id, details) => {
    if (Object.hasOwn(details, 'title')) editedTitles.add(id);
    if (Object.hasOwn(details,'stage')) editedStages.add(id);
    if (Object.hasOwn(details,'platforms')) editedPlatforms.add(id);
    if (Object.hasOwn(details,'summary')) editedSummaries.add(id);
    if (Object.hasOwn(details,'category')) editedCategories.add(id);
  });
  const [extra, overrides, cache, scores] = await db.batch([
    query(db, 'SELECT game_id,project_url,payload_json FROM project_enrichment WHERE game_id IN(SELECT value FROM json_each(?))', JSON.stringify(games.map(game=>game.id))),
    query(db, 'SELECT game_id,preview_json FROM preview_overrides WHERE game_id IN(SELECT value FROM json_each(?))', JSON.stringify(games.map(game => game.id))),
    query(db, 'SELECT app_id,payload_json FROM steam_cache WHERE app_id IN(SELECT value FROM json_each(?))', JSON.stringify([...new Set(games.map(game => steamAppId(game.projectUrl)).filter(Boolean))])),
    projectScoresQuery(db, games.map(game => game.id)),
  ]);
  const previews = new Map(overrides.results.map(row => [row.game_id, JSON.parse(row.preview_json)]));
  const stores = new Map(cache.results.filter(row => row.payload_json).map(row => [row.app_id, JSON.parse(row.payload_json)]));
  const enriched = new Map(extra.results.map(row=>[row.game_id,row]));
  const reddit = new Map(scores.results.map(row=>[row.game_id,row]));
  return games.map(game => {
    const record = enriched.get(game.id);
    const availability = record?.project_url === game.projectUrl ? JSON.parse(record.payload_json) : null;
    let storeArt = null;
    try { const u=new URL(availability?.image); if(u.protocol==='https:'&&!u.port&&!u.username&&!u.password&&['img.itch.zone',...STEAM_IMAGE_HOSTS].includes(u.hostname))storeArt=u.href; } catch {}
    const steam = stores.get(steamAppId(game.projectUrl)) || null;
    const override = previews.get(game.id);
    const preview = override && game.posts.some(post => post.url === override.sourceUrl) ? override
      : game.preview.storage === 'r2' || !(steam?.headerUrl || storeArt) ? game.preview
        : { ...game.preview, kind: 'image', url: steam?.headerUrl || storeArt, posterUrl: null, alt: `${steam?.title || availability?.title || game.title} · Store artwork` };
    const source = originals.get(game.id);
    const name = !editedTitles.has(game.id) && game.projectUrl === source.projectUrl ? nameForGame(source, {steamTitle: steam?.title, pageTitle: availability?.provider==='itch'?availability.title:null}) : null;
    const verifiedPlayable = availability?.status!=='broken' && (steam
      ? Boolean(verifiedSteamDemo(steam)) || steam.state==='released' && Date.now()-Date.parse(steam.checkedAt)<7*86400000
      : availability?.playable===true && (availability.storeStatus||availability.status)==='reachable'
        && availability.provider==='itch' && Date.now()-Date.parse(availability.storeCheckedAt||availability.checkedAt)<7*86400000);
    const stage = !editedStages.has(game.id) && !['released','playable'].includes(game.stage) && verifiedPlayable ? 'playable' : game.stage;
    const storePlatforms=steam?.platforms?.length?steam.platforms:availability?.provider==='itch'&&availability.metadataVersion===2?availability.platforms:[];
    const storeDescription=steam?.description||(availability?.provider==='itch'&&availability.metadataVersion===2?availability.description:null);
    const platforms=!editedPlatforms.has(game.id)&&!game.platforms.length&&storePlatforms?.length?storePlatforms:game.platforms;
    const automaticSummary=/^Source post by u\/[^:]+:/.test(game.summary)
      || (source.reviewStatus==='source-described'&&source.posts.some(post=>post.excerpt===source.summary));
    const summary=!editedSummaries.has(game.id)&&automaticSummary&&storeDescription?storeDescription:game.summary;
    const category=game.category==='other'&&!editedCategories.has(game.id)?storeCategory(steam?.genres||availability?.genres)||game.category:game.category;
    return { ...game, redditScore: publicScore(reddit.get(game.id),game.posts), category, stage, platforms, summary, ...(availability ? {availability} : {}), ...(name ? {title: name.title} : {}), preview, ...(steam ? { steam } : {}) };
  });
}
