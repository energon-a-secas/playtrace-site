import test from 'node:test';
import assert from 'node:assert/strict';
import { fixtureEnv, fixtureGame, fixtureCatalog, fixtureWorker, request, NOW } from './helpers.mjs';
import { importCatalog, catalog, getGame } from '../src/store.mjs';
import { rating, rateGame } from '../src/ratings.mjs';
import { ensureResearch, researchList, getResearch, saveResearch, researchResponse, researchMetrics } from '../src/research.mjs';
import { defaultQuestions, validAnswers } from '../../js/research-schema.js';
import { likelyRepost, consolidateReposts, resolveGame } from '../src/duplicates.mjs';
import { enqueueJobs, listJobs, runJobs, updateJob, queueStoreMaintenance } from '../src/jobs.mjs';
import { extractReferences } from '../src/references.mjs';
import { pageMetadata, checkProject } from '../src/enrichment.mjs';
import { publicAddress, publicPage, publicUrl } from '../src/public-fetch.mjs';
import { composeReview, classifyEvidence } from '../src/insights.mjs';
import { enrichGames } from '../src/steam.mjs';
import { quizPool } from '../src/quiz-pool.mjs';
import { quizInfo, startQuiz, finishQuiz } from '../src/quiz.mjs';

const admin={subject:'test_admin'},deps={now:()=>NOW,sleep:async()=>{}};
async function setup(games=[fixtureGame()]){const env=fixtureEnv();await importCatalog(env.DB,fixtureCatalog(games));return env;}
function guest(method='GET',key='a',body){const value=request('/unused',{method,body});value.headers.set('X-Feedback-Key',key.repeat(64));return value;}

