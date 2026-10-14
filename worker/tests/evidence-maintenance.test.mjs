import test from 'node:test';
import assert from 'node:assert/strict';
import { fixtureEnv, fixtureCatalog, fixtureGame, NOW } from './helpers.mjs';
import { importCatalog, query, putMeta } from '../src/store.mjs';
import { inspectComment, refreshEvidenceBatch, evidenceMaintenanceStatus, checkedRedditEvidence } from '../src/evidence-maintenance.mjs';
import { updateJob, listJobs, enqueueJobs, runJobs } from '../src/jobs.mjs';

const date = n => new Date(n).toISOString(), at = date(NOW), accepted = date(NOW - 86400000);
const url = 'https://www.reddit.com/r/aigamedev/comments/abc12/_/comm01/';
const original = { id: 'comm01', link_id: 't3_abc12', author: 'APlayer', body: 'I played it; the controls need work.', created_utc: (NOW - 3600000) / 1000, retrieved_on: NOW / 1000 };
const citation = { number: 1, url, source: 'reddit', author: original.author, body: original.body, createdAt: date(original.created_utc * 1000), theme: 'controls', tone: 'concern', experience: 'played' };
const review = { summary: 'A player asked for better controls [1].', citations: [citation], windowStart: accepted, windowEnd: at, editorialReview: { checkedAt: accepted } };
function deps(records = [original], now = NOW, hook = () => {}) {
  let calls = 0;
  return { now: () => now, sleep: async () => {}, get calls() { return calls; }, fetch: async address => {
    calls++; assert.ok(address.startsWith('https://arctic-shift.photon-reddit.com/api/comments/ids?ids='));
    assert.ok(new URL(address).searchParams.get('ids').split(',').length <= 80);
    await hook(); return Response.json({ data: records });
  } };
}
async function setup(games = [fixtureGame()]) {
  const env = fixtureEnv(); await importCatalog(env.DB, fixtureCatalog(games));
  for (const game of games) await query(env.DB, 'INSERT INTO feedback_reviews VALUES(?,?,?,?)', game.id, JSON.stringify(review), accepted, 'editor').run();
  return env.DB;
}
const source = { url, id: 'comm01', postId: 'abc12', acceptedAt: accepted, citations: [citation], facts: [] };

