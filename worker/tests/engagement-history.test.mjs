import test from 'node:test';
import assert from 'node:assert/strict';
import { fixtureEnv, fixtureCatalog, fixtureGame, rawPost, NOW } from './helpers.mjs';
import { importCatalog, meta } from '../src/store.mjs';
import { scoreObservation, saveScoreObservations } from '../src/reddit-scores.mjs';
import { refreshWeeklyScores, scoreMaintenanceStatus } from '../src/score-maintenance.mjs';
import { redditConfigured } from '../src/reddit-access.mjs';

const sunday=NOW+86400000,config={REDDIT_API_APPROVED:'true',REDDIT_CLIENT_ID:'fixture-client',REDDIT_CLIENT_SECRET:'fixture-secret',REDDIT_USER_AGENT:'playtrace-test/1.0'};
test('re-reading an archive does not manufacture later score or comment observations',async()=>{
  const env=fixtureEnv();await importCatalog(env.DB,fixtureCatalog());
  const raw=rawPost('abc12',{author:'MakerName',score:5,num_comments:2,retrieved_on:NOW/1000});
  await saveScoreObservations(env.DB,[scoreObservation(raw,NOW)]).run();
  const result=await refreshWeeklyScores(env.DB,{now:()=>sunday,sleep:async()=>{},fetch:async()=>Response.json({data:[raw]})});
  assert.equal(result.updated,0);assert.equal((await meta(env.DB,'weekly_scores')).unchanged,1);
  const rows=env.DB.sql.prepare('SELECT * FROM reddit_observations').all();assert.equal(rows.length,1);assert.equal(rows[0].comment_count,2);assert.equal(rows[0].observed_at,new Date(NOW).toISOString());
  assert.equal((await scoreMaintenanceStatus(env.DB)).coverage.comparableProjects,0);env.DB.close();
});
test('approved OAuth reads stay inside the Sunday eight-request budget, including token acquisition',async()=>{
  const env=fixtureEnv(undefined,config);await importCatalog(env.DB,fixtureCatalog(Array.from({length:805},(_,i)=>fixtureGame('p'+String(i).padStart(5,'0')))));
  let calls=0;const deps={now:()=>sunday,sleep:async()=>{},fetch:async(url,options)=>{
    calls++;assert.equal(options.redirect,'manual');assert.equal(options.headers['User-Agent'],config.REDDIT_USER_AGENT);
    if(url.includes('access_token'))return Response.json({access_token:'fixture-access',token_type:'bearer'});
    assert.equal(options.headers.Authorization,'Bearer fixture-access');
    const ids=new URL(url).searchParams.get('id').split(',').map(x=>x.slice(3));
    return Response.json({data:{children:ids.map(id=>({kind:'t3',data:rawPost(id,{author:'MakerName',score:20,num_comments:3})}))}});
  }};
  const result=await refreshWeeklyScores(env.DB,deps,env);assert.equal(result.updated,700);assert.equal(calls,8);
  await refreshWeeklyScores(env.DB,deps,env);assert.equal(calls,8);
  const coverage=(await scoreMaintenanceStatus(env.DB,env)).coverage;assert.equal(coverage.liveObservations,700);assert.equal(coverage.withComments,700);env.DB.close();
});
test('live access remains disabled without approval; OAuth throttling stops without fallback or retries',async()=>{
  assert.equal(redditConfigured({...config,REDDIT_API_APPROVED:'false'}),false);
  const env=fixtureEnv(undefined,config);await importCatalog(env.DB,fixtureCatalog());let calls=0;
  const deps={now:()=>sunday,sleep:async()=>{},fetch:async()=>{calls++;return new Response(null,{status:429,headers:{'Retry-After':'7200'}});}};
  await refreshWeeklyScores(env.DB,deps,env);await refreshWeeklyScores(env.DB,deps,env);assert.equal(calls,1);
  assert.equal((await meta(env.DB,'editorial_cooldown')).reddit,sunday+7200000);env.DB.close();
});
test('history is bounded and source withdrawal deletes dependent observations',async()=>{
  const env=fixtureEnv();await importCatalog(env.DB,fixtureCatalog());
  for(let i=0;i<55;i++)await saveScoreObservations(env.DB,[scoreObservation(rawPost('abc12',{score:i,num_comments:i}),NOW+i*1000,'reddit')]).run();
  assert.equal(env.DB.sql.prepare('SELECT count(*) n FROM reddit_observations').get().n,52);
  env.DB.sql.prepare("UPDATE source_posts SET status='rejected' WHERE id='abc12'").run();
  assert.equal(env.DB.sql.prepare('SELECT count(*) n FROM reddit_observations').get().n,0);assert.equal(env.DB.sql.prepare('SELECT count(*) n FROM reddit_scores').get().n,0);env.DB.close();
});
