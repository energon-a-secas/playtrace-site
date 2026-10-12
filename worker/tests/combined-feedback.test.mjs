import test from 'node:test';
import assert from 'node:assert/strict';
import { fixtureEnv, fixtureCatalog, fixtureWorker, request, NOW, OPERATOR } from './helpers.mjs';
import { importCatalog, query } from '../src/store.mjs';
import { enqueueJobs, runJobs, listJobs, updateJob, queueFeedbackMaintenance } from '../src/jobs.mjs';
import { projectContext } from '../src/references.mjs';
import { feedbackPatterns } from '../src/feedback-patterns.mjs';
import { feedbackReport } from '../../js/feedback-patterns.js';
import { ensureResearch } from '../src/research.mjs';

const admin={subject:'editor'}, gameId='g_abc12';
const note={displayName:'A visitor',body:'I played it. The controls were smooth.',idealPriceCents:null,choices:['controls'],experience:'played'};
function guest(method='PUT',body=note){const value=request(`/games/${gameId}/feedback`,{method,...(method==='PUT'?{body}:{})});value.headers.set('X-Feedback-Key','cd'.repeat(32));return value;}
async function setup(){const env=fixtureEnv(undefined,{JEV_API_KEY:'fixture-key'});await importCatalog(env.DB,fixtureCatalog());return {env,worker:fixtureWorker()};}
function dependencies(onJev=()=>{}){return {now:()=>NOW,sleep:async()=>{},fetch:async(url,options)=>{
  if(url.startsWith('https://arctic-shift.'))return Response.json({data:[{id:'comm01',author:'RedditVisitor',body:'I have only watched the video. The controls look smooth.',created_utc:NOW/1000-3600,link_id:'t3_abc12'}]});
  assert.equal(url,'https://api.typesafe.ai/v1/systemone');
  const payload=JSON.parse(options.body);assert.ok(Object.keys(payload.questions).length<=30);
  assert.ok(!options.body.includes('private-answer'));assert.ok(!options.body.includes('A visitor'));assert.ok(!options.body.includes('guest_key_hash'));
  await onJev(payload);
  return Response.json({model:'jev-test',answers:Object.fromEntries(Object.keys(payload.questions).map(key=>{
    const value=key.startsWith('theme')?'controls':key.startsWith('tone')?'praise':'preview';
    return [key,{type:'choice',choice:value,probabilities:{[value]:.95}}];
  }))});
}};}
test('combined drafts use only public notes and Reddit comments; approved reports retain sources and perspectives',async()=>{
  const {env,worker}=await setup();
  const saved=await (await worker.fetch(guest(),env)).json();assert.equal(saved.feedback.experience,'played');
  await ensureResearch(env.DB);
  await query(env.DB,`INSERT INTO research_responses VALUES('playtest',?,'private-browser',1,'[]','{"note":"private-answer"}',?,?)`,gameId,new Date(NOW).toISOString(),new Date(NOW).toISOString()).run();
  await enqueueJobs(env.DB,{kind:'feedback',scope:'game',gameId},admin,dependencies());
  await runJobs(env.DB,env,dependencies());
  const job=(await listJobs(env.DB,'ready')).jobs[0];assert.ok(job,JSON.stringify(await listJobs(env.DB,'all')));
  assert.equal(job.result.sources.reddit.classified,1);assert.equal(job.result.sources.playtrace.classified,1);
  assert.equal(job.result.citations[1].source,'playtrace');assert.equal(job.result.citations[1].experience,'played');
  assert.equal(job.result.citations[0].experience,'preview');
  let report=await feedbackPatterns(env.DB,dependencies());assert.equal(report.games[0].review,null);
  await updateJob(env.DB,job.id,{action:'publish'},admin,dependencies());
  report=await feedbackPatterns(env.DB,dependencies());assert.equal(report.games[0].review.citations.length,2);
  const data=feedbackReport(report.games,[{id:gameId,category:'puzzle',distribution:'itch.io'}]);
  assert.equal(data.counts.siteContributions,1);assert.equal(data.counts.redditCitations,1);assert.equal(data.counts.siteCitations,1);
  assert.equal(data.themes[0].contexts.preview.praise,1);assert.equal(data.themes[0].contexts.played.praise,1);assert.equal(data.themes[0].recurring,false);
  assert.ok(!JSON.stringify(report).includes('private-answer'));assert.ok(!JSON.stringify(report).includes('private-browser'));
  const citation=job.result.citations[1];assert.match(citation.url,new RegExp(saved.feedback.id));
  const one=await worker.fetch(request(`/games/${gameId}/feedback/${saved.feedback.id}`),env);assert.equal(one.status,200);
  assert.ok(!JSON.stringify(await one.json()).includes('guest_key_hash'));env.DB.close();
});
test('editing, deleting or moderating a cited note withdraws the published copy and its source draft',async()=>{
  for(const operation of ['edit','delete','hide']){
    const {env,worker}=await setup();const saved=await(await worker.fetch(guest(),env)).json();
    await enqueueJobs(env.DB,{kind:'feedback',scope:'game',gameId},admin,dependencies());await runJobs(env.DB,env,dependencies());
    const job=(await listJobs(env.DB,'ready')).jobs[0];await updateJob(env.DB,job.id,{action:'publish'},admin,dependencies());
    if(operation==='edit')await worker.fetch(guest('PUT',{...note,body:'Actually, the controls need work.'}),env);
    if(operation==='delete')await worker.fetch(guest('DELETE'),env);
    if(operation==='hide')await query(env.DB,"UPDATE feedback SET status='hidden' WHERE id=?",saved.feedback.id).run();
    assert.equal((await projectContext(env.DB,gameId)).review,null);
    assert.equal((await listJobs(env.DB,'all')).jobs.length,0);
    if(operation!=='edit')assert.equal((await worker.fetch(request(`/games/${gameId}/feedback/${saved.feedback.id}`),env)).status,404);
    env.DB.close();
  }
});
test('deletion racing a Jev response cannot persist the removed public note',async()=>{
  const {env,worker}=await setup();await worker.fetch(guest(),env);
  await enqueueJobs(env.DB,{kind:'feedback',scope:'game',gameId},admin,dependencies());
  await runJobs(env.DB,env,dependencies(async()=>{await query(env.DB,'DELETE FROM feedback WHERE game_id=?',gameId).run();}));
  const result=await listJobs(env.DB,'all');assert.equal(result.jobs[0].status,'failed');
  assert.ok(!JSON.stringify(result).includes(note.body));assert.equal((await projectContext(env.DB,gameId)).review,null);env.DB.close();
});
test('old clients preserve a previously stated perspective and malformed context is rejected',async()=>{
  const {env,worker}=await setup();await worker.fetch(guest(),env);
  const {experience,...old}=note;
  assert.equal((await(await worker.fetch(guest('PUT',old),env)).json()).feedback.experience,'played');
  assert.equal((await worker.fetch(guest('PUT',{...note,experience:'verified-player'}),env)).status,400);
  const before=await feedbackPatterns(env.DB,dependencies());assert.equal(before.games[0].feedback[0].count,1);env.DB.close();
});
test('automatic feedback maintenance coalesces new public notes and never publishes a draft',async()=>{
  const {env,worker}=await setup();await worker.fetch(guest(),env);
  assert.equal((await queueFeedbackMaintenance(env.DB,dependencies())).queued,1);
  assert.equal((await queueFeedbackMaintenance(env.DB,dependencies())).queued,0);
  await runJobs(env.DB,env,dependencies());assert.equal((await projectContext(env.DB,gameId)).review,null);
  assert.equal((await queueFeedbackMaintenance(env.DB,dependencies(),{weekly:true})).queued,0);env.DB.close();
});
test('admin can correct labels and prose, but cannot rewrite the visitor’s perspective or forge citations',async()=>{
  const {env,worker}=await setup();await worker.fetch(guest(),env);
  await enqueueJobs(env.DB,{kind:'feedback',scope:'game',gameId},admin,dependencies());await runJobs(env.DB,env,dependencies());
  const job=(await listJobs(env.DB,'ready')).jobs[0];
  const review={summary:'A preview reaction and a visitor who reported playing both mentioned the controls [1][2].',labels:job.result.citations.map(({number,theme,tone,experience})=>({number,theme,tone,experience}))};
  await assert.rejects(updateJob(env.DB,job.id,{action:'publish',review:{...review,summary:'A made up citation is here [99].'}},admin,dependencies()));
  await assert.rejects(updateJob(env.DB,job.id,{action:'publish',review:{...review,labels:review.labels.map(row=>({...row,experience:'unspecified'}))}},admin,dependencies()));
  await assert.rejects(updateJob(env.DB,job.id,{action:'publish',review,expectedUpdatedAt:'outdated'},admin,dependencies()),error=>error.status===409);
  const body={action:'review',options:{id:job.id,action:'publish',review,expectedUpdatedAt:job.updatedAt}};
  assert.equal((await worker.fetch(request('/admin/campaign',{method:'POST',body}),env)).status,403);
  assert.equal((await worker.fetch(request('/admin/campaign',{method:'POST',body,auth:OPERATOR}),env)).status,200);
  assert.equal((await projectContext(env.DB,gameId)).review.summary,review.summary);
  assert.equal((await listJobs(env.DB,'published')).jobs[0].result.summary,review.summary);env.DB.close();
});