test('guest ratings update one browser row, aggregate, delete and reject malformed stars',async()=>{
  const env=await setup();
  await rateGame(env.DB,env,guest('PUT'), 'g_abc12',{stars:4},deps);
  await rateGame(env.DB,env,guest('PUT'),'g_abc12',{stars:5},deps);
  await rateGame(env.DB,env,guest('PUT','b'),'g_abc12',{stars:3},deps);
  assert.deepEqual(await rating(env.DB,'g_abc12'),{gameId:'g_abc12',count:2,average:4,mine:null});
  assert.equal((await rateGame(env.DB,env,guest(),'g_abc12',null,deps)).mine,5);
  await assert.rejects(rateGame(env.DB,env,guest('PUT'),'g_abc12',{stars:4.5},deps));
  await rateGame(env.DB,env,guest('DELETE'),'g_abc12',null,deps);assert.equal((await rating(env.DB,'g_abc12')).count,1);env.DB.close();
});
test('research is versioned, editable per browser and keeps old-version counts separate',async()=>{
  const env=await setup();await ensureResearch(env.DB);
  const details=await getResearch(env.DB,'playtest','g_abc12');assert.equal(details.questionnaire.questions.length,5);
  await researchResponse(env.DB,env,guest('PUT'),'playtest',null,{gameId:'g_abc12',revision:1,answers:{access:0,highlights:[0,1],note:'Controls feel responsive.'}},deps);
  await researchResponse(env.DB,env,guest('PUT'),'playtest',null,{gameId:'g_abc12',revision:1,answers:{access:1}},deps);
  assert.equal((await researchMetrics(env.DB,'playtest')).counts[0].count,1);
  const input={title:'Link check',category:'Link health',gameId:'g_abc12',questions:structuredClone(defaultQuestions),revision:0,active:true};
  await saveResearch(env.DB,'link-check',input,admin,deps);
  await assert.rejects(saveResearch(env.DB,'missing-form',{...input,revision:2},admin,deps),e=>e.status===409);
  await assert.rejects(saveResearch(env.DB,'link-check',input,admin,deps),e=>e.status===409);
  await saveResearch(env.DB,'link-check',{...input,revision:1,title:'Recheck links'},admin,deps);
  assert.equal((await getResearch(env.DB,'link-check','g_abc12')).questionnaire.revision,2);
  await assert.rejects(researchResponse(env.DB,env,guest('PUT'),'link-check',null,{gameId:'g_abc12',revision:1,answers:{access:0}},deps),e=>e.status===409);
  await researchResponse(env.DB,env,guest('DELETE'),'playtest','g_abc12',null,deps);assert.equal((await researchMetrics(env.DB,'playtest')).counts.length,0);env.DB.close();
});
test('research rejects foreign answers and project mismatches, and returns no guest identifiers',async()=>{
  assert.equal(validAnswers(defaultQuestions,{access:9}),false);assert.equal(validAnswers(defaultQuestions,{highlights:[0,0]}),false);assert.equal(validAnswers(defaultQuestions,{injected:1}),false);
  const env=await setup();await ensureResearch(env.DB);
  await assert.rejects(researchResponse(env.DB,env,guest('PUT'),'playtest',null,{gameId:'g_abc12',revision:1,answers:{}},deps));
  assert.equal(JSON.stringify(await researchList(env.DB)).includes('guest_key_hash'),false);env.DB.close();
});
test('close reposts retain latest identity, source history, follows and editor overrides',async()=>{
  const games=['dupe01','dupe02','dupe03'].map((id,i)=>{const game=fixtureGame(id);game.title=game.posts[0].title='Creative iteration with AI is just different: how a pet from my ARPG prototype became the main character of '+['its own game','a fun sports game','a sports game'][i];game.projectUrl=null;game.firstSeenAt=game.updatedAt=game.posts[0].createdAt=new Date(NOW-86400000+i*3600000).toISOString();return game;});
  assert.equal(likelyRepost(games[0],games[2]),true);
  assert.equal(likelyRepost(games[0],{...games[2],author:{name:'AnotherMaker'}}),false);
  const env=await setup(games);
  env.DB.sql.prepare('INSERT INTO follows VALUES(?,?,?)').run('user_a',games[0].id,new Date(NOW).toISOString());
  env.DB.sql.prepare('INSERT INTO project_overrides VALUES(?,?,?,?,?)').run(games[0].id,JSON.stringify({title:'Admin chosen name'}),'admin',new Date(NOW).toISOString(),1);
  const result=await consolidateReposts(env.DB,deps,true);assert.equal(result.keep,'g_dupe03');assert.equal(result.merged,2);
  const live=await catalog(env.DB);assert.equal(live.games.length,1);assert.equal(live.games[0].posts.length,3);assert.equal(live.games[0].title,'Admin chosen name');
  assert.deepEqual(await resolveGame(env.DB,'g_dupe01'),{gameId:'g_dupe03',redirected:true});
  assert.ok(env.DB.sql.prepare('SELECT * FROM follows WHERE game_id=?').get('g_dupe03'));
  await importCatalog(env.DB,fixtureCatalog([games[0]]));assert.equal((await catalog(env.DB)).games.length,1);env.DB.close();
});
test('same-author different projects or distant updates are never collapsed',()=>{
  const a=fixtureGame(),b=fixtureGame('other01');a.posts[0].title=b.posts[0].title='A detailed development update on the small puzzle game I have been working on';
  b.projectUrl='https://maker.itch.io/another-game';assert.equal(likelyRepost(a,b),false);
  b.projectUrl=a.projectUrl;b.posts[0].createdAt='2026-01-01T00:00:00.000Z';assert.equal(likelyRepost(a,b),false);
});
test('shared references reject private destinations and retain source and Markdown titles',()=>{
  const refs=extractReferences({id:'abc12',selftext:'See [Earlier prototype](https://www.reddit.com/r/aigamedev/comments/old123/first_version/) and https://demo.example/game. Ignore https://localhost/admin https://127.0.0.1/secret'});
  assert.equal(refs.length,2);assert.equal(refs[0].title,'Earlier prototype');assert.equal(refs[0].postId,'old123');assert.equal(refs[1].sourcePostId,'abc12');
  const aliases=extractReferences({id:'abc12',selftext:'https://www.reddit.com/r/aigamedev/comments/old123/first_version/?utm_source=x https://redd.it/old123 https://www.reddit.com/r/aigamedev/comments/old123/title/comment1/'});assert.equal(aliases.length,2);assert.equal(aliases[0].url,'https://www.reddit.com/comments/old123/');assert.equal(aliases[1].url,'https://www.reddit.com/comments/old123/_/comment1/');
});
test('public link checks reject private DNS and never forward tokens across redirects',async()=>{
  for(const url of ['http://example.com','https://user:pass@example.com','https://127.1/','https://x.local/','https://example.com:8443/'])assert.throws(()=>publicUrl(url));
  assert.equal(publicAddress('10.0.0.1'),false);assert.equal(publicAddress('::ffff:127.0.0.1'),false);
  const calls=[];await assert.rejects(publicPage('https://public.example', {...deps,fetch:async(url,opts)=>{calls.push([url,opts]);return Response.json({Answer:[{type:1,data:'127.0.0.1'}]});}}));assert.equal(calls.length,1);
});
test('itch metadata requires an actual build control, not just a valid page or image',()=>{
  const html='<meta property="og:title" content="Underbloom"><meta property="og:image" content="https://img.itch.zone/art.png"><div class="html_embed_widget">';
  assert.equal(pageMetadata(html,'https://maker.itch.io/game').playable,true);
  assert.equal(pageMetadata('<title>Coming soon</title>','https://maker.itch.io/game').playable,false);
  assert.equal(pageMetadata(html,'https://maker.itch.io.evil.example/game').playable,false);
});
test('store evidence updates automatic thumbnails and playable status, with admin overrides taking priority',async()=>{
  const env=await setup(),game=fixtureGame();
  const fetcher=async url=>url.includes('dns-query')?Response.json({Answer:[{type:1,data:'8.8.8.8'}]}):new Response('<title>Puzzle</title><meta property="og:image" content="https://img.itch.zone/art.png"><div class="html_embed_widget">',{headers:{'Content-Type':'text/html'}});
  const evidence=await checkProject(env.DB,env,game.id,{...deps,now:()=>Date.now(),fetch:fetcher},true);assert.equal(evidence.playable,true);
  let [enriched]=await enrichGames(env.DB,[game]);assert.equal(enriched.stage,'playable');assert.equal(enriched.preview.url,'https://img.itch.zone/art.png');
  const rechecked=await checkProject(env.DB,env,game.id,{...deps,now:()=>Date.now()+86400000,fetch:fetcher},false);assert.equal(rechecked.storeCheckedAt,evidence.storeCheckedAt);assert.notEqual(rechecked.checkedAt,evidence.checkedAt);
  await checkProject(env.DB,env,game.id,{...deps,now:()=>Date.now(),fetch:async url=>url.includes('dns-query')?Response.json({Answer:[{type:1,data:'8.8.8.8'}]}):new Response('',{status:403})},false);
  [enriched]=await enrichGames(env.DB,[game]);assert.equal(enriched.stage,'playable');assert.equal(enriched.availability.status,'blocked');
  env.DB.sql.prepare('INSERT INTO project_overrides VALUES(?,?,?,?,?)').run(game.id,JSON.stringify({stage:'prototype'}),'admin',new Date(NOW).toISOString(),1);
  [enriched]=await enrichGames(env.DB,[game]);assert.equal(enriched.stage,'prototype');env.DB.close();
});
test('queue enqueue is idempotent, jobs complete and only cited feedback drafts publish',async()=>{
  const game=fixtureGame();game.projectUrl=null;const env=await setup([game]);
  const body={kind:'links',scope:'game',gameId:game.id};assert.equal((await enqueueJobs(env.DB,body,admin,deps)).queued,1);assert.equal((await enqueueJobs(env.DB,body,admin,deps)).queued,0);
  await runJobs(env.DB,env,deps);const jobs=await listJobs(env.DB,'ready');assert.equal(jobs.jobs.length,1);assert.equal(jobs.jobs[0].result.status,'unlisted');
  await assert.rejects(updateJob(env.DB,jobs.jobs[0].id,{action:'publish'},admin,deps));
  await updateJob(env.DB,jobs.jobs[0].id,{action:'retry'},admin,deps);assert.equal((await listJobs(env.DB,'pending')).jobs.length,1);env.DB.close();
});
test('insights cite only sufficiently supported source evidence and reject invented classes',async()=>{
  const source={url:'https://www.reddit.com/r/aigamedev/comments/abc12/_/comment1/',author:'Reader',body:'The controls were smooth.',createdAt:new Date(NOW).toISOString(),theme:{value:'controls',probability:.9},tone:{value:'praise',probability:.95}};
  const result=composeReview([source,{...source,theme:{value:'controls',probability:.4}}]);assert.equal(result.citations.length,1);assert.match(result.summary,/\[1\]/);assert.equal(result.citations[0].url,source.url);
  await assert.rejects(classifyEvidence([source],{JEV_API_KEY:'fixture-key'},{...deps,fetch:async()=>Response.json({answers:{theme_0:{type:'choice',choice:'invented',probabilities:{invented:1}}}})}));
});
test('new privileged API routes require verified admin while public reads stay open',async()=>{
  const env=await setup(),worker=fixtureWorker();env.CLERK_SECRET_KEY='sk_test_'+'a'.repeat(40);
  assert.equal((await worker.fetch(request('/admin/jobs'),env)).status,401);
  assert.equal((await worker.fetch(request('/games/g_abc12/rating'),env)).status,200);
  assert.equal((await worker.fetch(request('/research'),env)).status,200);
  assert.equal((await worker.fetch(request('/games/g_abc12/rating',{method:'PUT',body:{stars:5}}),env)).status,400);env.DB.close();
});
test('quiz keeps its curated pool after an original project becomes a redirected repost',async()=>{
  const games=quizPool.map(item=>({...fixtureGame(item.id.slice(2)),title:item.title,projectUrl:item.projectUrl}));
  const winner=fixtureGame('newest1');winner.title=games[0].title;winner.projectUrl=games[0].projectUrl;
  const env=await setup([...games,winner]);
  env.DB.sql.prepare('INSERT INTO game_aliases VALUES(?,?,?,?)').run(games[0].id,winner.id,'Fixture repost',new Date(NOW).toISOString());
  env.DB.sql.prepare("UPDATE games SET status='hidden' WHERE id=?").run(games[0].id);
  assert.equal((await quizInfo(env.DB)).poolSize,20);
  const id=crypto.randomUUID(),round=await startQuiz(env.DB,env,guest('POST'),{id},deps);
  const result=await finishQuiz(env.DB,env,guest('PUT'),id,{answers:round.questions.map((q,index)=>({index,choiceId:null,skippedReason:'skip'}))},deps);
  assert.equal(result.saved,true);env.DB.close();
});
test('deactivated questionnaires reject writes and source removal hides all new public reads',async()=>{
  const env=await setup(),worker=fixtureWorker();await ensureResearch(env.DB);
  await researchResponse(env.DB,env,guest('PUT'),'playtest',null,{gameId:'g_abc12',revision:1,answers:{access:0}},deps);
  env.DB.sql.prepare("UPDATE questionnaires SET active=0 WHERE id='playtest'").run();
  assert.equal((await getResearch(env.DB,'playtest','g_abc12')).questionnaire.active,false);
  assert.ok((await researchResponse(env.DB,env,guest(),'playtest','g_abc12',null,deps)).answers);
  await researchResponse(env.DB,env,guest('DELETE'),'playtest','g_abc12',null,deps);
  assert.equal((await researchMetrics(env.DB,'playtest')).counts.length,0);
  await assert.rejects(researchResponse(env.DB,env,guest('PUT'),'playtest',null,{gameId:'g_abc12',revision:1,answers:{access:0}},deps),e=>e.status===404);
  env.DB.sql.prepare("UPDATE games SET status='hidden' WHERE id='g_abc12'").run();
  for(const path of ['/games/g_abc12/rating','/games/g_abc12/context','/games/g_abc12/resolve'])assert.equal((await worker.fetch(request(path),env)).status,404);
  env.DB.close();
});

