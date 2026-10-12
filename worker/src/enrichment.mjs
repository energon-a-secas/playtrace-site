import { query, getGame, putMeta, meta } from './store.mjs';
import { applyDetails } from './details.mjs';
import { refreshSteam, steamAppId } from './steam.mjs';
import { publicPage } from './public-fetch.mjs';
import { readBytes } from './http.mjs';
import { pageMetadata, storeImage } from './page-metadata.mjs';
import { verifiedSteamDemo } from '../../js/steam-demo.js';
export { pageMetadata, storeImage } from './page-metadata.mjs';

async function ownedItchGames(db, env, deps) {
  if (!env.ITCHIO_API_TOKEN) return [];
  const cached = await meta(db, 'itch_owned_public');
  if (cached?.version === 2 && deps.now() - cached.checkedAt < 86400000) return cached.games;
  const response = await deps.fetch('https://api.itch.io/profile/games', { headers: { Authorization: `Bearer ${env.ITCHIO_API_TOKEN}`, Accept: 'application/json' }, redirect: 'manual', signal: AbortSignal.timeout(8000) });
  if (!response.ok) { await response.body?.cancel(); return []; }
  const data = JSON.parse(new TextDecoder().decode(await readBytes(response.body, 1024 * 1024)));
  const games = (Array.isArray(data.games) ? data.games : []).filter(game => game.published === true && game.classification === 'game').slice(0,300)
    .map(game => ({ url: game.url, title: typeof game.title === 'string' ? game.title.slice(0,300) : '', image: storeImage(game.cover_url) }));
  // Never persist purchases, earnings or account details returned alongside game metadata.
  await putMeta(db, 'itch_owned_public', { version: 2, checkedAt: deps.now(), games }).run();
  return games;
}
export async function checkProject(db, env, gameId, deps, store = false) {
  const [game] = await applyDetails(db, [await getGame(db, gameId)]);
  if (!game.projectUrl) return { status: 'unlisted', note: 'No project destination is listed.', checkedAt: new Date(deps.now()).toISOString() };
  const checkedAt = new Date(deps.now()).toISOString(), appId = steamAppId(game.projectUrl);
  let result;
  if (store && appId) {
    const steam = await refreshSteam(db, appId, deps);
    result = steam ? { status: 'reachable', provider: 'steam', title: steam.title, image: steam.headerUrl, playable: steam.state === 'released' || Boolean(verifiedSteamDemo(steam,deps.now())), browser: false, steamState: steam.state, steamType: steam.type, finalUrl: steam.url, storeCheckedAt: steam.checkedAt, evidenceCheckedAt:steam.checkedAt }
      : { status: 'unverified', failureReason:'store-api', note: 'Steam did not return current game metadata.' };
  } else {
    try {
      const page = await publicPage(game.projectUrl, deps);
      const status = [404,410].includes(page.status) ? 'broken' : [401,403,429].includes(page.status) ? 'blocked' : page.status >= 200 && page.status < 300 ? 'reachable' : 'unverified';
      result = { status, httpStatus: page.status, finalUrl: page.url, redirectCount:page.redirectCount, metadataStatus:page.bodyStatus,
        failureReason:status==='broken'?'missing':status==='blocked'?'restricted':page.status>=500?'server':null };
      if (store && status === 'reachable' && page.html) {
        const metadata = pageMetadata(page.html, page.url);
        if (metadata.title && !/^(?:just a moment|access denied|attention required|error|page not found|404)\b/i.test(metadata.title)) result = { ...result, ...metadata };
      }
      if (store && result.provider === 'itch') {
        // Owner-authorized metadata is optional. Its API outage must not erase
        // a successful public-page observation or claim that every listing runs.
        try {
          const owned = (await ownedItchGames(db, env, deps)).find(entry => entry.url?.replace(/^http:/,'https:').replace(/\/$/,'') === game.projectUrl.replace(/\/$/,''));
          if (owned) {
            if (owned.title) { result.title = owned.title; result.provenance.title = 'Authorized itch.io API: title'; }
            if (owned.image) { result.image = owned.image; result.provenance.image = 'Authorized itch.io API: cover_url'; }
          }
        } catch { /* Keep the public page evidence, without caching private API data. */ }
      }
      if (result.playable) result.evidence = result.browser ? 'Store page includes an embedded browser game; gameplay has not been tested.' : 'Store page offers a download; installation and gameplay have not been tested.';
    } catch(error) { result = { status: 'unverified', failureReason:/timeout|abort/i.test(error.name+' '+error.message)?'timeout':/DNS|public\.$/.test(error.message)?'dns':/Redirect|redirect/.test(error.message)?'redirect':/public HTTPS/.test(error.message)?'policy':'network', note: 'This check could not verify the destination. A timeout or access restriction is not proof of a dead game.' }; }
  }
  const previous = await query(db, 'SELECT project_url,payload_json FROM project_enrichment WHERE game_id=?', gameId).first();
  const old = previous?.project_url === game.projectUrl ? JSON.parse(previous.payload_json) : {};
  const successfulStore=store&&result.status==='reachable'&&Boolean(result.provider);
  // A blocked page check cannot erase a recently verified build or its artwork.
  // Keep the last successful store evidence separate from general link health.
  const value = { ...(!successfulStore ? old : {}), httpStatus:null,finalUrl:null,redirectCount:null,failureReason:null,metadataStatus:null, ...result, checkedAt, projectUrl: game.projectUrl,
    checkMethod:store&&appId?'store-api':'http',evidenceCheckedAt:result.evidenceCheckedAt||checkedAt,
    previousStatus:old.status&&old.status!==result.status?old.status:old.previousStatus||null,
    previousCheckedAt:old.status&&old.status!==result.status?old.checkedAt:old.previousCheckedAt||null,
    failureSince:result.status==='broken'?(old.status==='broken'?old.failureSince||old.checkedAt:checkedAt):null,
    recoveredAt:result.status==='broken'?null:result.status==='reachable'&&old.status==='broken'?checkedAt:old.recoveredAt||null,
    ...(successfulStore ? {storeCheckedAt:result.storeCheckedAt||checkedAt,storeStatus:result.status} : old.provider ? {storeCheckedAt:old.storeCheckedAt||old.checkedAt,storeStatus:old.storeStatus||old.status} : {}) };
  await query(db, `INSERT INTO project_enrichment(game_id,project_url,payload_json,checked_at) VALUES(?,?,?,?)
    ON CONFLICT(game_id) DO UPDATE SET project_url=excluded.project_url,payload_json=excluded.payload_json,checked_at=excluded.checked_at`, gameId, game.projectUrl, JSON.stringify(value), checkedAt).run();
  return value;
}
