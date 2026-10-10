import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizePost } from '../src/archive.mjs';
import { classifySource } from '../src/taxonomy.mjs';
import { ingest, ARCHIVE_URL } from '../src/ingestion.mjs';
import { catalog, importCatalog, meta, removal } from '../src/store.mjs';
import { acquire } from '../src/lease.mjs';
import { NOW, fixtureEnv, fixtureCatalog, rawPost } from './helpers.mjs';

const deps = data => ({ now: () => NOW, sleep: async () => {}, fetch: async () => Response.json({ data }) });
test('normalizer rejects removed/adult/discussion/malformed rows and decodes preview URLs once', () => {
  const valid = normalizePost(rawPost(), NOW);
  assert.equal(valid.clear, true); assert.equal(valid.preview.url, 'https://preview.redd.it/game.png?x=1&y=2');
  assert.equal(valid.projectUrl, 'https://newmaker.itch.io/my-game');
  assert.equal(valid.post.url, 'https://www.reddit.com/r/aigamedev/comments/new12/');
  for (const change of [{ author: undefined }, { author: null }, { author: 12345 }, { id: undefined }, { id: null }, { id: 12345 },
    { author: '[deleted]' }, { selftext: '[removed]' }, { removed_by_category: 'moderator' },
    { removed: true }, { over_18: true }, { stickied: true }, { id: '../bad' }, { subreddit: 'other' },
    { created_utc: NOW / 1000 + 60 }, { created_utc: '1234' }, { title: 'How to build a game?' },
    { title: 'I built a game generator tool' }, { title: 'Here is my photo', selftext: 'A photograph.' }]) {
    assert.equal(normalizePost(rawPost('new12', change), NOW), null, JSON.stringify(change));
  }
  assert.equal(normalizePost(rawPost('new12', { url: 'https://newmaker.itch.io/', preview: null }), NOW).projectUrl, null);
});
test('real ingestion auto-publishes clear showcases, keeps ambiguous pending and is idempotent', async () => {
  const env = fixtureEnv();
  const rows = [rawPost(), rawPost('maybe', { title: 'A puzzle game experiment', selftext: 'An interesting game.' })];
  const first = await ingest(env, deps(rows));
  assert.equal(first.status, 'ok'); assert.equal(first.updatedGames, 1); assert.equal(first.candidates, 1);
  const publicCatalog = await catalog(env.DB); assert.equal(publicCatalog.games.length, 1);
  assert.equal(publicCatalog.games[0].title, rows[0].title); assert.equal(publicCatalog.games[0].reviewStatus, 'source-described');
  assert.equal(publicCatalog.source.coverageThrough, new Date(NOW).toISOString());
  const second = await ingest(env, deps(rows)); assert.equal(second.updatedGames, 0); assert.equal(second.candidates, 0);
  assert.equal(env.DB.sql.prepare('SELECT count(*) AS n FROM source_posts').get().n, 2); env.DB.close();
});
test('only same author plus canonical project URL attaches; earlier-than-identity stays pending', async () => {
  const env = fixtureEnv(); await importCatalog(env.DB, fixtureCatalog());
  const rows = [rawPost('later', { author: 'MakerName', title: 'I updated my puzzle game', url: 'https://maker.itch.io/puzzle?utm_source=reddit' }),
    rawPost('other', { author: 'MakerName', url: 'https://maker.itch.io/other' }),
    rawPost('early', { author: 'MakerName', url: 'https://maker.itch.io/puzzle', created_utc: Date.parse('2026-10-08T00:00:00Z') / 1000 })];
  await ingest(env, deps(rows));
  const data = await catalog(env.DB), existing = data.games.find(game => game.id === 'g_abc12');
  assert.equal(existing.posts.length, 2); assert.ok(existing.posts.some(post => post.id === 'later'));
  assert.ok(data.games.some(game => game.id === 'g_other'));
  const pending = env.DB.sql.prepare("SELECT game_id,status FROM source_posts WHERE id='early'").get();
  assert.equal(pending.game_id, null); assert.equal(pending.status, 'pending');
  await importCatalog(env.DB, fixtureCatalog()); assert.equal((await catalog(env.DB)).games.find(game => game.id === 'g_abc12').posts.length, 2);
  env.DB.close();
});
test('removed source IDs cannot reimport under the same or another game', async () => {
  const env = fixtureEnv(); await importCatalog(env.DB, fixtureCatalog());
  await removal(env.DB, null, 'g_abc12', 'Creator requested removal.', new Date(NOW).toISOString());
  const imported = await importCatalog(env.DB, fixtureCatalog()); assert.equal(imported.importedGames, 0);
  await ingest(env, deps([rawPost('abc12')])); assert.equal((await catalog(env.DB)).games.length, 0);
  assert.equal(env.DB.sql.prepare('SELECT removed_by FROM removals').get().removed_by, 'operator'); env.DB.close();
});
test('three-page cap persists a frozen checkpoint and 300 candidates stay below 50 SQL statements', async () => {
  const env = fixtureEnv(); let calls = 0; const urls = [], pauses = [];
  const firstDeps = { now: () => NOW, sleep: async ms => { pauses.push(ms); }, fetch: async url => {
    urls.push(new URL(url)); const page = calls++;
    return Response.json({ data: Array.from({ length: 100 }, (_, i) => {
      const index = page * 100 + i;
      return rawPost((100000 + index).toString(36).padStart(5, '0'), {
        created_utc: NOW / 1000 - index - 10, url: `https://maker.itch.io/game-${index}`,
      });
    }) });
  } };
  const result = await ingest(env, firstDeps);
  assert.equal(result.status, 'partial'); assert.equal(result.fetched, 300); assert.equal(result.updatedGames, 300);
  const statements = env.DB.statementCount; assert.ok(statements < 50, `SQL statements: ${statements}`);
  assert.equal(statements, 18); assert.deepEqual(pauses, [600, 600]);
  const checkpoint = await meta(env.DB, 'ingestion'); assert.equal(checkpoint.coverageThrough, null); assert.equal(checkpoint.lastSuccessAt, null);
  assert.equal(checkpoint.targetCoverageThrough, new Date(NOW).toISOString());
  assert.ok(checkpoint.resumeBefore < NOW / 1000); assert.equal(calls, 3);
  assert.ok(urls.every(url => url.origin + url.pathname === ARCHIVE_URL && url.searchParams.get('subreddit') === 'aigamedev' && url.searchParams.get('limit') === '100'));
  let resumed;
  const next = await ingest(env, { now: () => NOW + 3600000, sleep: async () => {}, fetch: async url => { resumed = new URL(url); return Response.json({ data: [] }); } });
  assert.equal(next.status, 'ok'); assert.equal(Number(resumed.searchParams.get('before')), checkpoint.resumeBefore);
  assert.equal(Number(resumed.searchParams.get('after')), checkpoint.resumeAfter);
  const finished = await meta(env.DB, 'ingestion'); assert.equal(finished.coverageThrough, checkpoint.targetCoverageThrough);
  assert.equal(finished.resumeBefore, null); assert.equal(finished.lastSuccessAt, new Date(NOW + 3600000).toISOString()); env.DB.close();
});
test('lease prevents overlapping runs; retries are bounded and failure never invents freshness', async () => {
  const env = fixtureEnv(); let calls = 0, delays = 0;
  await assert.rejects(ingest(env, { now: () => NOW, sleep: async () => { delays++; }, fetch: async () => { calls++; return new Response('', { status: 429, headers: { 'Retry-After': '999' } }); } }));
  assert.equal(calls, 3); assert.equal(delays, 2);
  let state = await meta(env.DB, 'ingestion'); assert.equal(state.state, 'error'); assert.equal(state.coverageThrough, null); assert.equal(await meta(env.DB, 'catalog'), null);
  await acquire(env.DB, 'ingestion_lock', NOW);
  await assert.rejects(ingest(env, deps([])), error => error.code === 'SERVICE_UNAVAILABLE'); env.DB.close();
});
test('malformed archive envelope and nonadvancing full pages cannot advance coverage', async () => {
  const env = fixtureEnv();
  await assert.rejects(ingest(env, { now: () => NOW, sleep: async () => {}, fetch: async () => Response.json({ posts: [] }) }));
  let state = await meta(env.DB, 'ingestion'); assert.equal(state.state, 'error');
  const rows = Array.from({ length: 100 }, (_, i) => rawPost((200000 + i).toString(36).padStart(5, '0'), { created_utc: NOW / 1000 - 1 }));
  const result = await ingest(env, deps(rows)); assert.equal(result.status, 'partial');
  state = await meta(env.DB, 'ingestion'); assert.equal(state.coverageThrough, null); assert.equal(state.errorCode, 'CURSOR_STALLED'); env.DB.close();
});
test('taxonomy uses explicit current-game evidence and handles negative or historical release claims', () => {
  assert.deepEqual(classifySource('My puzzle game demo is out', 'Playable in the browser and on Windows.'), { category: 'puzzle', stage: 'playable', platforms: ['Browser', 'Windows'] });
  assert.equal(classifySource('I launched my shooter game').category, 'action');
  assert.equal(classifySource('I launched my shooter game').stage, 'released');
  assert.equal(classifySource('My RPG game is not released. The demo is coming soon.').stage, 'unknown');
  assert.equal(classifySource('My strategy game prototype for Android').stage, 'prototype');
  assert.deepEqual(classifySource('My strategy game prototype for Android').platforms, ['Android']);
  assert.equal(classifySource('My arcade game concept').stage, 'concept');
  assert.equal(classifySource('My simulation game is not for mobile').platforms.length, 0);
  assert.equal(classifySource('I released a Steam game in 2015. Eleven years later, AI helped me return to game development. My new demo is out.').stage, 'playable');
  assert.equal(classifySource('My puzzle strategy game').category, 'other');
  const tool = rawPost('1x2h1zh', { title: 'Text to building, running locally: one sentence gives a furnished building for your game. The free version is out' });
  assert.equal(normalizePost(tool, NOW), null);
});
test('archive previews prefer safe 640px resolutions and fall back to the source', () => {
  const raw = rawPost(); raw.preview.images[0].resolutions = [
    { width: 1920, url: 'https://preview.redd.it/large.png' }, { width: 320, url: 'https://preview.redd.it/small.png' },
    { width: 640, url: 'https://preview.redd.it/right.png?a=1&amp;b=2' }, { width: '640', url: 'https://evil.example/type.png' },
    null, { width: 640, url: 'javascript:alert(1)' }, { width: -1, url: 'https://evil.example/negative.png' },
  ];
  assert.equal(normalizePost(raw, NOW).preview.url, 'https://preview.redd.it/right.png?a=1&b=2');
  raw.preview.images[0].resolutions = [{ width: 640, url: 'javascript:alert(1)' }];
  assert.equal(normalizePost(raw, NOW).preview.url, 'https://preview.redd.it/game.png?x=1&y=2');
});
test('a pending-write failure cannot advance either public or status success watermarks', async () => {
  const env = fixtureEnv(); await ingest(env, deps([rawPost()]));
  const original = env.DB.prepare.bind(env.DB);
  env.DB.prepare = sql => {
    const statement = original(sql);
    if (sql.includes("SELECT json_extract(j.value,'$.post.id'),NULL")) statement.all = async () => { throw new Error('Injected pending persistence failure'); };
    return statement;
  };
  await assert.rejects(ingest(env, { ...deps([rawPost('later', { created_utc: NOW / 1000 + 100 })]), now: () => NOW + 3600000 }));
  env.DB.prepare = original;
  const state = await meta(env.DB, 'ingestion'), data = await catalog(env.DB);
  assert.equal(state.state, 'error'); assert.equal(state.coverageThrough, new Date(NOW).toISOString());
  assert.equal(state.lastSuccessAt, new Date(NOW).toISOString());
  assert.equal(data.source.coverageThrough, state.coverageThrough); assert.equal(data.source.lastSuccessfulIngestAt, state.lastSuccessAt);
  env.DB.close();
});
test('upstream failures retain safe internal diagnostics without response content or credentials', async () => {
  const fixtures = [
    ['ARCHIVE_HTTP_403', () => new Response('private upstream body', { status: 403 }), 1],
    ['ARCHIVE_HTTP_429', () => new Response('private upstream body', { status: 429 }), 3],
    ['ARCHIVE_HTTP_503', () => new Response('private upstream body', { status: 503 }), 3],
    ['ARCHIVE_INVALID_JSON', () => new Response('private upstream body'), 1],
    ['ARCHIVE_MALFORMED_ENVELOPE', () => Response.json({ unexpected: 'private upstream body' }), 1],
    ['ARCHIVE_TIMEOUT', () => { throw new DOMException('private timeout detail', 'TimeoutError'); }, 3],
    ['ARCHIVE_NETWORK_ERROR', () => { throw new TypeError('private network detail'); }, 3],
  ];
  for (const [expected, response, count] of fixtures) {
    const env = fixtureEnv(); let calls = 0;
    await assert.rejects(ingest(env, { now: () => NOW, sleep: async () => {}, fetch: async () => { calls++; return response(); } }), error => error.code === 'SERVICE_UNAVAILABLE');
    const stored = await meta(env.DB, 'ingestion');
    assert.equal(stored.errorCode, expected); assert.equal(calls, count);
    assert.equal(stored.coverageThrough, null); assert.equal(stored.lastSuccessAt, null);
    assert.equal(JSON.stringify(stored).includes('private'), false);
    env.DB.close();
  }
});
test('archive requests identify Playtrace truthfully and never forward credentials', async () => {
  const env = fixtureEnv(); let observed;
  await ingest(env, { now: () => NOW, sleep: async () => {}, fetch: async (url, options) => {
    observed = { url, options }; return Response.json({ data: [] });
  } });
  assert.equal(new URL(observed.url).origin + new URL(observed.url).pathname, ARCHIVE_URL);
  assert.deepEqual(observed.options.headers, { Accept: 'application/json', 'User-Agent': 'Playtrace/1.0 (+https://playtrace.neorgon.com)' });
  assert.equal(observed.options.redirect, 'error');
  env.DB.close();
});
