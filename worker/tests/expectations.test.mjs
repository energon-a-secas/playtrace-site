import test from 'node:test';
import assert from 'node:assert/strict';
import { fixtureEnv, fixtureCatalog, fixtureGame, request, NOW } from './helpers.mjs';
import { createWorker } from '../src/index.mjs';
import { importCatalog, query } from '../src/store.mjs';
import { feedbackPatterns } from '../src/feedback-patterns.mjs';
import { feedbackReport } from '../../js/feedback-patterns.js';
import { consolidateReposts } from '../src/duplicates.mjs';

async function setup(games=[fixtureGame()]){
  const env=fixtureEnv();await importCatalog(env.DB,fixtureCatalog(games));let now=NOW;
  const worker=createWorker({now:()=>now});
  async function call(method,body,key='bc',gameId='g_abc12'){
    const req=request(`/games/${gameId}/expectations`,{method,...(body?{body}:{})});if(key)req.headers.set('X-Feedback-Key',key.repeat(32));
    const response=await worker.fetch(req,env);return {status:response.status,cache:response.headers.get('Cache-Control'),body:await response.json()};
  }
  return {env,call,now:()=>now,advance:()=>now+=86400000};
}
test('guest comparisons pair only a previously saved first impression; later edits never rewrite its baseline',async()=>{
  const {env,call,advance,now}=await setup();
  assert.equal((await call('GET',null,null)).status,400);
  assert.equal((await call('PUT',{phase:'after-play',interest:4,expectation:'better',revision:0})).status,409);
  const first=await call('PUT',{phase:'first-look',interest:2,revision:0});assert.equal(first.status,200);assert.equal(first.cache,'no-store');
  assert.equal(first.body.entry.revision,1);
  assert.equal((await call('PUT',{phase:'first-look',interest:5,revision:0})).status,409);
  assert.equal((await call('PUT',{phase:'after-play',interest:4,expectation:'better',revision:1})).status,409);
  advance();
  assert.equal((await call('PUT',{phase:'after-play',interest:4,expectation:'better',revision:1},'de')).status,409);
  const after=await call('PUT',{phase:'after-play',interest:4,expectation:'better',revision:1});assert.equal(after.status,200);
  assert.equal(after.body.entry.firstAt,first.body.entry.firstAt);assert.equal(after.body.entry.firstInterest,2);
  assert.equal((await call('PUT',{phase:'first-look',interest:1,revision:2})).status,409);
  const report=await feedbackPatterns(env.DB,{now});const totals=feedbackReport(report.games,[{id:'g_abc12',category:'puzzle',distribution:'itch.io'}]).expectations;
  assert.equal(totals.started,1);assert.equal(totals.paired,1);assert.equal(totals.more,1);assert.equal(totals.before,2);assert.equal(totals.after,4);
  assert.equal(feedbackReport(report.games,[{id:'g_abc12'}],{source:'reddit'}).expectations.paired,0);
  assert.ok(!JSON.stringify(report).includes('guest_key_hash'));assert.ok(!JSON.stringify(report).includes('firstAt'));
  const updated=await call('PUT',{phase:'after-play',interest:3,expectation:'matched',revision:2});assert.equal(updated.body.entry.revision,3);
  assert.equal(updated.body.entry.playedAt,after.body.entry.playedAt);
  assert.equal((await call('GET')).body.entry.playedInterest,3);env.DB.close();
});
test('comparison validation, cohort bounds, deletion and project withdrawal keep aggregates honest',async()=>{
  const {env,call,advance,now}=await setup([fixtureGame(),fixtureGame('def34')]);
  for(const interest of [0,6,2.5,'3',null])assert.equal((await call('PUT',{phase:'first-look',interest,revision:0})).status,400);
  assert.equal((await call('PUT',{phase:'first-look',interest:3,revision:0,firstAt:'2020-01-01'})).status,400);
  await call('PUT',{phase:'first-look',interest:3,revision:0});await call('PUT',{phase:'first-look',interest:5,revision:0},'de');
  await call('PUT',{phase:'first-look',interest:2,revision:0},'bc','g_def34');advance();
  assert.equal((await call('PUT',{phase:'after-play',interest:4,expectation:'invented',revision:1})).status,400);
  await call('PUT',{phase:'after-play',interest:4,expectation:'unsure',revision:1});
  await call('DELETE');assert.equal((await call('GET')).body.entry,null);
  assert.ok((await call('GET',null,'bc','g_def34')).body.entry);
  const report=await feedbackPatterns(env.DB,{now});assert.equal(report.games.find(g=>g.id==='g_abc12').expectations.started,1);
  for(let i=0;i<61;i++)advance();assert.equal((await feedbackPatterns(env.DB,{now})).games.length,0);
  await query(env.DB,"UPDATE games SET status='hidden' WHERE id='g_def34'").run();assert.equal((await call('GET',null,'bc','g_def34')).status,404);env.DB.close();
});
test('repost consolidation keeps the complete comparison together and guest removal clears it',async()=>{
  const old=fixtureGame('old12'),newer=fixtureGame('new34');
  const title='I made this little puzzle game and wanted to share the finished first playable build with everyone';
  for(const game of [old,newer]){game.title=title;game.posts[0].title=title;}
  newer.posts[0].createdAt='2026-10-10T10:00:00.000Z';newer.firstSeenAt=newer.updatedAt=newer.posts[0].createdAt;
  const {env,call,advance,now}=await setup([old,newer]);
  await call('PUT',{phase:'first-look',interest:2,revision:0},'bc',old.id);advance();
  await call('PUT',{phase:'after-play',interest:5,expectation:'better',revision:1},'bc',old.id);
  await call('PUT',{phase:'first-look',interest:4,revision:0},'bc',newer.id);
  assert.equal((await consolidateReposts(env.DB,{now},true)).merged,1);
  const pair=(await call('GET',null,'bc',newer.id)).body.entry;assert.equal(pair.firstInterest,2);assert.equal(pair.playedInterest,5);
  await call('DELETE',null,'bc',newer.id);assert.equal(env.DB.sql.prepare('SELECT count(*) AS n FROM play_expectations').get().n,0);env.DB.close();
});
