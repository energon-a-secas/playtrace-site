import { ApiError, unavailable, readBytes } from './http.mjs';
import { query, meta, putMeta, importCatalog } from './store.mjs';
import { normalizePost, sourceGame } from './archive.mjs';
import { refreshSourceRecords } from './source-evidence.mjs';
import { acquire, release } from './lease.mjs';
import { applyDetails } from './details.mjs';
import { canonicalProjectUrl } from './validation.mjs';

export const ARCHIVE_URL = 'https://arctic-shift.photon-reddit.com/api/posts/search';
// r/aigamedev creation timestamp, confirmed by the archive's subreddit record
// and first post (zipbkg). This is a fixed historical boundary, not a lookback.
export const COMMUNITY_CREATED_AT = '2022-12-11T12:00:48.000Z';
export const ingestionConfigured = env => Boolean(env.DB && env.INGESTION_ENABLED === 'true');
const MAX_RETRY_WAIT_MS = 5000;
function retryDelay(headers, now, minimum, rateLimited) {
  const retry = headers.get('Retry-After');
  const retryMs = /^\d+$/.test(retry || '') ? Number(retry) * 1000 : Date.parse(retry) - now;
  const reset = rateLimited ? headers.get('X-RateLimit-Reset') : null;
  const resetMs = /^\d+(?:\.\d+)?$/.test(reset || '') ? Number(reset) * 1000 : 0;
  const resetAt = rateLimited ? headers.get('X-RateLimit-Reset-At') : null;
  const resetAtMs = /^\d+$/.test(resetAt || '') ? Number(resetAt) - now : 0;
  return Math.max(minimum, resetMs, resetAtMs, Number.isNaN(retryMs) ? 0 : retryMs);
}
function archiveFailure(code, retryable, retryDelayMs = 0) {
  return Object.assign(new ApiError(code, 'Archive request failed.', 503), { archiveFailure: true, retryable, retryDelayMs });
}
function classifyArchiveFailure(error) {
  if (error.archiveFailure) return error;
  if (['TimeoutError', 'AbortError'].includes(error.name)) return archiveFailure('ARCHIVE_TIMEOUT', true);
  if (error.name === 'SyntaxError') return archiveFailure('ARCHIVE_INVALID_JSON', false);
  if (error.code === 'INVALID_REQUEST') return archiveFailure('ARCHIVE_RESPONSE_TOO_LARGE', false);
  return archiveFailure('ARCHIVE_NETWORK_ERROR', true);
}
async function archivePage(after, before, deps, ascending = false) {
  const url = new URL(ARCHIVE_URL);
  // A fixed limit can time out on sparse windows. Adaptive queries also return
  // the final few posts reliably; recent scans retain only their bounded page.
  url.search = new URLSearchParams({ subreddit: 'aigamedev', sort: ascending ? 'asc' : 'desc', limit: 'auto', after: String(after), before: String(before) });
  for (let attempt = 0; attempt < 3; attempt++) {
    let delay = 1000 * 2 ** attempt;
    try {
      // Workers supports manual redirects; rejecting non-2xx prevents following
      // a Location header while keeping every request on the fixed archive URL.
      const response = await deps.fetch(url.href, { signal: AbortSignal.timeout(15000), redirect: 'manual',
        headers: { Accept: 'application/json', 'User-Agent': 'Playtrace/1.0 (+https://playtrace.neorgon.com)' } });
      if (!response.ok) {
        // Reset headers accompany ordinary query errors too. They describe a
        // counter window, not a required delay unless the response is 429.
        delay = retryDelay(response.headers, deps.now(), delay, response.status === 429);
        // Arctic Shift sometimes reports upstream query timeouts as HTTP 422.
        // Retry that documented response shape only; malformed query errors remain terminal.
        let timedOut = false;
        if (response.status === 422) {
          try { const detail = JSON.parse(new TextDecoder().decode(await readBytes(response.body, 8192))); timedOut = detail?.error === 'Timeout. Maybe slow down a bit'; }
          catch { /* Do not retry other 422 responses or retain their content. */ }
          if (timedOut) delay = Math.max(delay, 4000);
        } else await response.body?.cancel();
        throw archiveFailure(`ARCHIVE_HTTP_${response.status}`, timedOut || response.status === 429 || response.status >= 500,
          response.status === 429 || response.headers.has('Retry-After') ? delay : 0);
      }
      const payload = JSON.parse(new TextDecoder().decode(await readBytes(response.body, 8 * 1024 * 1024)));
      if (!payload || !Array.isArray(payload.data) || payload.data.length > 1000) throw archiveFailure('ARCHIVE_MALFORMED_ENVELOPE', false);
      // Keep recent batches bounded. The next cursor comes from the retained
      // newest 100 rows, so the rest are fetched on subsequent pages.
      return ascending ? payload.data : payload.data.slice(0, 100);
    } catch (error) {
      const failure = classifyArchiveFailure(error);
      // A long advertised reset ends this request. The run persists its cursor
      // for later continuation instead of truncating the wait and retrying early.
      if (attempt === 2 || !failure.retryable || delay > MAX_RETRY_WAIT_MS) throw failure;
      await deps.sleep(Math.max(0, delay));
    }
  }
}
async function planCandidates(db, candidates) {
  const ids = JSON.stringify(candidates.map(candidate => candidate.post.id));
  const [sourceRows, gameRows, removedRows] = await db.batch([
    query(db, "SELECT id FROM source_posts WHERE id IN(SELECT value FROM json_each(?)) AND status<>'pending'", ids),
    query(db, `SELECT id,author_key,project_url,payload_json FROM games WHERE status='published'
      AND author_key IN(SELECT DISTINCT json_extract(value,'$.authorKey') FROM json_each(?)) ORDER BY id`, JSON.stringify(candidates)),
    query(db, 'SELECT game_id,source_post_ids_json FROM removals'),
  ]);
  const seen = new Set(sourceRows.results.map(row => row.id));
  const blockedGames = new Set(removedRows.results.map(row => row.game_id));
  const blockedPosts = new Set(removedRows.results.flatMap(row => JSON.parse(row.source_post_ids_json)));
  const games = new Map(gameRows.results.filter(row => !blockedGames.has(row.id)).map(row => [row.id, JSON.parse(row.payload_json)]));
  const matches = new Map();
  const addMatch = (author, project, game) => {
    if (!project) return;
    const key = `${author}\n${project}`, list = matches.get(key) || [];
    list.push(game); matches.set(key, list);
  };
  // Match effective reviewed/edited destinations, while retaining source data
  // for imports. A corrected example link must not reconnect unrelated games.
  for (const game of await applyDetails(db,[...games.values()]))addMatch(game.author.name.toLowerCase(),canonicalProjectUrl(game.projectUrl),games.get(game.id));
  const changed = new Map(), pending = [];
  // New games use the oldest source in this batch as their permanent anchor.
  // Older sources found later extend the same timeline without changing its ID.
  const ordered = [...candidates].sort((a, b) => Date.parse(a.post.createdAt) - Date.parse(b.post.createdAt) || a.post.id.localeCompare(b.post.id));
  for (const candidate of ordered) {
    const { post, projectUrl, authorKey } = candidate;
    if (seen.has(post.id) || blockedPosts.has(post.id) || blockedGames.has(`g_${post.id}`)) continue;
    seen.add(post.id);
    if (candidate.requiresReview) { pending.push(candidate); continue; }
    const found = projectUrl ? matches.get(`${authorKey}\n${projectUrl}`) || [] : [];
    const match = found.length === 1 ? found[0] : null;
    if (match && match.posts.length < 1000) {
      match.posts.push(post);
      match.posts.sort((a, b) => Date.parse(a.createdAt) - Date.parse(b.createdAt) || a.id.localeCompare(b.id));
      match.firstSeenAt = match.posts[0].createdAt;
      match.updatedAt = match.posts.at(-1).createdAt;
      changed.set(match.id, match);
    } else if (candidate.clear && found.length === 0) {
      const game = sourceGame(candidate);
      games.set(game.id, game); changed.set(game.id, game); addMatch(authorKey, projectUrl, game);
    } else pending.push(candidate);
  }
  return { changed: [...changed.values()], pending };
}
async function savePending(db, pending, retrievedAt) {
  const result = await query(db, `INSERT INTO source_posts(id,game_id,author_key,created_at,retrieved_at,payload_json,status)
    SELECT json_extract(j.value,'$.post.id'),NULL,json_extract(j.value,'$.authorKey'),json_extract(j.value,'$.post.createdAt'),?,j.value,'pending'
    FROM json_each(?) j WHERE NOT EXISTS(SELECT 1 FROM removals r WHERE r.game_id='g_'||json_extract(j.value,'$.post.id')
      OR EXISTS(SELECT 1 FROM json_each(r.source_post_ids_json) p WHERE p.value=json_extract(j.value,'$.post.id')))
    ON CONFLICT(id) DO NOTHING RETURNING id`, retrievedAt, JSON.stringify(pending)).all();
  return result.results.length;
}
export async function ingest(env, deps, historical = false) {
  if (!ingestionConfigured(env)) throw unavailable();
  const db = env.DB, start = deps.now(), attemptAt = new Date(start).toISOString();
  const owner = await acquire(db, 'ingestion_lock', start);
  if (!owner) throw unavailable();
  const checkpointKey = historical ? 'history' : 'ingestion';
  let run, previous;
  try {
    previous = await meta(db, checkpointKey);
    if (Date.parse(previous?.retryAt) > start) {
      const error = unavailable(); error.retryAfterSeconds = Math.ceil((Date.parse(previous.retryAt) - start) / 1000); throw error;
    }
    if (historical && previous?.state === 'ok') return { status: 'ok', fetched: 0, candidates: 0, updatedGames: 0 };
    const resuming = Number.isInteger(previous?.resumeBefore) && Number.isInteger(previous?.resumeAfter) &&
      previous.resumeBefore > previous.resumeAfter && Number.isFinite(Date.parse(previous.targetCoverageThrough));
    let after = resuming ? previous.resumeAfter : Math.max(1104537600,
      Math.floor((historical ? Date.parse(COMMUNITY_CREATED_AT) - 1000
        : previous?.coverageThrough ? Date.parse(previous.coverageThrough) - 172800000 : start - 604800000) / 1000));
    let before = resuming ? previous.resumeBefore : Math.floor(start / 1000);
    const target = resuming ? previous.targetCoverageThrough : attemptAt;
    run = { runId: crypto.randomUUID(), state: 'error', lastAttemptAt: attemptAt,
      lastSuccessAt: previous?.lastSuccessAt || null, coverageThrough: previous?.coverageThrough || null,
      fetched: 0, candidates: 0, updatedGames: 0, errorCode: null,
      resumeBefore: before, resumeAfter: after, targetCoverageThrough: target };
    if (historical) Object.assign(run, { startedAt: previous?.startedAt || attemptAt,
      scannedThrough: previous?.scannedThrough || null, communityCreatedAt: COMMUNITY_CREATED_AT });
    await db.batch([putMeta(db, checkpointKey, run), query(db, 'DELETE FROM rate_limits WHERE expires_at<=?', Math.floor(start / 1000))]);
    let complete = false, pageFailure = false;
    const seen = new Set(), candidates = [], observations = [];
    // The archive chooses 100–1000 rows for "auto". One historical page avoids
    // spending several rate-limited requests on a batch and caps candidate work.
    const pageLimit = historical ? 1 : 3;
    for (let page = 0; page < pageLimit; page++) {
      let rows;
      try { rows = await archivePage(after, before, deps, historical); }
      catch (error) {
        const failure = classifyArchiveFailure(error); run.errorCode = failure.code;
        if (failure.retryDelayMs > 0 && Number.isFinite(deps.now() + failure.retryDelayMs)) run.retryAt = new Date(deps.now() + failure.retryDelayMs).toISOString();
        pageFailure = true; break;
      }
      let oldest = before, newest = after;
      for (const raw of rows) {
        if (Number.isFinite(raw?.created_utc)) {
          oldest = Math.min(oldest, Math.floor(raw.created_utc));
          newest = Math.max(newest, Math.floor(raw.created_utc));
        }
        if (typeof raw?.id !== 'string' || seen.has(raw.id)) continue;
        seen.add(raw.id); run.fetched++;
        if(raw.created_utc>after&&raw.created_utc<=Date.parse(target)/1000)observations.push(raw);
        const candidate = normalizePost(raw, start, { reviewUnlabeled: true });
        if (candidate && raw.created_utc > after && raw.created_utc <= Date.parse(target) / 1000) candidates.push(candidate);
      }
      if (historical && newest > after) run.scannedThrough = new Date(Math.min(newest * 1000, Date.parse(target))).toISOString();
      if (rows.length < 100) { complete = true; break; }
      const next = historical ? newest - 1 : oldest + 1;
      if (next >= before || next <= after) { run.errorCode = 'CURSOR_STALLED'; break; }
      if (historical) after = next;
      else before = next;
      if (page < pageLimit - 1) await deps.sleep(600);
    }
    run.state = complete ? 'ok' : pageFailure && !run.fetched ? 'error' : 'partial';
    if (complete) {
      run.lastSuccessAt = new Date(deps.now()).toISOString(); run.coverageThrough = target;
      run.resumeBefore = null; run.resumeAfter = null; run.targetCoverageThrough = null;
      if (historical) run.scannedThrough = target;
    } else {
      run.resumeBefore = before; run.resumeAfter = after;
      if (!run.errorCode) run.errorCode = 'PAGE_CAP';
    }
    let finalHead;
    if (run.state !== 'error') {
      const oldHead = await meta(db, 'catalog');
      const head = oldHead || { schemaVersion: 1, generatedAt: attemptAt, source: { subreddit: 'aigamedev',
        subredditUrl: 'https://www.reddit.com/r/aigamedev/', archiveUrl: ARCHIVE_URL, retrievedAt: attemptAt,
        coverageThrough: null, mode: 'scheduled', lastSuccessfulIngestAt: null } };
      const plan = await planCandidates(db, candidates);
      finalHead = { ...head, generatedAt: attemptAt, source: { ...head.source, archiveUrl: ARCHIVE_URL,
        retrievedAt: attemptAt, mode: 'scheduled',
        coverageThrough: historical ? head.source.coverageThrough : run.coverageThrough,
        lastSuccessfulIngestAt: historical ? head.source.lastSuccessfulIngestAt : run.lastSuccessAt } };
      const imported = plan.changed.length ? await importCatalog(db, { ...finalHead, source: { ...finalHead.source,
        coverageThrough: historical ? head.source.coverageThrough : previous?.coverageThrough || null,
        lastSuccessfulIngestAt: historical ? head.source.lastSuccessfulIngestAt : previous?.lastSuccessAt || null }, games: plan.changed }) : {importedGames:0};
      const references=candidates.flatMap(candidate=>(candidate.references||[]));
      if(references.length)await query(db,`INSERT INTO project_references(game_id,url,title,source_post_id)
        SELECT p.game_id,json_extract(r.value,'$.url'),json_extract(r.value,'$.title'),p.id
        FROM json_each(?) r JOIN source_posts p ON p.id=json_extract(r.value,'$.sourcePostId') JOIN games g ON g.id=p.game_id
        WHERE p.status='published' AND g.status='published' AND NOT EXISTS(SELECT 1 FROM removals WHERE game_id=g.id)
        ON CONFLICT(game_id,url) DO UPDATE SET title=excluded.title,source_post_id=excluded.source_post_id`,JSON.stringify(references)).run();
      run.updatedGames = imported.importedGames;
      run.candidates = await savePending(db, plan.pending, attemptAt);
      const refreshed=await refreshSourceRecords(db,observations,deps);
      run.refreshedSources=refreshed.checked;
      run.updatedGames+=refreshed.updatedGames;
    }
    await db.batch([...(finalHead ? [putMeta(db, 'catalog', finalHead)] : []), putMeta(db, checkpointKey, run)]);
    if (run.state === 'error') {
      const error = unavailable(); if (run.retryAt) error.retryAfterSeconds = Math.max(1, Math.ceil((Date.parse(run.retryAt) - deps.now()) / 1000)); throw error;
    }
    return { runId: run.runId, status: run.state, fetched: run.fetched, candidates: run.candidates, updatedGames: run.updatedGames };
  } catch (error) {
    if (run && run.state !== 'error') {
      // Retry the original frozen window on a persistence failure. Source/game
      // writes are idempotent; advancing an uncommitted checkpoint is not safe.
      run.state = 'error'; run.errorCode = 'INGESTION_FAILED';
      run.lastSuccessAt = previous?.lastSuccessAt || null; run.coverageThrough = previous?.coverageThrough || null;
      run.resumeBefore = previous?.resumeBefore || null; run.resumeAfter = previous?.resumeAfter || null;
      run.targetCoverageThrough = previous?.targetCoverageThrough || null;
      if (historical) run.scannedThrough = previous?.scannedThrough || null;
      await putMeta(db, checkpointKey, run).run();
    }
    throw error;
  } finally { await release(db, 'ingestion_lock', owner); }
}
