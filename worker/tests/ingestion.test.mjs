import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizePost } from '../src/archive.mjs';
import { classifySource } from '../src/taxonomy.mjs';
import { ingest, ARCHIVE_URL, COMMUNITY_CREATED_AT } from '../src/ingestion.mjs';
import { catalog, importCatalog, meta, removal } from '../src/store.mjs';
import { acquire } from '../src/lease.mjs';
import { NOW, fixtureEnv, fixtureCatalog, rawPost, fixtureWorker, request } from './helpers.mjs';

const deps = data => ({ now: () => NOW, sleep: async () => {}, fetch: async () => Response.json({ data }) });
test('unlabeled showcases wait for individual review even when their URL matches an existing game', async () => {
  const env = fixtureEnv();
  await ingest(env, deps([rawPost('keep1')]));
  await ingest(env, deps([rawPost('later',{link_flair_text:null})]), true);
  assert.equal((await catalog(env.DB)).games[0].posts.length, 1);
  const pending = env.DB.sql.prepare("SELECT payload_json,status FROM source_posts WHERE id='later'").get();
  assert.equal(pending.status,'pending'); assert.equal(JSON.parse(pending.payload_json).post.flair,null);
  for (const flair of ['News','Discussion','Media']) assert.equal(normalizePost(rawPost('bad12',{link_flair_text:flair}), NOW, {reviewUnlabeled:true}),null);
  env.DB.close();
});
test('archive timeout-shaped 422 retries within bounds, but query-validation 422 does not retry', async () => {
  for (const error of ['Timeout. Maybe slow down a bit','Invalid query']) {
    const env=fixtureEnv(); let count=0; const waits=[], limits=[];
    const task=ingest(env,{now:()=>NOW,sleep:async ms=>waits.push(ms),fetch:async url=>{limits.push(new URL(url).searchParams.get('limit'));count++;return count===1?Response.json({data:null,error},{status:422,headers:{'X-RateLimit-Reset':'60','X-RateLimit-Remaining':'499'}}):Response.json({data:[]});}});
    if(error.startsWith('Timeout.')) { assert.equal((await task).status,'ok');assert.equal(count,2);assert.deepEqual(waits,[4000]);assert.deepEqual(limits,['auto','auto']); }
    else { await assert.rejects(task);assert.equal(count,1);assert.deepEqual(waits,[]); }
    env.DB.close();
  }
});
test('adaptive timeout recovery keeps recent cursors on the retained page without skipping older rows', async () => {
  const env=fixtureEnv(), urls=[];
  const rows=Array.from({length:1000},(_,i)=>rawPost((900000+i).toString(36).padStart(5,'0'),{
    created_utc:NOW/1000-i-10,url:`https://maker.itch.io/recovery-${i}`,
  }));
  const result=await ingest(env,{now:()=>NOW,sleep:async()=>{},fetch:async value=>{
    const url=new URL(value);urls.push(url);
    if(urls.length===1) return Response.json({error:'Timeout. Maybe slow down a bit'},{status:422});
    const limit=url.searchParams.get('limit')==='auto'?1000:100;
    return Response.json({data:rows.filter(row=>row.created_utc<Number(url.searchParams.get('before'))).slice(0,limit)});
  }});
  assert.equal(result.status,'partial');
  assert.equal(urls[1].searchParams.get('limit'),'auto');
  assert.equal(Number(urls[2].searchParams.get('before')),rows[99].created_utc+1);
  const imported=(await catalog(env.DB)).games;
  assert.ok(imported.some(game=>game.id===`g_${rows[297].id}`));
  assert.ok(!imported.some(game=>game.id===`g_${rows[298].id}`));
  const checkpoint=await meta(env.DB,'ingestion');
  assert.equal(checkpoint.resumeBefore,rows[297].created_utc+1);
  assert.equal(checkpoint.coverageThrough,null);
  env.DB.close();
});
test('a persisted archive rate limit prevents operator or cron retries before the requested reset', async () => {
  const env=fixtureEnv();let calls=0,now=NOW;
  const limited={now:()=>now,sleep:async()=>{},fetch:async()=>{calls++;return Response.json({error:'Slow down'},{status:429,headers:{'Retry-After':'90'}});}};
  await assert.rejects(ingest(env,limited,true),error=>error.retryAfterSeconds===90);
  assert.equal((await meta(env.DB,'history')).retryAt,new Date(NOW+90000).toISOString());
  now+=30000;await assert.rejects(ingest(env,limited,true),error=>error.retryAfterSeconds===60);assert.equal(calls,1);
  now=NOW+91000;assert.equal((await ingest(env,{...limited,fetch:async()=>{calls++;return Response.json({data:[]});}},true)).status,'ok');assert.equal(calls,2);env.DB.close();
});
test('only the exact project flair is automatically published, through recent or historical ingestion', async () => {
  for (const flair of ['News','Discussion','Questions & Help','Tools or Resource','Workflow Not Included','Research','Commercial Self Promotion','Media','Workflow',null,undefined]) {
    assert.equal(normalizePost(rawPost('new12', { link_flair_text: flair }), NOW), null);
  }
  for (const historical of [false,true]) {
    const env = fixtureEnv();
    const rows = [rawPost('keep1'),rawPost('news1',{link_flair_text:'News'}),rawPost('promo',{link_flair_text:'Commercial Self Promotion'})];
    await ingest(env,deps(rows),historical);
    assert.deepEqual((await catalog(env.DB)).games.map(game=>game.id),['g_keep1']);
    const invalid = fixtureCatalog(); delete invalid.games[0].posts[0].flair;
    await assert.rejects(importCatalog(env.DB,invalid),/Sources need/);
    env.DB.close();
  }
});
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
  const rows = [rawPost(), rawPost('maybe', { title: 'A puzzle game experiment', selftext: 'An interesting game.', url: 'https://newmaker.itch.io/another' })];
  const first = await ingest(env, deps(rows));
  assert.equal(first.status, 'ok'); assert.equal(first.updatedGames, 1); assert.equal(first.candidates, 1);
  const publicCatalog = await catalog(env.DB); assert.equal(publicCatalog.games.length, 1);
  assert.equal(publicCatalog.games[0].title, rows[0].title); assert.equal(publicCatalog.games[0].reviewStatus, 'source-described');
  assert.equal(publicCatalog.source.coverageThrough, new Date(NOW).toISOString());
  const second = await ingest(env, deps(rows)); assert.equal(second.updatedGames, 0); assert.equal(second.candidates, 0);
  assert.equal(env.DB.sql.prepare('SELECT count(*) AS n FROM source_posts').get().n, 2); env.DB.close();
});
test('earlier matching sources extend history without changing project identity or private associations', async () => {
  const env = fixtureEnv(); await importCatalog(env.DB, fixtureCatalog());
  env.DB.sql.exec("INSERT INTO follows VALUES('member','g_abc12','2026-10-10T12:00:00.000Z'); INSERT INTO price_signals VALUES('member','g_abc12',1200,'USD','2026-10-10T12:00:00.000Z')");
  const rows = [rawPost('later', { author: 'MakerName', title: 'I updated my puzzle game', url: 'https://maker.itch.io/puzzle?utm_source=reddit' }),
    rawPost('other', { author: 'MakerName', url: 'https://maker.itch.io/other' }),
    rawPost('early', { author: 'MakerName', url: 'https://maker.itch.io/puzzle', created_utc: Date.parse('2026-10-08T00:00:00Z') / 1000 })];
  await ingest(env, deps(rows));
  const data = await catalog(env.DB), existing = data.games.find(game => game.id === 'g_abc12');
  assert.equal(existing.posts.length, 3); assert.ok(existing.posts.some(post => post.id === 'later'));
  assert.equal(existing.firstSeenAt, '2026-10-08T00:00:00.000Z');
  assert.ok(data.games.some(game => game.id === 'g_other'));
  const attached = env.DB.sql.prepare("SELECT game_id,status FROM source_posts WHERE id='early'").get();
  assert.equal(attached.game_id, 'g_abc12'); assert.equal(attached.status, 'published');
  assert.equal(env.DB.sql.prepare('SELECT game_id FROM follows').get().game_id, 'g_abc12');
  assert.equal(env.DB.sql.prepare('SELECT amount_cents FROM price_signals').get().amount_cents, 1200);
  await importCatalog(env.DB, fixtureCatalog()); assert.equal((await catalog(env.DB)).games.find(game => game.id === 'g_abc12').posts.length, 3);
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
  assert.ok(urls.every(url => url.origin + url.pathname === ARCHIVE_URL && url.searchParams.get('subreddit') === 'aigamedev' && url.searchParams.get('limit') === 'auto'));
  let resumed;
  const next = await ingest(env, { now: () => NOW + 3600000, sleep: async () => {}, fetch: async url => { resumed = new URL(url); return Response.json({ data: [] }); } });
  assert.equal(next.status, 'ok'); assert.equal(Number(resumed.searchParams.get('before')), checkpoint.resumeBefore);
  assert.equal(Number(resumed.searchParams.get('after')), checkpoint.resumeAfter);
  const finished = await meta(env.DB, 'ingestion'); assert.equal(finished.coverageThrough, checkpoint.targetCoverageThrough);
  assert.equal(finished.resumeBefore, null); assert.equal(finished.lastSuccessAt, new Date(NOW + 3600000).toISOString()); env.DB.close();
});
test('lease prevents overlapping runs; retries are bounded and failure never invents freshness', async () => {
  const env = fixtureEnv(); let calls = 0, delays = 0;
  await assert.rejects(ingest(env, { now: () => NOW, sleep: async () => { delays++; }, fetch: async () => { calls++; return new Response('', { status: 429, headers: { 'Retry-After': '1' } }); } }));
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
  assert.equal(observed.options.redirect, 'manual');
  env.DB.close();
});
test('archive manual redirects reject 3xx without fetching the target or advancing coverage', async () => {
  for (const status of [301, 302, 303, 307, 308]) {
    const env = fixtureEnv(), calls = [];
    await assert.rejects(ingest(env, { now: () => NOW, sleep: async () => {}, fetch: async (url, options) => {
      calls.push({ url, options });
      return Response.json({ data: [rawPost()] }, { status, headers: { Location: 'https://attacker.example/archive' } });
    } }), error => error.code === 'SERVICE_UNAVAILABLE');
    assert.equal(calls.length, 1); assert.equal(new URL(calls[0].url).origin + new URL(calls[0].url).pathname, ARCHIVE_URL);
    assert.equal(calls[0].options.redirect, 'manual');
    const run = await meta(env.DB, 'ingestion');
    assert.equal(run.errorCode, `ARCHIVE_HTTP_${status}`); assert.equal(run.fetched, 0);
    assert.equal(run.coverageThrough, null); assert.equal(run.lastSuccessAt, null); assert.equal(await meta(env.DB, 'catalog'), null);
    env.DB.close();
  }
});
test('archive retry delays honor relative reset seconds, absolute milliseconds and Retry-After', async () => {
  const fixtures = [
    [{ 'X-RateLimit-Reset': '2' }, 2000],
    [{ 'X-RateLimit-Reset-At': String(NOW + 3000) }, 3000],
    [{ 'Retry-After': '4' }, 4000],
    [{ 'Retry-After': new Date(NOW + 4000).toUTCString() }, 4000],
    [{ 'X-RateLimit-Reset': '2', 'X-RateLimit-Reset-At': String(NOW + 4000), 'Retry-After': '3' }, 4000],
  ];
  for (const [headers, expected] of fixtures) {
    const env = fixtureEnv(), pauses = []; let calls = 0, now = NOW;
    const result = await ingest(env, { now: () => now, sleep: async ms => { pauses.push(ms); now += ms; }, fetch: async () => {
      calls++; return calls === 1 ? new Response('', { status: 429, headers }) : Response.json({ data: [] });
    } });
    assert.equal(result.status, 'ok'); assert.equal(calls, 2); assert.deepEqual(pauses, [expected]); env.DB.close();
  }
});
test('archive advertised waits beyond the budget preserve a checkpoint without an early retry', async () => {
  const fixtures = [
    { 'X-RateLimit-Reset': '15' }, { 'X-RateLimit-Reset-At': String(NOW + 15000) },
    { 'Retry-After': '999' }, { 'Retry-After': new Date(NOW + 15000).toUTCString() },
    { 'X-RateLimit-Reset': '15', 'X-RateLimit-Reset-At': String(NOW - 1000) },
    { 'X-RateLimit-Reset': '9'.repeat(500) },
  ];
  for (const headers of fixtures) {
    const env = fixtureEnv(), pauses = []; let calls = 0;
    await assert.rejects(ingest(env, { now: () => NOW, sleep: async ms => { pauses.push(ms); }, fetch: async () => {
      calls++; return new Response('', { status: 429, headers });
    } }), error => error.code === 'SERVICE_UNAVAILABLE');
    assert.equal(calls, 1); assert.deepEqual(pauses, []);
    const run = await meta(env.DB, 'ingestion');
    assert.equal(run.errorCode, 'ARCHIVE_HTTP_429'); assert.equal(run.state, 'error');
    assert.equal(run.resumeBefore, NOW / 1000); assert.equal(run.targetCoverageThrough, new Date(NOW).toISOString());
    assert.equal(run.coverageThrough, null); assert.equal(run.lastSuccessAt, null); env.DB.close();
  }
});
test('an archive long reset after a page saves partial progress and safely resumes the frozen window', async () => {
  const env = fixtureEnv(), pauses = []; let calls = 0;
  const rows = Array.from({ length: 100 }, (_, i) => rawPost((600000 + i).toString(36).padStart(5, '0'), { created_utc: NOW / 1000 - i - 10 }));
  const result = await ingest(env, { now: () => NOW, sleep: async ms => { pauses.push(ms); }, fetch: async () => {
    calls++; return calls === 1 ? Response.json({ data: rows }) : new Response('', { status: 429, headers: { 'X-RateLimit-Reset': '15' } });
  } });
  assert.equal(result.status, 'partial'); assert.equal(result.fetched, 100); assert.equal(calls, 2); assert.deepEqual(pauses, [600]);
  const checkpoint = await meta(env.DB, 'ingestion');
  assert.equal(checkpoint.resumeBefore, rows.at(-1).created_utc + 1); assert.equal(checkpoint.lastSuccessAt, null);
  assert.equal(checkpoint.errorCode, 'ARCHIVE_HTTP_429'); assert.equal((await catalog(env.DB)).source.coverageThrough, null);
  let resumed;
  const next = await ingest(env, { now: () => NOW + 60000, sleep: async () => {}, fetch: async url => {
    resumed = new URL(url); return Response.json({ data: [] });
  } });
  assert.equal(next.status, 'ok'); assert.equal(Number(resumed.searchParams.get('before')), checkpoint.resumeBefore);
  assert.equal(Number(resumed.searchParams.get('after')), checkpoint.resumeAfter);
  assert.equal((await meta(env.DB, 'ingestion')).coverageThrough, checkpoint.targetCoverageThrough); env.DB.close();
});

