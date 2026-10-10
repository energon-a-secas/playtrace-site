import { ApiError, unavailable, readBytes } from './http.mjs';
import { query, meta, putMeta, importCatalog } from './store.mjs';
import { normalizePost, sourceGame } from './archive.mjs';
import { acquire, release } from './lease.mjs';

export const ARCHIVE_URL = 'https://arctic-shift.photon-reddit.com/api/posts/search';
export const ingestionConfigured = env => Boolean(env.DB && env.INGESTION_ENABLED === 'true');
function archiveFailure(code, retryable) {
  return Object.assign(new ApiError(code, 'Archive request failed.', 503), { archiveFailure: true, retryable });
}
function classifyArchiveFailure(error) {
  if (error.archiveFailure) return error;
  if (['TimeoutError', 'AbortError'].includes(error.name)) return archiveFailure('ARCHIVE_TIMEOUT', true);
  if (error.name === 'SyntaxError') return archiveFailure('ARCHIVE_INVALID_JSON', false);
  if (error.code === 'INVALID_REQUEST') return archiveFailure('ARCHIVE_RESPONSE_TOO_LARGE', false);
  return archiveFailure('ARCHIVE_NETWORK_ERROR', true);
}
async function archivePage(after, before, deps) {
  const url = new URL(ARCHIVE_URL);
  url.search = new URLSearchParams({ subreddit: 'aigamedev', sort: 'desc', limit: '100', after: String(after), before: String(before) });
  for (let attempt = 0; attempt < 3; attempt++) {
    let delay = 1000 * 2 ** attempt;
    try {
      const response = await deps.fetch(url.href, { signal: AbortSignal.timeout(15000), redirect: 'error',
        headers: { Accept: 'application/json', 'User-Agent': 'Playtrace/1.0 (+https://playtrace.neorgon.com)' } });
      if (!response.ok) {
        const retry = response.headers.get('Retry-After');
        const seconds = /^\d+$/.test(retry || '') ? Number(retry) : (Date.parse(retry) - deps.now()) / 1000;
        const reset = Number(response.headers.get('X-RateLimit-Reset')) * 1000 - deps.now();
        delay = Math.min(5000, Math.max(delay, Number.isFinite(seconds) ? seconds * 1000 : 0, reset > 0 ? reset : 0));
        await response.body?.cancel();
        throw archiveFailure(`ARCHIVE_HTTP_${response.status}`, response.status === 429 || response.status >= 500);
      }
      const payload = JSON.parse(new TextDecoder().decode(await readBytes(response.body, 8 * 1024 * 1024)));
      if (!payload || !Array.isArray(payload.data) || payload.data.length > 100) throw archiveFailure('ARCHIVE_MALFORMED_ENVELOPE', false);
      return payload.data;
    } catch (error) {
      const failure = classifyArchiveFailure(error);
      if (attempt === 2 || !failure.retryable) throw failure;
      await deps.sleep(Math.max(0, delay));
    }
  }
}
async function planCandidates(db, candidates) {
  const ids = JSON.stringify(candidates.map(candidate => candidate.post.id));
  const [sourceRows, gameRows, removedRows] = await db.batch([
    query(db, 'SELECT id FROM source_posts WHERE id IN(SELECT value FROM json_each(?))', ids),
    query(db, "SELECT id,author_key,project_url,payload_json FROM games WHERE status='published' ORDER BY id LIMIT 2001"),
    query(db, 'SELECT game_id,source_post_ids_json FROM removals'),
  ]);
  if (gameRows.results.length > 2000) throw unavailable();
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
  for (const row of gameRows.results) if (games.has(row.id)) addMatch(row.author_key, row.project_url, games.get(row.id));
  const changed = new Map(), pending = [];
  // Oldest first makes a new game's ID stable across all posts in this bounded
  // batch. Earlier posts found in a later page/run still require review.
  const ordered = [...candidates].sort((a, b) => Date.parse(a.post.createdAt) - Date.parse(b.post.createdAt) || a.post.id.localeCompare(b.post.id));
  for (const candidate of ordered) {
    const { post, projectUrl, authorKey } = candidate;
    if (seen.has(post.id) || blockedPosts.has(post.id) || blockedGames.has(`g_${post.id}`)) continue;
    seen.add(post.id);
    const found = projectUrl ? matches.get(`${authorKey}\n${projectUrl}`) || [] : [];
    const match = found.length === 1 ? found[0] : null;
    if (match && Date.parse(post.createdAt) >= Date.parse(match.firstSeenAt) && match.posts.length < 1000) {
      match.posts.push(post);
      match.posts.sort((a, b) => Date.parse(a.createdAt) - Date.parse(b.createdAt) || a.id.localeCompare(b.id));
      match.updatedAt = match.posts.at(-1).createdAt;
      changed.set(match.id, match);
    } else if (candidate.clear && found.length === 0 && games.size < 2000) {
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
export async function ingest(env, deps) {
  if (!ingestionConfigured(env)) throw unavailable();
  const db = env.DB, start = deps.now(), attemptAt = new Date(start).toISOString();
  const owner = await acquire(db, 'ingestion_lock', start);
  if (!owner) throw unavailable();
  let run, previous;
  try {
    previous = await meta(db, 'ingestion');
    const resuming = Number.isInteger(previous?.resumeBefore) && Number.isInteger(previous?.resumeAfter) &&
      previous.resumeBefore > previous.resumeAfter && Number.isFinite(Date.parse(previous.targetCoverageThrough));
    const after = resuming ? previous.resumeAfter : Math.max(1104537600,
      Math.floor((previous?.coverageThrough ? Date.parse(previous.coverageThrough) - 172800000 : start - 604800000) / 1000));
    let before = resuming ? previous.resumeBefore : Math.floor(start / 1000);
    const target = resuming ? previous.targetCoverageThrough : attemptAt;
    run = { runId: crypto.randomUUID(), state: 'error', lastAttemptAt: attemptAt,
      lastSuccessAt: previous?.lastSuccessAt || null, coverageThrough: previous?.coverageThrough || null,
      fetched: 0, candidates: 0, updatedGames: 0, errorCode: null,
      resumeBefore: before, resumeAfter: after, targetCoverageThrough: target };
    await db.batch([putMeta(db, 'ingestion', run), query(db, 'DELETE FROM rate_limits WHERE expires_at<=?', Math.floor(start / 1000))]);
    let complete = false, pageFailure = false;
    const seen = new Set(), candidates = [];
    for (let page = 0; page < 3; page++) {
      let rows;
      try { rows = await archivePage(after, before, deps); }
      catch (error) { run.errorCode = classifyArchiveFailure(error).code; pageFailure = true; break; }
      let oldest = before;
      for (const raw of rows) {
        if (Number.isFinite(raw?.created_utc)) oldest = Math.min(oldest, Math.floor(raw.created_utc));
        if (typeof raw?.id !== 'string' || seen.has(raw.id)) continue;
        seen.add(raw.id); run.fetched++;
        const candidate = normalizePost(raw, start);
        if (candidate && raw.created_utc > after && raw.created_utc <= Date.parse(target) / 1000) candidates.push(candidate);
      }
      if (rows.length < 100) { complete = true; break; }
      const next = oldest + 1;
      if (next >= before || next <= after) { run.errorCode = 'CURSOR_STALLED'; break; }
      before = next;
      if (page < 2) await deps.sleep(600);
    }
    run.state = complete ? 'ok' : pageFailure && !run.fetched ? 'error' : 'partial';
    if (complete) {
      run.lastSuccessAt = new Date(deps.now()).toISOString(); run.coverageThrough = target;
      run.resumeBefore = null; run.resumeAfter = null; run.targetCoverageThrough = null;
    } else {
      run.resumeBefore = before;
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
        retrievedAt: attemptAt, mode: 'scheduled', coverageThrough: run.coverageThrough, lastSuccessfulIngestAt: run.lastSuccessAt } };
      const imported = await importCatalog(db, { ...finalHead, source: { ...finalHead.source,
        coverageThrough: previous?.coverageThrough || null, lastSuccessfulIngestAt: previous?.lastSuccessAt || null }, games: plan.changed });
      run.updatedGames = imported.importedGames;
      run.candidates = await savePending(db, plan.pending, attemptAt);
    }
    await db.batch([...(finalHead ? [putMeta(db, 'catalog', finalHead)] : []), putMeta(db, 'ingestion', run)]);
    if (run.state === 'error') throw unavailable();
    return { runId: run.runId, status: run.state, fetched: run.fetched, candidates: run.candidates, updatedGames: run.updatedGames };
  } catch (error) {
    if (run && run.state !== 'error') {
      // Retry the original frozen window on a persistence failure. Source/game
      // writes are idempotent; advancing an uncommitted checkpoint is not safe.
      run.state = 'error'; run.errorCode = 'INGESTION_FAILED';
      run.lastSuccessAt = previous?.lastSuccessAt || null; run.coverageThrough = previous?.coverageThrough || null;
      run.resumeBefore = previous?.resumeBefore || null; run.resumeAfter = previous?.resumeAfter || null;
      run.targetCoverageThrough = previous?.targetCoverageThrough || null;
      await putMeta(db, 'ingestion', run).run();
    }
    throw error;
  } finally { await release(db, 'ingestion_lock', owner); }
}
