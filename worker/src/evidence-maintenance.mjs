import { query, meta, putMeta } from './store.mjs';
import { acquire, release } from './lease.mjs';
import { archiveJson } from './references.mjs';
import { effectiveProjectUrl } from './details.mjs';
import { rememberArchiveCooldown } from './archive-cooldown.mjs';

const day = 86400000;
export const evidencePolicy = Object.freeze({ eligibleAfterDays: 7, maxProjects: 4, maxIds: 80, maxRequestsPerDay: 4, hoursUTC: [6, 12, 18, 22] });
const hash = async value => Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(JSON.stringify(value)))), byte => byte.toString(16).padStart(2, '0')).join('');
const normalize = value => String(value || '').normalize('NFKC').replace(/\s+/g, ' ').trim();
const iso = value => Number.isFinite(Date.parse(value)) ? value : null;
const epoch = (seconds, now) => typeof seconds === 'number' && seconds >= 1104537600 && seconds * 1000 <= now + 30000 ? new Date(seconds * 1000).toISOString() : null;

export function commentReference(url) {
  if (typeof url !== 'string') return null;
  const match = /^https:\/\/www\.reddit\.com\/r\/aigamedev\/comments\/([a-z0-9]{5,12})\/[^/]+\/([a-z0-9]{5,12})\/$/.exec(url);
  return match ? { url, postId: match[1], id: match[2] } : null;
}

// A fresh fetch is not necessarily a fresh archive observation. Missing records,
// identity mismatches and older archive revisions never establish a removal.
export async function inspectComment(source, raw, now) {
  const base = { url: source.url, id: source.id, postId: source.postId, acceptedAt: source.acceptedAt, expectedHash: source.expectedHash || null };
  if (!raw) return { ...base, state: 'missing-from-archive', actionable: false };
  const retrievedAt = epoch(raw.retrieved_on, now);
  if (raw.id !== source.id || String(raw.link_id || '').replace(/^t3_/, '') !== source.postId) return { ...base, state: 'identity-mismatch', actionable: false, retrievedAt };
  const removed = raw.removed_by_category || raw.removed_by || raw.removed === true
    || [raw.body, raw.author].some(value => typeof value === 'string' && /^\[(deleted|removed)\]$/i.test(value.trim()));
  const matches = !removed && typeof raw.body === 'string' && (source.citations || []).every(citation => raw.body.slice(0, 1800) === citation.body
    && raw.author === citation.author && epoch(raw.created_utc, now) === citation.createdAt)
    && (source.facts || []).every(fact => raw.author?.toLowerCase() === source.authorKey && normalize(raw.body).includes(normalize(fact.evidence_text)));
  const observedHash = !removed && typeof raw.body === 'string' ? await hash([raw.body.slice(0, 1800), raw.author, epoch(raw.created_utc, now)]) : null;
  const hasEvidence = (source.citations?.length || 0) + (source.facts?.length || 0) > 0;
  const current = hasEvidence ? matches : source.expectedHash && observedHash === source.expectedHash;
  if (current) return { ...base, state: 'matches-accepted-evidence', actionable: false, retrievedAt, expectedHash: observedHash };
  const fresh = retrievedAt && retrievedAt >= (source.archiveRetrievedAt || source.acceptedAt);
  return { ...base, state: fresh ? removed ? 'removed-in-archive' : 'changed-in-archive' : 'older-or-undated-archive',
    actionable: Boolean(fresh), retrievedAt, observedHash };
}

export async function checkedRedditEvidence(db, gameId, evidence) {
  const row = await query(db, 'SELECT payload_json FROM evidence_checks WHERE game_id=?', gameId).first();
  const stored = row?.payload_json || '';
  for (const source of (stored ? JSON.parse(stored).sources : []) || []) if (source.actionable) {
    for (const entry of evidence || []) if (entry.source !== 'playtrace' && entry.url === source.url) {
      const observed = iso(entry.archiveRetrievedAt);
      const matches = source.observedHash && await hash([entry.body, entry.author, entry.createdAt]) === source.observedHash;
      if (!observed || !source.retrievedAt || observed < source.retrievedAt || !matches && observed <= source.retrievedAt) {
        throw new Error('A Reddit source changed after this evidence was collected.');
      }
    }
  }
  return stored;
}