test('historical collection starts at group creation, scans forward, resumes and preserves recent coverage', async () => {
  const env = fixtureEnv(); await ingest(env, deps([rawPost()]));
  const recent = await meta(env.DB, 'ingestion'), urls = [];
  const creation = Date.parse(COMMUNITY_CREATED_AT) / 1000;
  let calls = 0;
  const first = await ingest(env, { ...deps([]), fetch: async url => {
    urls.push(new URL(url)); const page = calls++;
    return Response.json({ data: Array.from({ length: 1000 }, (_, i) => rawPost((700000 + page * 1000 + i).toString(36).padStart(5, '0'), {
      created_utc: creation + page * 1000 + i * 2,
      url: `https://maker.itch.io/history-${page}-${i}`,
    })) });
  } }, true);
  assert.equal(first.status, 'partial'); assert.equal(first.updatedGames, 1000); assert.equal(calls,1);
  assert.equal(urls[0].searchParams.get('limit'), 'auto');
  assert.equal(urls[0].searchParams.get('sort'), 'asc');
  assert.equal(Number(urls[0].searchParams.get('after')), creation - 1);
  const history = await meta(env.DB, 'history');
  assert.equal(history.scannedThrough, new Date((creation + 1998) * 1000).toISOString());
  assert.equal(history.resumeAfter, creation + 1997); assert.equal(history.resumeBefore, NOW / 1000);
  assert.deepEqual(await meta(env.DB, 'ingestion'), recent);
  assert.equal((await catalog(env.DB)).source.coverageThrough, recent.coverageThrough);
  let resume;
  await ingest(env, { now: () => NOW + 3600000, sleep: async () => {}, fetch: async url => { resume = new URL(url); return Response.json({ data: [] }); } }, true);
  assert.equal(Number(resume.searchParams.get('after')), history.resumeAfter);
  assert.equal(Number(resume.searchParams.get('before')), history.resumeBefore);
  const complete = await meta(env.DB, 'history');
  assert.equal(complete.state, 'ok'); assert.equal(complete.coverageThrough, new Date(NOW).toISOString());
  assert.equal(complete.scannedThrough, complete.coverageThrough);
  const again = await ingest(env, { ...deps([]), fetch: () => { throw new Error('Completed backfill fetched again'); } }, true);
  assert.equal(again.fetched, 0);
  const status = await (await fixtureWorker().fetch(request('/status'), env)).json();
  assert.equal(status.history.completedThrough, complete.coverageThrough);
  assert.equal(status.history.communityCreatedAt, COMMUNITY_CREATED_AT); env.DB.close();
});

