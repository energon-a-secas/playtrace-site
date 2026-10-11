import test from 'node:test';
import assert from 'node:assert/strict';
import { reviewFlairs } from '../../scripts/review-source-flairs.mjs';
import { importCatalog, catalog } from '../src/store.mjs';
import { fixtureEnv, fixtureCatalog, fixtureGame, NOW } from './helpers.mjs';

test('revisiting existing posts removes excluded sources from public timelines while preserving stored contributions', async () => {
  const env=fixtureEnv(), cat=fixtureCatalog([fixtureGame(),fixtureGame('news1')]);
  cat.games[0].posts.push({...cat.games[0].posts[0],id:'older',url:'https://www.reddit.com/r/aigamedev/comments/older/',createdAt:'2026-10-08T10:00:00.000Z'});
  cat.games[0].firstSeenAt='2026-10-08T10:00:00.000Z';
  await importCatalog(env.DB,cat);
  env.DB.sql.exec("INSERT INTO follows VALUES('visitor','g_news1','2026-10-10T12:00:00.000Z')");
  const raw=[{id:'abc12',link_flair_text:'Demo | Project | Workflow'},{id:'news1',link_flair_text:'News'},{id:'older',link_flair_text:'Discussion'}];
  const review=reviewFlairs(cat,raw,new Date(NOW).toISOString());
  for(let i=0;i<2;i++)env.DB.sql.exec(review.sql);
  const visible=await catalog(env.DB);
  assert.equal(visible.games.length,1);assert.equal(visible.games[0].posts.length,1);
  assert.equal(visible.games[0].firstSeenAt,visible.games[0].updatedAt);
  assert.equal(env.DB.sql.prepare("SELECT status FROM games WHERE id='g_news1'").get().status,'hidden');
  assert.equal(env.DB.sql.prepare('SELECT count(*) n FROM follows').get().n,1);
  assert.throws(()=>reviewFlairs(cat,raw.slice(1),new Date(NOW).toISOString()),/Every current/);
  env.DB.close();
});