test('maintenance queues only due stores and respects explicit admin link removal',async()=>{
  const a=fixtureGame(),b=fixtureGame('other01'),c=fixtureGame('other02');c.projectUrl='https://demo.example/play';
  const env=await setup([a,b,c]);
  env.DB.sql.prepare('INSERT INTO project_overrides VALUES(?,?,?,?,?)').run(b.id,JSON.stringify({projectUrl:null}),'admin',new Date(NOW).toISOString(),1);
  await queueStoreMaintenance(env.DB,deps);await queueStoreMaintenance(env.DB,deps);
  assert.deepEqual(env.DB.sql.prepare('SELECT game_id FROM editorial_jobs').all().map(row=>row.game_id),[a.id]);
  assert.equal((await enqueueJobs(env.DB,{kind:'store',scope:'all',gameId:null},admin,deps)).matched,1);
  assert.equal((await enqueueJobs(env.DB,{kind:'links',scope:'all',gameId:null},admin,deps)).matched,2);env.DB.close();
});
test('repost decisions respect admin-corrected project destinations',async()=>{
  const a=fixtureGame(),b=fixtureGame('other01');a.posts[0].title=b.posts[0].title='A detailed development update on the small puzzle game I have been working on';
  const env=await setup([a,b]);
  env.DB.sql.prepare('INSERT INTO project_overrides VALUES(?,?,?,?,?)').run(b.id,JSON.stringify({projectUrl:'https://maker.itch.io/different-game'}),'admin',new Date(NOW).toISOString(),1);
  assert.equal((await consolidateReposts(env.DB,deps)).groups.length,0);env.DB.close();
});