async function projectSources(row, facts) {
  const game = JSON.parse(row.game_json), review = row.review_json ? JSON.parse(row.review_json) : null;
  const previous = row.check_json ? JSON.parse(row.check_json) : null, byUrl = new Map();
  function add(url, acceptedAt) {
    const ref = commentReference(url); if (!ref || !game.posts.some(post => post.id === ref.postId)) return null;
    if (!byUrl.has(url)) byUrl.set(url, { ...ref, acceptedAt, authorKey: game.author.name.toLowerCase(), citations: [], facts: [] });
    const source = byUrl.get(url); if (acceptedAt > source.acceptedAt) source.acceptedAt = acceptedAt;
    return source;
  }
  for (const citation of review?.citations || []) if (citation.source !== 'playtrace') {
    const source = add(citation.url, iso(review.editorialReview?.checkedAt) || row.published_at);
    if (source) { source.citations.push(citation); source.archiveRetrievedAt = iso(citation.archiveRetrievedAt); }
  }
  for (const fact of facts) { const source = add(fact.source_url, fact.checked_at); if (source) source.facts.push(fact); }
  // Keep watching a withdrawn source until an editor has replaced its evidence.
  for (const source of previous?.sources || []) if (!byUrl.has(source.url) && source.actionable) {
    const next = add(source.url, source.acceptedAt); if (next) Object.assign(next, { expectedHash: source.expectedHash });
  }
  for(const source of byUrl.values())if(source.citations.length){const cited=source.citations[0];source.expectedHash=await hash([cited.body,cited.author,cited.createdAt]);}
  return [...byUrl.values()];
}

export async function evidenceMaintenanceStatus(db) {
  const [lastRun, budget, flags] = await Promise.all([
    meta(db, 'evidence_check_run'), meta(db, 'evidence_check_budget'),
    query(db, "SELECT count(*) AS count FROM editorial_jobs j JOIN games g ON g.id=j.game_id WHERE j.requested_by='evidence-maintenance' AND j.status='ready' AND g.status='published' AND NOT EXISTS(SELECT 1 FROM removals WHERE game_id=g.id)").first(),
  ]);
  return { policy: evidencePolicy, lastRun, budget, awaitingReview: flags.count };
}