test('historical archive failure keeps its checkpoint and never invents scanned dates', async () => {
  const env = fixtureEnv(); await importCatalog(env.DB, fixtureCatalog());
  const baseline = await meta(env.DB, 'catalog');
  await assert.rejects(ingest(env, { ...deps([]), fetch: async () => new Response('', { status: 429, headers: { 'Retry-After': '999' } }) }, true));
  const history = await meta(env.DB, 'history');
  assert.equal(history.state, 'error'); assert.equal(history.scannedThrough, null);
  assert.equal(history.resumeAfter, Date.parse(COMMUNITY_CREATED_AT) / 1000 - 1);
  assert.deepEqual(await meta(env.DB, 'catalog'), baseline);
  assert.equal(await meta(env.DB, 'ingestion'), null); env.DB.close();
});

test('scheduled partial recent scans defer history rather than retrying a throttled archive', async () => {
  const env = fixtureEnv(); let calls = 0;
  const rows = Array.from({ length: 100 }, (_, i) => rawPost((800000 + i).toString(36).padStart(5, '0'), { created_utc: NOW / 1000 - i - 10 }));
  const worker = fixtureWorker(async () => ++calls === 1 ? Response.json({ data: rows }) : new Response('', { status: 429, headers: { 'Retry-After': '999' } }));
  await worker.scheduled({}, env);
  assert.equal(calls, 2); assert.equal((await meta(env.DB, 'ingestion')).state, 'partial');
  assert.equal(await meta(env.DB, 'history'), null); env.DB.close();
});