test('archive throttling defers comment work while unrelated checks can continue',async()=>{
  const env=await setup();env.JEV_API_KEY='fixture';
  await enqueueJobs(env.DB,{kind:'feedback',scope:'game',gameId:'g_abc12'},admin,deps);
  let calls=0;const limited={...deps,fetch:async()=>{calls++;return new Response('',{status:429,headers:{'X-RateLimit-Reset':'120'}});}};
  assert.equal((await runJobs(env.DB,env,limited)).processed,1);
  assert.equal((await listJobs(env.DB,'pending')).jobs.length,1);
  const held=await runJobs(env.DB,env,limited);assert.equal(held.processed,0);assert.equal(held.retryAt,new Date(NOW+120000).toISOString());assert.equal(calls,1);
  await enqueueJobs(env.DB,{kind:'links',scope:'game',gameId:'g_abc12'},admin,deps);
  const checked=await runJobs(env.DB,env,{...deps,fetch:async url=>url.includes('dns-query')?Response.json({Answer:[{type:1,data:'8.8.8.8'}]}):new Response('Page')});
  assert.equal(checked.processed,1);assert.equal((await listJobs(env.DB,'ready','','links')).jobs.length,1);assert.equal((await listJobs(env.DB,'ready','','feedback')).jobs.length,0);env.DB.close();
});