export async function refreshEvidenceBatch(db, deps) {
  const owner = await acquire(db, 'evidence_check_lock', deps.now(), 180000);
  if (!owner) return { checked: 0, busy: true };
  const at = new Date(deps.now()).toISOString(), date = at.slice(0, 10);
  try {
    const saved = await meta(db, 'evidence_check_budget');
    const budget = saved?.day === date ? saved : { day: date, requests: 0 };
    const cooldown = await meta(db, 'editorial_cooldown') || {};
    if (budget.requests >= evidencePolicy.maxRequestsPerDay || cooldown.archive > deps.now()) return { checked: 0, limited: true };
    const rows = (await query(db, `WITH candidates AS (
        SELECT game_id FROM feedback_reviews UNION SELECT game_id FROM project_facts WHERE field='projectUrl' OR source_url LIKE 'https://www.reddit.com/r/aigamedev/comments/%/_/%/'
        UNION SELECT game_id FROM evidence_checks WHERE json_array_length(json_extract(payload_json,'$.flags'))>0)
      SELECT g.id,g.payload_json AS game_json,r.payload_json AS review_json,r.published_at,c.payload_json AS check_json,
        e.project_url,e.payload_json AS enrichment_json,(${effectiveProjectUrl()}) AS current_url
      FROM candidates t JOIN games g ON g.id=t.game_id LEFT JOIN feedback_reviews r ON r.game_id=g.id
        LEFT JOIN evidence_checks c ON c.game_id=g.id LEFT JOIN project_enrichment e ON e.game_id=g.id LEFT JOIN project_overrides o ON o.game_id=g.id
      WHERE g.status='published' AND NOT EXISTS(SELECT 1 FROM removals WHERE game_id=g.id) AND (c.next_check_at IS NULL OR c.next_check_at<=?)
      ORDER BY COALESCE(c.checked_at,''),g.id LIMIT ?`, at, evidencePolicy.maxProjects).all()).results;
    if (!rows.length) return { checked: 0 };
    const facts = (await query(db, 'SELECT * FROM project_facts WHERE game_id IN(SELECT value FROM json_each(?))', JSON.stringify(rows.map(row => row.id))).all()).results;
    const projects = [], selectedIds = new Set();
    for(const row of rows){
      const currentFacts=facts.filter(fact=>fact.game_id===row.id),sources=await projectSources(row,currentFacts);
      const combined=new Set([...selectedIds,...sources.map(source=>source.id)]);
      // Defer the whole project if it does not fit, so a partial batch can never
      // advance its due date while starving the remaining citations.
      if(combined.size>evidencePolicy.maxIds)break;
      projects.push({row,facts:currentFacts,sources});for(const id of combined)selectedIds.add(id);
    }
    const ids = [...selectedIds];
    let records = [];
    if (ids.length) {
      budget.requests++;
      await putMeta(db, 'evidence_check_budget', budget).run();
      records = await archiveJson(`comments/ids?ids=${ids.join(',')}`, deps, { maxAttempts: 1 });
    }
    const statements = [], changes = [], flags = [], checks = [];
    for (const { row, facts: currentFacts, sources } of projects) {
      const checked = [];
      for (const source of sources) {
        const observation = ids.includes(source.id) ? await inspectComment(source, records.find(raw => raw.id === source.id), deps.now())
          : { url: source.url, id: source.id, postId: source.postId, state: 'batch-limit', actionable: false, acceptedAt: source.acceptedAt };
        checked.push(observation);
      }
      const actionable = checked.filter(source => source.actionable), issues = checked.filter(source => !['matches-accepted-evidence', 'older-or-undated-archive'].includes(source.state));
      const messages = issues.map(source => `${source.id}: ${source.state.replace(/-/g, ' ')}${source.actionable ? '. Dependent evidence withdrawn for review.' : '. Open the source to verify; no removal inferred.'}`);
      let linkIssue = null;
      const enrichment = row.enrichment_json ? JSON.parse(row.enrichment_json) : null;
      if (row.current_url && currentFacts.some(fact => fact.field === 'projectUrl')) {
        if (!enrichment || row.current_url !== row.project_url) { linkIssue = 'unchecked'; messages.push('Creator-linked destination has no check for the current URL.'); }
        else if (enrichment.status === 'broken') { linkIssue = `broken:${enrichment.httpStatus || ''}`; messages.push(`Creator-linked destination returned HTTP ${enrichment.httpStatus || '404/410'} on ${String(enrichment.checkedAt || '').slice(0, 10)}. This does not establish abandonment.`); }
        else if (!iso(enrichment.checkedAt) || Date.parse(enrichment.checkedAt) < deps.now() - (enrichment.status === 'reachable' ? 30 : 7) * day) { linkIssue = 'stale'; messages.push('Creator-linked destination is due for a new observation. The existing link queue handles that request.'); }
      }
      const payload = { version: 1, sourceWatch: true, checkedAt: at, sources: checked, flags: messages,
        sourceChecks: checked.map(source => ({ id: source.id, url: source.url, state: source.state, retrievedAt: source.retrievedAt || null })),
        note: 'Cited comments and accepted creator evidence are checked in bounded batches. Archive observations can lag. Links reuse the stored destination check.' };
      // Guard the exact evidence inspected across the network await. A concurrent
      // publication, merge or edit aborts the transaction instead of deleting it.
      statements.push(query(db, `INSERT INTO app_meta(key,value_json) VALUES('evidence_check_guard', CASE WHEN
          EXISTS(SELECT 1 FROM games WHERE id=? AND payload_json=? AND status='published' AND NOT EXISTS(SELECT 1 FROM removals WHERE game_id=games.id))
          AND COALESCE((SELECT payload_json FROM feedback_reviews WHERE game_id=?),'')=?
          AND (SELECT count(*) FROM project_facts WHERE game_id=?)=?
          AND NOT EXISTS(SELECT 1 FROM json_each(?) j LEFT JOIN project_facts f ON f.game_id=? AND f.field=json_extract(j.value,'$.field')
            WHERE f.field IS NULL OR f.value_json<>json_extract(j.value,'$.value_json') OR f.source_url<>json_extract(j.value,'$.source_url') OR f.evidence_text<>json_extract(j.value,'$.evidence_text') OR f.checked_at<>json_extract(j.value,'$.checked_at'))
        THEN 'true' ELSE NULL END) ON CONFLICT(key) DO UPDATE SET value_json=excluded.value_json`, row.id, row.game_json, row.id, row.review_json || '', row.id, currentFacts.length, JSON.stringify(currentFacts), row.id));
      if (actionable.length) {
        const urls = JSON.stringify(actionable.map(source => source.url));
        statements.push(query(db, `DELETE FROM feedback_reviews WHERE game_id=? AND EXISTS(SELECT 1 FROM json_each(payload_json,'$.citations') c WHERE json_extract(c.value,'$.url') IN(SELECT value FROM json_each(?))) RETURNING game_id`, row.id, urls));
        statements.push(query(db, 'DELETE FROM project_facts WHERE game_id=? AND source_url IN(SELECT value FROM json_each(?)) RETURNING game_id', row.id, urls));
        statements.push(query(db, `UPDATE editorial_jobs SET status='dismissed',payload_json=?,updated_at=? WHERE game_id=? AND kind='feedback'
          AND (status='running' OR EXISTS(SELECT 1 FROM json_tree(payload_json) j WHERE j.type='text' AND j.value IN(SELECT value FROM json_each(?))))`, JSON.stringify({ note: 'A cited source changed. Run a new feedback review before publishing.', sourceChecks: payload.sourceChecks }), at, row.id, urls));
        changes.push(row.id);
      }
      statements.push(query(db, `INSERT INTO evidence_checks(game_id,checked_at,next_check_at,payload_json) VALUES(?,?,?,?)
        ON CONFLICT(game_id) DO UPDATE SET checked_at=excluded.checked_at,next_check_at=excluded.next_check_at,payload_json=excluded.payload_json`, row.id, at, new Date(deps.now() + 7 * day).toISOString(), JSON.stringify(payload)));
      // A stable job per project coalesces alerts. Dismissal survives unchanged
      // issues; new source states or a recovered link can update that decision.
      payload.issueFingerprint = await hash([issues.map(source => [source.url, source.state]), linkIssue, linkIssue ? row.current_url : null]);
      statements.push(query(db, `INSERT INTO editorial_jobs(id,game_id,kind,status,window_start,payload_json,created_at,updated_at,requested_by)
        SELECT ?,?,'references','ready','source-watch',?,?,?,'evidence-maintenance' WHERE ?
        ON CONFLICT(game_id,kind,window_start) DO UPDATE SET payload_json=excluded.payload_json,updated_at=excluded.updated_at,status='ready'
          WHERE json_extract(editorial_jobs.payload_json,'$.issueFingerprint')<>json_extract(excluded.payload_json,'$.issueFingerprint')`, crypto.randomUUID(), row.id, JSON.stringify(payload), at, at, messages.length > 0 ? 1 : 0));
      if (!messages.length) statements.push(query(db, "UPDATE editorial_jobs SET status='dismissed',payload_json=?,updated_at=? WHERE game_id=? AND requested_by='evidence-maintenance'", JSON.stringify(payload), at, row.id));
      flags.push(...messages); checks.push(row.id);
    }
    const result = { checked: checks.length, comments: ids.length, flagged: flags.length, withdrawn: changes.length, checkedAt: at };
    statements.push(putMeta(db, 'evidence_check_run', result));
    await db.batch(statements);
    return result;
  } catch (error) {
    if (error.queueCooldown === 'archive') {
      await rememberArchiveCooldown(db, error.retryAt);
    }
    await putMeta(db, 'evidence_check_run', { checked: 0, checkedAt: at, status: 'deferred', reason: error.queueCooldown === 'archive' ? 'archive-cooldown' : 'source-or-evidence-changed' }).run();
    return { checked: 0, deferred: true };
  } finally { await release(db, 'evidence_check_lock', owner); }
}
