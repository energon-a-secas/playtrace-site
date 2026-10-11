import test from 'node:test';
import assert from 'node:assert/strict';
import { fixtureEnv, fixtureWorker, fixtureCatalog, fixtureGame, request, token, NOW } from './helpers.mjs';
import { catalog, importCatalog, removal } from '../src/store.mjs';
import { detailsOf } from '../src/details.mjs';
import { gameStore } from '../src/steam.mjs';

const envFor = () => fixtureEnv(undefined, { CLERK_SECRET_KEY: `sk_test_${'a'.repeat(40)}` });
const worker = fixtureWorker(async () => Response.json({ id: 'user_a', primary_email_address_id: 'email_1',
  email_addresses: [{ id: 'email_1', email_address: 'luciano.adonis.villarroel@gmail.com', verification: { status: 'verified' } }] }));
const edit = (env, jwt, details, revision=0, mode='edit') => worker.fetch(request('/admin/games/g_abc12/details',
  { method: 'PUT', auth: jwt, body: { mode, revision, ...(mode === 'edit' ? { details } : {}) } }), env);

test('verified admins edit public details without changing source identity, dates or ingestion matching', async () => {
  const env = envFor(), seed = fixtureCatalog(); await importCatalog(env.DB, seed); const jwt = await token();
  const details = { ...detailsOf(seed.games[0]), title: 'Puzzle Grove', summary: 'Explore a changing puzzle garden.',
    projectUrl: 'https://newmaker.itch.io/puzzle-grove', category: 'adventure', stage: 'playable', platforms: ['Browser'], tags: ['Exploration'] };
  assert.equal((await edit(env, undefined, details)).status, 401);
  const response = await edit(env, jwt, details); assert.equal(response.status, 200);
  const record = await response.json(); assert.deepEqual(detailsOf(record.game), details); assert.equal(record.detailsRevision, 1);
  assert.deepEqual(record.sourceDetails, detailsOf(seed.games[0]));
  const visible = (await catalog(env.DB)).games[0]; assert.deepEqual(detailsOf(visible), details);
  assert.deepEqual(visible.posts, seed.games[0].posts); assert.deepEqual(visible.author, seed.games[0].author);
  assert.equal(visible.firstSeenAt, seed.games[0].firstSeenAt);
  assert.equal(env.DB.sql.prepare('SELECT project_url FROM games').get().project_url, 'https://maker.itch.io/puzzle');
  await importCatalog(env.DB, seed); assert.deepEqual(detailsOf((await catalog(env.DB)).games[0]), details);
  env.DB.close();
});
test('concurrent edits and reset reject stale revisions; reset follows the latest imported details', async () => {
  const env = envFor(), seed = fixtureCatalog(); await importCatalog(env.DB, seed); const jwt = await token();
  const details = { ...detailsOf(seed.games[0]), title: 'A custom title' };
  const responses = await Promise.all([edit(env, jwt, details), edit(env, jwt, { ...details, title: 'Another title' })]);
  assert.deepEqual(responses.map(r => r.status).sort(), [200,409]);
  seed.games[0].summary = 'The source now includes a public demo.'; await importCatalog(env.DB, seed);
  assert.equal((await edit(env, jwt, null, 0, 'reset')).status, 409);
  const reset = await edit(env, jwt, null, 1, 'reset'); assert.equal(reset.status, 200);
  const record = await reset.json(); assert.equal(record.detailsOverride, null); assert.equal(record.detailsRevision, 2);
  assert.deepEqual(detailsOf(record.game), detailsOf(seed.games[0]));
  assert.equal((await edit(env, jwt, details, 1)).status, 409);
  env.DB.close();
});
test('detail edits reject unknown fields, forged attribution, unsafe links and invalid values atomically', async () => {
  const env = envFor(); await importCatalog(env.DB, fixtureCatalog()); const jwt = await token();
  const details = detailsOf(fixtureGame());
  for (const change of [{author:{name:'OtherMaker'}},{posts:[]},{title:' '},{title:'x'.repeat(161)},
    {summary:''},{projectUrl:'javascript:alert(1)'},{projectUrl:'http://example.com'}, {projectUrl:'https://user:secret@example.com'},
    {stage:'launched'},{category:'news'},{tags:['tag',' tag ']},{platforms:Array(9).fill('Windows')}, {tags:['x'.repeat(41)]}]) {
    assert.equal((await edit(env, jwt, {...details,...change})).status, 400, JSON.stringify(change));
  }
  assert.equal(env.DB.sql.prepare('SELECT count(*) n FROM project_overrides').get().n, 0);
  env.DB.close();
});
test('changing or clearing the project URL also changes Steam metadata; removal erases overrides', async () => {
  const env = envFor(); await importCatalog(env.DB, fixtureCatalog()); const jwt = await token();
  const steam = {appId:'620',title:'Portal 2',url:'https://store.steampowered.com/app/620/',headerUrl:null,state:'released',priceCents:999,currency:'USD',checkedAt:new Date(NOW).toISOString()};
  env.DB.sql.prepare('INSERT INTO steam_cache VALUES(?,?,?,?)').run('620', JSON.stringify(steam), new Date(NOW).toISOString(), NOW+60000);
  const details = {...detailsOf(fixtureGame()),projectUrl:steam.url};
  assert.equal((await edit(env,jwt,details)).status,200);
  assert.equal((await catalog(env.DB)).games[0].steam.appId,'620');
  assert.equal((await gameStore(env.DB,'g_abc12',{now:()=>NOW})).steam.appId,'620');
  assert.equal((await edit(env,jwt,{...details,projectUrl:null},1)).status,200);
  assert.equal((await catalog(env.DB)).games[0].steam,undefined);
  assert.equal((await gameStore(env.DB,'g_abc12',{now:()=>NOW})).steam,null);
  await removal(env.DB,null,'g_abc12','Creator request',new Date(NOW).toISOString());
  assert.equal(env.DB.sql.prepare('SELECT count(*) n FROM project_overrides').get().n,0);
  assert.equal((await edit(env,jwt,details,2)).status,404); env.DB.close();
});
