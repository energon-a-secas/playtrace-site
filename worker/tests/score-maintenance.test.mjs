import test from 'node:test';
import assert from 'node:assert/strict';
import { fixtureEnv, fixtureGame, fixtureCatalog, rawPost, NOW } from './helpers.mjs';
import { importCatalog, meta, putMeta } from '../src/store.mjs';
import { refreshWeeklyScores, scorePolicy } from '../src/score-maintenance.mjs';
import { scoreObservation, saveScoreObservations } from '../src/reddit-scores.mjs';
import { createWorker } from '../src/index.mjs';

const sunday=NOW+86400000;
test('Sunday scores include only recent published posts, preserve old observations and stop on duplicate delivery',async()=>{
  const env=fixtureEnv(),game=fixtureGame(),old=fixtureGame('old12');
  old.firstSeenAt=old.updatedAt=old.posts[0].createdAt='2026-08-01T00:00:00.000Z';
  await importCatalog(env.DB,fixtureCatalog([game,old]));
  await saveScoreObservations(env.DB,[scoreObservation(rawPost('old12',{score:50}),NOW)]).run();
  let calls=0;const deps={now:()=>sunday,sleep:async()=>{},fetch:async url=>{
    calls++;assert.equal(new URL(url).searchParams.get('ids'),'abc12');
    return Response.json({data:[rawPost('abc12',{author:'MakerName',score:9,retrieved_on:sunday/1000})]});
  }};
  assert.equal((await refreshWeeklyScores(env.DB,{...deps,now:()=>NOW})).skipped,true);
  assert.equal((await refreshWeeklyScores(env.DB,deps)).updated,1);
  assert.equal((await refreshWeeklyScores(env.DB,deps)).updated,0);assert.equal(calls,1);
  assert.equal(env.DB.sql.prepare("SELECT score FROM reddit_scores WHERE post_id='old12'").get().score,50);
  assert.equal((await meta(env.DB,'weekly_scores')).status,'complete');env.DB.close();
});
test('eight actual requests cover at most 800 posts, including interrupted or repeated weekly execution',async()=>{
  const env=fixtureEnv();await importCatalog(env.DB,fixtureCatalog(Array.from({length:805},(_,i)=>fixtureGame('p'+String(i).padStart(5,'0')))));
  let calls=0;const deps={now:()=>sunday,sleep:async()=>{},fetch:async url=>{
    calls++;const ids=new URL(url).searchParams.get('ids').split(',');assert.ok(ids.length<=100);
    return Response.json({data:ids.map(id=>rawPost(id,{author:'MakerName',score:0,retrieved_on:sunday/1000}))});
  }};
  env.DB.statementCount=0;
  const worker=createWorker(deps);await worker.scheduled({cron:'50 * * * *',scheduledTime:sunday},env);
  assert.equal(calls,scorePolicy.maxRequests);assert.ok(env.DB.statementCount<50,`${env.DB.statementCount} D1 statements`);
  assert.equal((await meta(env.DB,'weekly_scores')).checked,800);
  await worker.scheduled({cron:'50 * * * *',scheduledTime:sunday},env);assert.equal(calls,8);env.DB.close();
});
test('archive throttling and missing or mismatched records do not erase a good score or hot-loop',async()=>{
  const env=fixtureEnv();await importCatalog(env.DB,fixtureCatalog());
  await saveScoreObservations(env.DB,[scoreObservation(rawPost('abc12',{score:15}),NOW)]).run();
  let calls=0;const deps={now:()=>sunday,sleep:async()=>{},fetch:async()=>{calls++;return new Response(null,{status:429,headers:{'Retry-After':'3600'}});}};
  await refreshWeeklyScores(env.DB,deps);await refreshWeeklyScores(env.DB,deps);assert.equal(calls,1);
  assert.equal((await meta(env.DB,'editorial_cooldown')).archive,sunday+3600000);
  assert.equal(env.DB.sql.prepare('SELECT score FROM reddit_scores').get().score,15);
  await putMeta(env.DB,'editorial_cooldown',{}).run();
  const next={...deps,now:()=>sunday+7*86400000,fetch:async()=>Response.json({data:[rawPost('abc12',{author:'AnotherMaker',score:999})]})};
  await refreshWeeklyScores(env.DB,next);assert.equal(env.DB.sql.prepare('SELECT score FROM reddit_scores').get().score,15);
  env.DB.close();
});
test('an archive 422 is a single budgeted request, with no hidden retry',async()=>{
  const env=fixtureEnv();await importCatalog(env.DB,fixtureCatalog());let calls=0;
  await refreshWeeklyScores(env.DB,{now:()=>sunday,sleep:async()=>{},fetch:async()=>{calls++;return Response.json({error:'Timeout. Maybe slow down a bit'},{status:422});}});
  assert.equal(calls,1);assert.equal((await meta(env.DB,'weekly_scores')).attempts,1);env.DB.close();
});