test('a dated archive batch reuses only matching player comments and can publish a cited draft',async()=>{
  const {feedbackSample,validFeedbackBatch,feedbackReview}=await import('../src/insights.mjs');
  const {projectContext}=await import('../src/references.mjs');
  const game=fixtureGame(),since=new Date(NOW-86400000).toISOString(),until=new Date(NOW).toISOString();
  const base={id:'comm01',author:'PlayerOne',body:'The controls feel smooth.',created_utc:(NOW-3600000)/1000,link_id:'t3_abc12'};
  const sample=feedbackSample(game,since,until,[base,{...base,id:'comm02',author:game.author.name},{...base,id:'comm03',body:'[removed]'},{...base,id:'comm04',link_id:'t3_other1'}]);
  assert.equal(sample.evidence.length,1);assert.equal(validFeedbackBatch(sample,game,since,NOW),true);
  assert.equal(validFeedbackBatch({...sample,windowStart:until},game,since,NOW),false);
  assert.equal(validFeedbackBatch({...sample,evidence:[{...sample.evidence[0],url:'https://evil.example/'}]},game,since,NOW),false);
  const env=await setup([game]);env.JEV_API_KEY='fixture';let calls=0;
  const result=await feedbackReview(game,since,env,{...deps,fetch:async url=>{assert.equal(url,'https://api.typesafe.ai/v1/systemone');calls++;return Response.json({model:'jev-fixture',answers:{experience_0:{type:'choice',choice:'unspecified',probabilities:{unspecified:.95}},theme_0:{type:'choice',choice:'controls',probabilities:{controls:.95}},tone_0:{type:'choice',choice:'praise',probabilities:{praise:.95}}}});}},sample);
  assert.equal(calls,1);assert.equal(result.citations[0].author,'PlayerOne');assert.match(result.summary,/\[1\]/);
  await enqueueJobs(env.DB,{kind:'feedback',scope:'game',gameId:game.id},admin,deps);
  const job=(await listJobs(env.DB,'pending')).jobs[0];env.DB.sql.prepare("UPDATE editorial_jobs SET status='ready',payload_json=? WHERE id=?").run(JSON.stringify(result),job.id);
  assert.equal((await projectContext(env.DB,game.id)).review,null);
  await updateJob(env.DB,job.id,{action:'publish'},admin,deps);assert.equal((await projectContext(env.DB,game.id)).review.citations.length,1);env.DB.close();
});

test('research edits and removals erase copied analysis, and answered forms retain their scope',async()=>{
  const env=await setup();await ensureResearch(env.DB);
  await researchResponse(env.DB,env,guest('PUT'),'playtest',null,{gameId:'g_abc12',revision:1,answers:{access:0}},deps);
  await assert.rejects(saveResearch(env.DB,'playtest',{title:'Changed scope',category:'Link health',gameId:'g_abc12',questions:defaultQuestions,revision:1,active:true},admin,deps),e=>e.status===409);
  await enqueueJobs(env.DB,{kind:'research',scope:'game',gameId:'g_abc12'},admin,deps);
  await researchResponse(env.DB,env,guest('DELETE','b'),'playtest','g_abc12',null,deps);assert.equal((await listJobs(env.DB,'all','','research')).jobs.length,1);
  await researchResponse(env.DB,env,guest('PUT'),'playtest',null,{gameId:'g_abc12',revision:1,answers:{access:1}},deps);assert.equal((await listJobs(env.DB,'all','','research')).jobs.length,0);
  await enqueueJobs(env.DB,{kind:'research',scope:'game',gameId:'g_abc12'},admin,deps);
  await researchResponse(env.DB,env,guest('DELETE'),'playtest','g_abc12',null,deps);assert.equal((await listJobs(env.DB,'all','','research')).jobs.length,0);env.DB.close();
});
