import test from 'node:test';
import assert from 'node:assert/strict';
import { fixtureEnv, fixtureCatalog, fixtureGame, rawPost, NOW } from './helpers.mjs';
import { importCatalog, meta, putMeta, query } from '../src/store.mjs';
import { ingest } from '../src/ingestion.mjs';
import { hydrateMedia } from '../src/assets.mjs';
import { refreshSourceBatch } from '../src/source-evidence.mjs';
import { rememberArchiveCooldown, providerCooldownStatement } from '../src/archive-cooldown.mjs';
import { saveScoreObservations } from '../src/reddit-scores.mjs';
import { queueFeedbackMaintenance } from '../src/jobs.mjs';

const deps = fetch => ({ now: () => NOW, sleep: async () => {}, fetch });

test('provider cooldown updates preserve the longest deadline and other providers', async () => {
  const env = fixtureEnv(), db = env.DB;
  await rememberArchiveCooldown(db, NOW + 3600000);
  await providerCooldownStatement(db, 'jev', NOW + 7200000).run();
  await rememberArchiveCooldown(db, NOW + 60000);
  assert.deepEqual(await meta(db, 'editorial_cooldown'), { archive: NOW + 3600000, jev: NOW + 7200000 });
  db.close();
});

test('ingestion, historical collection and media honor an archive cooldown without advancing checkpoints', async () => {
  const env = fixtureEnv(); await importCatalog(env.DB, fixtureCatalog());
  const checkpoint = { state: 'partial', coverageThrough: '2026-10-08T00:00:00.000Z', resumeBefore: NOW / 1000, resumeAfter: NOW / 1000 - 3600 };
  await putMeta(env.DB, 'ingestion', checkpoint).run();
  await rememberArchiveCooldown(env.DB, NOW + 120000);
  let calls = 0; const d = deps(async () => { calls++; throw new Error('Should not fetch'); });
  await assert.rejects(ingest(env, d), error => error.retryAfterSeconds === 120);
  await assert.rejects(ingest(env, d, true), error => error.retryAfterSeconds === 120);
  assert.equal((await hydrateMedia(env, d)).checked, 0);
  assert.equal((await refreshSourceBatch(env.DB, d)).checked, 0);
  assert.equal(calls, 0);
  assert.deepEqual(await meta(env.DB, 'ingestion'), checkpoint);
  assert.equal(await meta(env.DB, 'history'), null);
  assert.equal(env.DB.sql.prepare('SELECT media_checked_at FROM source_posts').get().media_checked_at, null);
  assert.equal(await meta(env.DB, 'ingestion_lock'), null);
  env.DB.close();
});

test('a media or ingestion rate limit pauses the other archive consumers, then permits recovery', async () => {
  for (const first of ['media', 'ingestion']) {
    const env = fixtureEnv(); await importCatalog(env.DB, fixtureCatalog());
    let calls = 0;
    const d = deps(async () => { calls++; return new Response('', { status: 429, headers: { 'Retry-After': '180' } }); });
    await assert.rejects(first === 'media' ? hydrateMedia(env, d) : ingest(env, d));
    assert.equal((await meta(env.DB, 'editorial_cooldown')).archive, NOW + 180000);
    await assert.rejects(ingest(env, d, true));
    assert.equal((await hydrateMedia(env, d)).checked, 0);
    assert.equal(calls, 1);
    assert.equal((await ingest(env, { ...d, now: () => NOW + 181000, fetch: async () => Response.json({ data: [] }) })).status, 'ok');
    env.DB.close();
  }
});

// These query plans are the regression: SQLite used to loop over the entire
// published catalogue for each JSON batch. Verify primary-key lookups on the
// production SQL, alongside the existing source-membership/score behavior tests.
test('source-link and score writes keep the incoming batch outside catalogue scans', async () => {
  const env = fixtureEnv(), db = env.DB;
  await importCatalog(db, fixtureCatalog(Array.from({ length: 250 }, (_, i) => fixtureGame(`q${String(i).padStart(4, '0')}`, `Maker${i}`))));
  const statements = [], prepare = db.prepare.bind(db);
  db.prepare = sql => { const result = prepare(sql); statements.push(result); return result; };
  await ingest(env, deps(async () => Response.json({ data: [rawPost('bound1', {
    selftext: 'I made a puzzle game. Play here: https://newmaker.itch.io/my-game', score: 12, retrieved_on: NOW / 1000,
  })] })));
  const writes = statements.filter(s => /^INSERT INTO (project_references|reddit_scores)\(/.test(s.sql));
  assert.equal(writes.length, 2);
  for (const s of writes) {
    const plan = db.sql.prepare('EXPLAIN QUERY PLAN ' + s.sql).all(...s.args).map(row => row.detail);
    assert.match(plan[0], /^SCAN [rj] VIRTUAL TABLE/);
    assert.ok(plan.some(step => /SEARCH p USING INDEX .+ \(id=\?\)/.test(step)), plan.join('\n'));
    assert.ok(plan.some(step => /SEARCH g USING INDEX .+ \(id=\?\)/.test(step)), plan.join('\n'));
    assert.ok(!plan.some(step => /games_published_date_idx/.test(step)), plan.join('\n'));
  }
  assert.equal(db.sql.prepare("SELECT count(*) n FROM project_references WHERE game_id='g_bound1'").get().n, 1);
  const score = saveScoreObservations(db, [{ postId: 'bound1', score: 99, observedAt: null, checkedAt: new Date(NOW).toISOString() }], { initialOnly: true });
  assert.equal((await score.run()).meta.changes, 0);
  assert.equal(db.sql.prepare("SELECT score FROM reddit_scores WHERE post_id='bound1'").get().score, 12);
  const referenceWrite = writes.find(s => s.sql.startsWith('INSERT INTO project_references'));
  assert.equal((await referenceWrite.run()).meta.changes, 0, 'an unchanged reference must not be written again');
  db.close();
});

test('the hourly feedback queue starts from eligible notes and preserves per-game deduplication', async () => {
  const env = fixtureEnv(), db = env.DB;
  await importCatalog(db, fixtureCatalog([fixtureGame('queue1'), fixtureGame('queue2'), fixtureGame('queue3')]));
  for (const [id, gameId, body, status] of [['note1','g_queue1','Useful written feedback','published'], ['note2','g_queue1','Another written note','published'], ['note3','g_queue2','','published'], ['note4','g_queue3','Hidden written feedback','hidden']]) {
    await query(db, 'INSERT INTO feedback(id,game_id,guest_key_hash,display_name,body,status,created_at,updated_at,choices_json) VALUES(?,?,?,?,?,?,?,?,?)', id, gameId, id, 'Guest', body, status, new Date(NOW).toISOString(), new Date(NOW).toISOString(), '["visuals"]').run();
  }
  assert.equal((await queueFeedbackMaintenance(db, deps())).queued, 1);
  assert.equal((await queueFeedbackMaintenance(db, deps())).queued, 0);
  assert.deepEqual(db.sql.prepare("SELECT game_id FROM editorial_jobs WHERE requested_by='feedback-maintenance'").all().map(row => row.game_id), ['g_queue1']);
  db.close();
});