test('source states distinguish current, changed, missing, stale and unrelated comments', async () => {
  assert.equal((await inspectComment(source, original, NOW)).state, 'matches-accepted-evidence');
  assert.equal((await inspectComment(source, null, NOW)).state, 'missing-from-archive');
  assert.equal((await inspectComment(source, { ...original, link_id: 't3_other' }, NOW)).state, 'identity-mismatch');
  assert.equal((await inspectComment(source, { ...original, body: 'A revised reaction' }, NOW)).actionable, true);
  for (const retrieved_on of [undefined, (NOW - 2 * 86400000) / 1000]) {
    const checked = await inspectComment(source, { ...original, body: '[deleted]', retrieved_on }, NOW);
    assert.equal(checked.state, 'older-or-undated-archive'); assert.equal(checked.actionable, false);
  }
  assert.equal((await inspectComment(source, { ...original, body: '[deleted]' }, NOW)).state, 'removed-in-archive');
});
test('current evidence advances the cadence without duplicate requests or alerts', async () => {
  const db = await setup(), d = deps(); db.statementCount = 0;
  const result = await refreshEvidenceBatch(db, d);
  assert.equal(result.checked, 1); assert.equal(result.flagged, 0); assert.equal(d.calls, 1);
  assert.ok(db.statementCount <= 50, db.statementCount);
  assert.equal((await refreshEvidenceBatch(db, d)).checked, 0); assert.equal(d.calls, 1);
  assert.equal((await evidenceMaintenanceStatus(db)).awaitingReview, 0);
  const stored = JSON.stringify((await query(db, 'SELECT * FROM evidence_checks').all()).results);
  assert.ok(!stored.includes(original.body)); assert.ok(!stored.includes(original.author)); db.close();
});
test('missing archive records flag review without removing the published summary', async () => {
  const db = await setup(); const result = await refreshEvidenceBatch(db, deps([]));
  assert.equal(result.withdrawn, 0); assert.equal(result.flagged, 1);
  assert.equal((await query(db, 'SELECT count(*) AS n FROM feedback_reviews').first()).n, 1);
  const job = (await listJobs(db, 'ready')).jobs[0]; assert.equal(job.result.sourceWatch, true);
  await updateJob(db, job.id, { action: 'dismiss' }, { subject: 'editor' }, deps());
  await assert.rejects(updateJob(db, job.id, { action: 'retry' }, { subject: 'editor' }, deps()));
  await refreshEvidenceBatch(db, deps([], NOW + 8 * 86400000));
  assert.equal((await listJobs(db, 'ready')).jobs.length, 0, 'unchanged missing record must not reopen a dismissal'); db.close();
});
test('a confirmed removal withdraws dependent reviews and draft copies, preserving accounts, guest notes and overrides', async () => {
  const db = await setup();
  await query(db, 'INSERT INTO editorial_jobs VALUES(?,?,?,?,?,?,?,?,?,?)', 'draft', 'g_abc12', 'feedback', 'ready', accepted, JSON.stringify({ ...review, evidence: [citation] }), 1, accepted, accepted, 'editor').run();
  await query(db, "INSERT INTO project_overrides(game_id,details_json,updated_at,updated_by,revision) VALUES(?,?,?,?,1)", 'g_abc12', '{"title":"Admin name"}', accepted, 'editor').run();
  await query(db, "INSERT INTO feedback(id,game_id,guest_key_hash,display_name,body,created_at,updated_at) VALUES('note','g_abc12','private','Guest','Keep my note',?,?)", accepted, accepted).run();
  await query(db, 'INSERT INTO ratings VALUES(?,?,?,?)', 'g_abc12', 'private', 5, accepted).run();
  const result = await refreshEvidenceBatch(db, deps([{ ...original, body: '[removed]' }]));
  assert.equal(result.withdrawn, 1);
  assert.equal((await query(db, 'SELECT count(*) AS n FROM feedback_reviews').first()).n, 0);
  assert.equal((await query(db, 'SELECT count(*) AS n FROM ratings').first()).n, 1);
  assert.equal((await query(db, 'SELECT body FROM feedback').first()).body, 'Keep my note');
  assert.equal((await query(db, 'SELECT details_json FROM project_overrides').first()).details_json, '{"title":"Admin name"}');
  const jobs = await listJobs(db, 'all'); assert.ok(!JSON.stringify(jobs).includes(original.body));
  assert.equal(jobs.jobs.find(job => job.id === 'draft').status, 'dismissed');
  assert.equal((await evidenceMaintenanceStatus(db)).awaitingReview, 1); db.close();
});
test('a stale archive sample cannot republish a removed source; a newer correction can be reviewed', async () => {
  const db = await setup(); const body = 'I played more; the controls now work well.';
  await refreshEvidenceBatch(db, deps([{ ...original, body }]));
  await assert.rejects(checkedRedditEvidence(db, 'g_abc12', [citation]));
  await assert.rejects(checkedRedditEvidence(db, 'g_abc12', [{ ...citation, archiveRetrievedAt: at }]));
  assert.ok(await checkedRedditEvidence(db, 'g_abc12', [{ ...citation, body, archiveRetrievedAt: at }]));
  const later = date(NOW + 3600000);
  assert.ok(await checkedRedditEvidence(db, 'g_abc12', [{ ...citation, body: 'Another later revision', archiveRetrievedAt: later }]));
  db.close();
});
test('creator facts survive unrelated body edits, but a removed supporting quote is withdrawn', async () => {
  for (const preserved of [true, false]) {
    const db = await setup(); await query(db, 'DELETE FROM feedback_reviews').run();
    await query(db, 'INSERT INTO project_facts VALUES(?,?,?,?,?,?)', 'g_abc12', 'title', '"A Game"', url, 'It is called A Game.', accepted).run();
    const raw = { ...original, author: 'MakerName', body: preserved ? 'Update: It is called A Game. New information.' : 'I removed the name.' };
    const result = await refreshEvidenceBatch(db, deps([raw]));
    assert.equal(result.withdrawn, preserved ? 0 : 1);
    assert.equal((await query(db, 'SELECT count(*) AS n FROM project_facts').first()).n, preserved ? 1 : 0); db.close();
  }
});
test('a concurrent editorial publication aborts the whole check without deleting new evidence', async () => {
  const db = await setup();
  const revised = JSON.stringify({ ...review, summary: 'New editorial review' });
  const d = deps([{ ...original, body: '[removed]' }], NOW, async () => { await query(db, 'UPDATE feedback_reviews SET payload_json=?', revised).run(); });
  assert.equal((await refreshEvidenceBatch(db, d)).deferred, true);
  assert.equal((await query(db, 'SELECT payload_json FROM feedback_reviews').first()).payload_json, revised);
  assert.equal((await query(db, 'SELECT count(*) AS n FROM evidence_checks').first()).n, 0); db.close();
});
test('the batch caps projects, IDs and daily calls; archive 429 stores a shared cooldown', async () => {
  const games = Array.from({ length: 6 }, (_, i) => fixtureGame(`test0${i}`));
  const db = await setup(games); const d = deps();
  assert.equal((await refreshEvidenceBatch(db, d)).checked, 4); // no citations belong to these unrelated parents
  assert.equal(d.calls, 0); db.close();
  const limited = await setup(); await putMeta(limited, 'evidence_check_budget', { day: at.slice(0, 10), requests: 4 }).run();
  assert.equal((await refreshEvidenceBatch(limited, deps())).limited, true); limited.close();
  const cooled = await setup(); let calls = 0;
  const fail = { ...deps(), fetch: async () => { calls++; return new Response('', { status: 429, headers: { 'Retry-After': '120' } }); } };
  assert.equal((await refreshEvidenceBatch(cooled, fail)).deferred, true);
  assert.equal((await refreshEvidenceBatch(cooled, fail)).limited, true); assert.equal(calls, 1); cooled.close();
});
test('creator destination flags reuse stored observations, with no extra network request', async () => {
  const db = await setup(); await query(db, 'DELETE FROM feedback_reviews').run();
  await query(db, 'INSERT INTO project_facts VALUES(?,?,?,?,?,?)', 'g_abc12', 'projectUrl', '"https://maker.itch.io/puzzle"', 'https://www.reddit.com/r/aigamedev/comments/abc12/', 'Play here', accepted).run();
  await query(db, 'INSERT INTO project_enrichment VALUES(?,?,?,?)', 'g_abc12', 'https://maker.itch.io/puzzle', JSON.stringify({ status: 'broken', httpStatus: 404, checkedAt: accepted }), accepted).run();
  const d = deps(); const result = await refreshEvidenceBatch(db, d);
  assert.equal(result.flagged, 1); assert.equal(d.calls, 0); assert.equal(result.withdrawn, 0);
  const job = (await listJobs(db, 'ready')).jobs[0]; assert.match(job.result.flags[0], /404/);
  await query(db, 'UPDATE project_enrichment SET payload_json=?', JSON.stringify({ status: 'reachable', checkedAt: date(NOW + 8 * 86400000) })).run();
  await refreshEvidenceBatch(db, deps([], NOW + 8 * 86400000));
  assert.equal((await listJobs(db, 'ready')).jobs.length, 0); db.close();
});
test('large source sets fit the scheduled budgets and partial projects stay due', async () => {
  const games = Array.from({ length: 4 }, (_, i) => fixtureGame(`batch${i}`));
  const db = await setup(games), records = [];
  for (const [index, game] of games.entries()) {
    const citations = Array.from({ length: 30 }, (_, n) => ({ ...citation, number: n + 1,
      url: `https://www.reddit.com/r/aigamedev/comments/batch${index}/_/c${index}${String(n).padStart(3, '0')}/` }));
    for (const cited of citations) records.push({ ...original, id: cited.url.split('/').at(-2), link_id: `t3_batch${index}`, body: '[deleted]' });
    await query(db, 'UPDATE feedback_reviews SET payload_json=? WHERE game_id=?', JSON.stringify({ ...review, citations }), game.id).run();
  }
  const d = deps(records); db.statementCount = 0;
  const first = await refreshEvidenceBatch(db, d);
  assert.equal(first.checked, 2); assert.equal(first.comments, 60); assert.equal(first.withdrawn, 2);
  assert.ok(db.statementCount <= 50, db.statementCount);
  assert.equal((await query(db, 'SELECT count(*) AS n FROM evidence_checks').first()).n, 2);
  const second = await refreshEvidenceBatch(db, d);
  assert.equal(second.checked, 2); assert.equal(second.withdrawn, 2); assert.equal(d.calls, 2); db.close();
});
test('withdrawal during a running Jev job cannot restore its stale comments', async () => {
  const db = await setup(), env = fixtureEnv(db, { JEV_API_KEY: 'fixture' });
  const d = { now: () => NOW, sleep: async () => {}, fetch: async (address, options) => {
    if (address.includes('/comments/search')) return Response.json({ data: [original] });
    if (address.includes('api.typesafe.ai')) {
      await refreshEvidenceBatch(db, deps([{ ...original, body: '[deleted]' }]));
      const input = JSON.parse(options.body);
      return Response.json({ answers: Object.fromEntries(Object.keys(input.questions).map(key => {
        const choice = key.startsWith('theme') ? 'controls' : key.startsWith('tone') ? 'concern' : 'played';
        return [key, { type: 'choice', choice, probabilities: { [choice]: .99 } }];
      })) });
    }
    throw new Error('Unexpected request');
  } };
  await enqueueJobs(db, { kind: 'feedback', scope: 'game', gameId: 'g_abc12' }, { subject: 'editor' }, d);
  await runJobs(db, env, d);
  const jobs = await listJobs(db, 'all');
  assert.ok(!JSON.stringify(jobs).includes(original.body));
  assert.equal(jobs.jobs.find(job => job.kind === 'feedback').status, 'dismissed'); db.close();
});
