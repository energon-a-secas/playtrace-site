import test from 'node:test';
import assert from 'node:assert/strict';
import { scoreObservation, saveScoreObservations, projectScoresQuery } from '../src/reddit-scores.mjs';
import { catalog, importCatalog, removal } from '../src/store.mjs';
import { refreshSourceRecords } from '../src/source-evidence.mjs';
import { fixtureEnv, fixtureCatalog, fixtureGame, rawPost, NOW } from './helpers.mjs';

test('score detail reads use indexed project lookups without changing ties, coverage or duplicate-ID behavior',async()=>{
  const env=fixtureEnv(),db=env.DB,games=Array.from({length:250},(_,i)=>fixtureGame('q'+String(i).padStart(4,'0'))),game=games[0];
  game.posts.push({...fixtureGame('newer1').posts[0],createdAt:'2026-10-09T11:00:00.000Z'},fixtureGame('hide01').posts[0]);game.updatedAt='2026-10-09T11:00:00.000Z';
  await importCatalog(db,fixtureCatalog(games));
  await saveScoreObservations(db,[['q0000',-2],['newer1',-2],['hide01',99],['q0001',50]].map(([postId,score])=>({postId,score,observedAt:null,checkedAt:new Date(NOW).toISOString()}))).run();
  db.sql.prepare("UPDATE source_posts SET status='rejected' WHERE id='hide01'").run();
  const statement=projectScoresQuery(db,[game.id,game.id,'g_unknown']),rows=(await statement.all()).results;
  assert.equal(rows.length,1);assert.equal(rows[0].post_id,'newer1');assert.equal(rows[0].score,-2);assert.equal(rows[0].covered_posts,2);
  assert.deepEqual((await projectScoresQuery(db,[]).all()).results,[]);
  const plan=db.sql.prepare('EXPLAIN QUERY PLAN '+statement.sql).all(...statement.args).map(r=>r.detail);
  assert.ok(plan.some(step=>/SEARCH p USING INDEX source_posts_game_id_idx \(game_id=\?\)/.test(step)),plan.join('\n'));
  assert.ok(plan.some(step=>/SEARCH s USING INDEX .+ \(post_id=\?\)/.test(step)),plan.join('\n'));
  assert.ok(!plan.some(step=>/^SCAN [ps](?: |$)/.test(step)),plan.join('\n'));db.close();
});

test('archive scores retain zero and negative values without inventing missing votes or dates',()=>{
  for(const score of [undefined,null,'3',Infinity,1.3,1e10])assert.equal(scoreObservation({id:'abc12',score},NOW),null);
  for(const score of [0,-2,42])assert.equal(scoreObservation({id:'abc12',score},NOW).score,score);
  assert.equal(scoreObservation({id:'abc12',score:3,retrieved_on:NOW/1000+1000},NOW).observedAt,null);
});
test('highest single source score survives imports, preserves newer observations and follows removals',async()=>{
  const env=fixtureEnv(),game=fixtureGame(),second=fixtureGame('def34');
  game.posts.push(second.posts[0]); await importCatalog(env.DB,fixtureCatalog([game]));
  const deps={now:()=>NOW};
  const raw=(id,score,retrieved=NOW/1000)=>rawPost(id,{author:game.author.name,score,retrieved_on:retrieved});
  await refreshSourceRecords(env.DB,[raw('abc12',20),raw('def34',12)],deps);
  let value=(await catalog(env.DB)).games[0].redditScore;
  assert.equal(value.score,20);assert.equal(value.coveredPosts,2);assert.equal(value.postId,'abc12');
  await importCatalog(env.DB,fixtureCatalog([game]));
  await refreshSourceRecords(env.DB,[raw('abc12',100,NOW/1000-60),raw('def34',null)],deps);
  assert.equal((await catalog(env.DB)).games[0].redditScore.score,20);
  await refreshSourceRecords(env.DB,[raw('abc12',0,NOW/1000+60),raw('def34',-1,NOW/1000+60)],{now:()=>NOW+120000});
  assert.equal((await catalog(env.DB)).games[0].redditScore.score,20,'hourly source checks leave existing scores alone');
  await saveScoreObservations(env.DB,[scoreObservation(raw('abc12',0,NOW/1000+60),NOW+120000),scoreObservation(raw('def34',-1,NOW/1000+60),NOW+120000)]).run();
  assert.equal((await catalog(env.DB)).games[0].redditScore.score,0);
  await refreshSourceRecords(env.DB,[{...raw('abc12',999),author:'WrongMaker'}],deps);
  assert.equal((await catalog(env.DB)).games[0].redditScore.score,0);
  await removal(env.DB,null,game.id,'Creator request',new Date(NOW).toISOString());
  assert.equal(env.DB.sql.prepare('SELECT count(*) n FROM reddit_scores').get().n,0);env.DB.close();
});
