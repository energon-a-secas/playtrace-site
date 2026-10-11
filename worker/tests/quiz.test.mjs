import test from 'node:test';
import assert from 'node:assert/strict';
import { fixtureEnv, fixtureWorker, fixtureCatalog, fixtureGame, request, token, NOW } from './helpers.mjs';
import { importCatalog, removal } from '../src/store.mjs';
import { quizPool } from '../src/quiz-pool.mjs';
import { quizMetrics } from '../src/quiz.mjs';
const key='14'.repeat(32), other='15'.repeat(32);
function guest(path,method,body,visitor=key,ip='192.0.2.1'){
  const req=request(path,{method,body,ip});if(visitor!==null)req.headers.set('X-Feedback-Key',visitor);return req;
}
async function setup(){
  const env=fixtureEnv(undefined,{CLERK_ISSUER:undefined}),worker=fixtureWorker();
  await importCatalog(env.DB,fixtureCatalog(quizPool.map(item=>({...fixtureGame(item.id.slice(2)),title:item.title,projectUrl:item.projectUrl}))));
  return{env,worker};
}
async function start(env,worker,visitor=key,id=crypto.randomUUID()){
  const response=await worker.fetch(guest('/quiz/rounds','POST',{id},visitor),env);
  assert.equal(response.status,201,await response.clone().text());return response.json();
}
const choicesFor=(env,id)=>JSON.parse(env.DB.sql.prepare('SELECT questions_json FROM quiz_rounds WHERE id=?').get(id).questions_json);
const correctAnswers=(env,id)=>choicesFor(env,id).map((q,index)=>({index,choiceId:q.gameId,skippedReason:null}));
const complete=(env,worker,id,answers,visitor=key)=>worker.fetch(guest(`/quiz/rounds/${id}`,'PUT',{answers},visitor),env);

