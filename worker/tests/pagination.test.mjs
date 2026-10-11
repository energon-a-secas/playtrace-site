import test from 'node:test';
import assert from 'node:assert/strict';
import { catalog, importCatalog } from '../src/store.mjs';
import { ingest } from '../src/ingestion.mjs';
import { fixtureEnv, fixtureCatalog, fixtureGame, fixtureWorker, request, NOW, rawPost } from './helpers.mjs';

test('catalogue pages cross 2000 projects, preserve tied-date order and exclude removals', async () => {
  const env = fixtureEnv(), worker = fixtureWorker();
  const games = Array.from({ length: 2010 }, (_, i) => fixtureGame((100000 + i).toString(36).padStart(5, '0')));
  await importCatalog(env.DB, fixtureCatalog(games.slice(0, 1500)));
  await importCatalog(env.DB, fixtureCatalog(games.slice(1500)));
  env.DB.sql.prepare('INSERT INTO removals VALUES(?,?,?,?,?)').run(games[100].id, '[]', 'Removed fixture', new Date(NOW).toISOString(), 'operator');
  const ids = []; let cursor = '', calls = 0;
  do {
    const response = await worker.fetch(request(`/catalog?pageSize=200${cursor ? `&cursor=${cursor}` : ''}`), env);
    assert.equal(response.status, 200);
    const page = await response.json(); calls++;
    assert.ok(page.games.length <= 200); assert.equal(page.pagination.total, 2009);
    ids.push(...page.games.map(game => game.id)); cursor = page.pagination.nextCursor;
  } while (cursor);
  assert.equal(calls, 11); assert.equal(ids.length, 2009); assert.equal(new Set(ids).size, 2009);
  assert.deepEqual(ids, [...ids].sort()); assert.equal(ids.includes(games[100].id), false);
  // Collection growth is independent of both the old public cap and author count.
  const result = await ingest(env, { now: () => NOW, sleep: async () => {}, fetch: async () => Response.json({ data: [rawPost('extra')] }) });
  assert.equal(result.updatedGames, 1);
  const newest = await catalog(env.DB, { limit: 1 }); assert.equal(newest.games[0].id, 'g_extra');
  for (const path of ['/catalog?pageSize=201', '/catalog?pageSize=-1', '/catalog?pageSize=1.5', '/catalog?cursor=bad']) {
    assert.equal((await worker.fetch(request(path), env)).status, 400);
  }
  env.DB.close();
});
test('catalogue total stays transactional across status, tombstone, reimport and deletion changes',async()=>{
  const env=fixtureEnv(),db=env.DB;await importCatalog(db,fixtureCatalog([fixtureGame('first'),fixtureGame('other')]));
  const total=async()=> (await catalog(db,{limit:1})).pagination.total;
  assert.equal(await total(),2);
  db.sql.exec("UPDATE games SET status='hidden' WHERE id='g_first'");assert.equal(await total(),1);
  db.sql.exec("UPDATE games SET status='published' WHERE id='g_first'");assert.equal(await total(),2);
  db.sql.prepare('INSERT INTO removals VALUES(?,?,?,?,?)').run('g_first','["first"]','Removed',new Date(NOW).toISOString(),'operator');
  assert.equal(await total(),1);
  db.sql.exec("UPDATE games SET status='removed' WHERE id='g_first'; DELETE FROM games WHERE id='g_first'");assert.equal(await total(),1);
  await importCatalog(db,fixtureCatalog([fixtureGame('first'),fixtureGame('other')]));assert.equal(await total(),1);
  db.sql.exec("DELETE FROM games WHERE id='g_other'");assert.equal(await total(),0);db.close();
});
