import test from 'node:test';import assert from 'node:assert/strict';
import {fixtureEnv,fixtureGame,fixtureCatalog,fixtureWorker,request,NOW} from './helpers.mjs';
import {importCatalog,removal} from '../src/store.mjs';
import {getResearch,saveResearch} from '../src/research.mjs';
test('public single-project reads apply editorial overrides and resolve merges without returning private state',async()=>{
 const env=fixtureEnv(),worker=fixtureWorker();await importCatalog(env.DB,fixtureCatalog());
 env.DB.sql.prepare('INSERT INTO project_overrides(game_id,details_json,revision,updated_at,updated_by) VALUES(?,?,1,?,?)').run('g_abc12',JSON.stringify({title:'Approved game name'}),new Date(NOW).toISOString(),'owner');
 env.DB.sql.prepare('INSERT INTO game_aliases VALUES(?,?,?,?)').run('g_old123','g_abc12','repost',new Date(NOW).toISOString());
 const response=await worker.fetch(request('/games/g_old123'),env),value=await response.json();assert.equal(response.status,200);assert.equal(value.games.length,1);assert.equal(value.games[0].id,'g_abc12');assert.equal(value.games[0].title,'Approved game name');
 assert.equal(value.follows,undefined);assert.match(response.headers.get('Cache-Control'),/public/);
 await removal(env.DB,null,'g_abc12','Withdrawn',new Date(NOW).toISOString());assert.equal((await worker.fetch(request('/games/g_abc12'),env)).status,404);env.DB.close();
});
test('shared quick-review links follow aliases while response endpoints keep an explicit project scope',async()=>{
 const env=fixtureEnv(),worker=fixtureWorker();await importCatalog(env.DB,fixtureCatalog());
 env.DB.sql.prepare('INSERT INTO game_aliases VALUES(?,?,?,?)').run('g_old123','g_abc12','Reviewed history',new Date(NOW).toISOString());
 const response=await worker.fetch(request('/research/playtest?game=g_old123'),env),value=await response.json();
 assert.equal(response.status,200);assert.equal(value.game.id,'g_abc12');assert.equal(value.questionnaire.id,'playtest');
 assert.equal(value.answers,undefined);assert.equal(env.DB.sql.prepare('SELECT count(*) n FROM research_responses').get().n,0);
 for(const method of ['GET','PUT','DELETE']){
  const req=request('/research/playtest/responses?game=g_old123',{method,...(method==='PUT'?{body:{gameId:'g_old123',revision:1,answers:{access:0}}}:{})});req.headers.set('X-Feedback-Key','ad'.repeat(32));
  assert.equal((await worker.fetch(req,env)).status,404);
 }
 assert.equal(env.DB.sql.prepare('SELECT count(*) n FROM research_responses').get().n,0);
 await removal(env.DB,null,'g_abc12','Withdrawn',new Date(NOW).toISOString());
 assert.equal((await worker.fetch(request('/research/playtest?game=g_old123'),env)).status,404);env.DB.close();
});
test('an aliased questionnaire link retains project restrictions, invalid-input checks and closed-form behavior',async()=>{
 const env=fixtureEnv(),worker=fixtureWorker();await importCatalog(env.DB,fixtureCatalog([fixtureGame(),fixtureGame('other1')]));
 const {questionnaire}=await getResearch(env.DB,'playtest','g_abc12');
 await saveResearch(env.DB,'specific-study',{title:'Project check',category:questionnaire.category,gameId:'g_abc12',questions:questionnaire.questions,revision:0,active:false},{subject:'editor'},{now:()=>NOW});
 env.DB.sql.prepare('INSERT INTO game_aliases VALUES(?,?,?,?)').run('g_old123','g_abc12','Reviewed history',new Date(NOW).toISOString());
 env.DB.sql.prepare('INSERT INTO game_aliases VALUES(?,?,?,?)').run('g_old456','g_other1','Other history',new Date(NOW).toISOString());
 const allowed=await worker.fetch(request('/research/specific-study?game=g_old123'),env),value=await allowed.json();
 assert.equal(allowed.status,200);assert.equal(value.game.id,'g_abc12');assert.equal(value.questionnaire.active,false);
 assert.equal((await worker.fetch(request('/research/specific-study?game=g_old456'),env)).status,400);
 assert.equal((await worker.fetch(request('/research/playtest?game=invalid'),env)).status,400);
 assert.equal((await worker.fetch(request('/research/playtest?game=g_absent'),env)).status,404);env.DB.close();
});