test('curated pool has 20 concise names with source-hosted images and five random unique questions per round',async()=>{
  const {env,worker}=await setup();
  assert.equal(quizPool.length,20);assert.equal(new Set(quizPool.map(g=>g.id)).size,20);
  assert.ok(quizPool.every(g=>g.title.length<=48 && new URL(g.projectUrl).protocol==='https:' && new URL(g.image).protocol==='https:'));
  assert.deepEqual(await (await worker.fetch(request('/quiz'),env)).json(),{poolSize:20,roundSize:5,available:true});
  const round=await start(env,worker);assert.equal(round.questions.length,5);
  const truth=choicesFor(env,round.id);assert.equal(new Set(truth.map(q=>q.gameId)).size,5);
  for(const [i,q] of round.questions.entries()){
    const game=quizPool.find(game=>game.id===truth[i].gameId);
    assert.equal(q.image,game.image);assert.equal(q.fallbackImage,game.fallbackImage);
    if(q.fallbackImage)assert.equal(new URL(q.image).pathname.split('/')[1],new URL(q.fallbackImage).pathname.split('/')[1]);
    assert.equal(q.choices.length,4);assert.equal(new Set(q.choices.map(c=>c.id)).size,4);assert.equal(q.index,i);
    assert.ok(q.choices.some(c=>c.id===truth[i].gameId));assert.equal(q.gameId,undefined);assert.equal(q.correct,undefined);
  }
  assert.deepEqual(await start(env,worker,key,round.id),round);
  assert.equal(env.DB.sql.prepare('SELECT count(*) n FROM quiz_rounds').get().n,1);
  assert.equal((await worker.fetch(guest('/quiz/rounds','POST',{id:round.id},other),env)).status,404);
  env.DB.close();
});
test('server scores choices, rejects forged and partial submissions, and retries never double-count metrics',async()=>{
  const {env,worker}=await setup(),round=await start(env,worker),answers=correctAnswers(env,round.id);
  for(const bad of [answers.slice(1),answers.map((a,i)=>({...a,index:0})),answers.map(a=>({...a,choiceId:'g_invalid'})),answers.map(a=>({...a,correct:true}))]){
    assert.equal((await complete(env,worker,round.id,bad)).status,400);
  }
  assert.equal((await complete(env,worker,round.id,answers,other)).status,404);
  const response=await complete(env,worker,round.id,answers);assert.equal(response.status,200,await response.clone().text());
  const result=await response.json();assert.equal(result.score,5);assert.equal(result.answered,5);assert.equal(result.saved,true);
  assert.ok(result.results.every(r=>r.correct && r.recognition.attempts===1 && r.recognition.correct===1));
  assert.deepEqual(await (await complete(env,worker,round.id,answers)).json(),result);
  assert.equal(env.DB.sql.prepare('SELECT count(*) n FROM quiz_answers').get().n,5);
  const changed=structuredClone(answers);changed[0].choiceId=round.questions[0].choices.find(c=>c.id!==answers[0].choiceId).id;
  assert.equal((await complete(env,worker,round.id,changed)).status,409);
  const rows=env.DB.sql.prepare('SELECT * FROM quiz_rounds').all();assert.ok(!JSON.stringify(rows).includes(key));assert.ok(!JSON.stringify(rows).includes('192.0.2.1'));
  env.DB.close();
});
test('wrong choices and image skips have distinct metrics; deleting this browser removes only its rounds',async()=>{
  const {env,worker}=await setup(),round=await start(env,worker),answers=correctAnswers(env,round.id);
  answers[1].choiceId=round.questions[1].choices.find(c=>c.id!==answers[1].choiceId).id;
  answers[2]={index:2,choiceId:null,skippedReason:'skip'};answers[3]={index:3,choiceId:null,skippedReason:'image-unavailable'};
  const result=await (await complete(env,worker,round.id,answers)).json();assert.equal(result.score,2);assert.equal(result.answered,3);
  assert.equal(result.results[2].recognition.attempts,0);assert.equal(result.results[3].recognition.attempts,0);
  const report=await quizMetrics(env.DB),wrong=report.games.find(g=>g.gameId===result.results[1].gameId);
  assert.equal(wrong.correct,0);assert.equal(wrong.attempts,1);assert.equal(wrong.choices[0].title,result.results[1].choice);
  const another=await start(env,worker,other);await complete(env,worker,another.id,correctAnswers(env,another.id),other);
  assert.equal((await worker.fetch(guest('/quiz/rounds/mine','DELETE'),env)).status,200);
  assert.equal(env.DB.sql.prepare('SELECT count(*) n FROM quiz_rounds').get().n,1);assert.equal(env.DB.sql.prepare('SELECT count(*) n FROM quiz_answers').get().n,5);
  assert.equal((await quizMetrics(env.DB)).rounds.completed,1);env.DB.close();
});
test('removed games never enter new rounds, expire pending rounds and cannot win a race with completion',async()=>{
  const {env,worker}=await setup(),round=await start(env,worker),answers=correctAnswers(env,round.id),id=answers[0].choiceId;
  const prepare=env.DB.prepare.bind(env.DB);let triggered=false;
  env.DB.prepare=sql=>{
    if(sql.startsWith('UPDATE quiz_rounds SET answers_json')&&!triggered){triggered=true;env.DB.sql.prepare("UPDATE games SET status='hidden' WHERE id=?").run(id)}
    return prepare(sql);
  };
  assert.equal((await complete(env,worker,round.id,answers)).status,409);assert.equal(env.DB.sql.prepare('SELECT count(*) n FROM quiz_answers').get().n,0);
  assert.equal((await complete(env,worker,round.id,answers)).status,410);
  const next=await start(env,worker);assert.ok(next.questions.every(q=>q.choices.every(c=>c.id!==id)));
  assert.equal((await (await worker.fetch(request('/quiz'),env)).json()).poolSize,19);
  await complete(env,worker,next.id,correctAnswers(env,next.id));
  await removal(env.DB,null,choicesFor(env,next.id)[0].gameId,'Creator request',new Date(NOW).toISOString());
  assert.equal(env.DB.sql.prepare('SELECT count(*) n FROM quiz_answers WHERE game_id=?').get(choicesFor(env,next.id)[0].gameId).n,0);
  env.DB.close();
});
test('round starts are network and browser limited, require a browser key, and expire without accumulating abandoned records',async()=>{
  const {env,worker}=await setup();
  assert.equal((await worker.fetch(guest('/quiz/rounds','POST',{id:'bad'}),env)).status,400);
  assert.equal((await worker.fetch(guest('/quiz/rounds','POST',{id:crypto.randomUUID()},null),env)).status,400);
  const round=await start(env,worker);env.DB.sql.prepare('UPDATE quiz_rounds SET expires_at=? WHERE id=?').run(NOW-1,round.id);
  assert.equal((await complete(env,worker,round.id,correctAnswers(env,round.id))).status,410);
  for(let i=1;i<10;i++)await start(env,worker);
  assert.equal(env.DB.sql.prepare('SELECT count(*) n FROM quiz_rounds WHERE id=?').get(round.id).n,0);
  assert.equal((await worker.fetch(guest('/quiz/rounds','POST',{id:crypto.randomUUID()}),env)).status,429);
  for(let i=0;i<50;i++)await start(env,worker,(i+100).toString(16).padStart(64,'0'));
  assert.equal((await worker.fetch(guest('/quiz/rounds','POST',{id:crypto.randomUUID()},other),env)).status,429);
  assert.equal((await worker.fetch(guest('/quiz/rounds/mine','DELETE'),env)).status,200);
  env.DB.close();
});
test('only a verified admin can read the distribution of chosen names',async()=>{
  const {env}=await setup();env.CLERK_SECRET_KEY=`sk_test_${'a'.repeat(40)}`;env.CLERK_ISSUER='https://clerk.playtrace.example';
  const worker=fixtureWorker(async()=>Response.json({id:'user_a',primary_email_address_id:'email_1',email_addresses:[{id:'email_1',email_address:'luciano.adonis.villarroel@gmail.com',verification:{status:'verified'}}],banned:false,locked:false}));
  assert.equal((await worker.fetch(request('/admin/quiz-metrics'),env)).status,401);
  const response=await worker.fetch(request('/admin/quiz-metrics',{auth:await token()}),env);assert.equal(response.status,200);
  const result=await response.json();assert.equal(result.games.length,20);assert.equal(result.rounds.completed,0);assert.ok(!JSON.stringify(result).includes('guest_key_hash'));env.DB.close();
});
