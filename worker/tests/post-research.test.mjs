import test from 'node:test';
import assert from 'node:assert/strict';
import { fixtureEnv, fixtureCatalog, rawPost, NOW, fixtureWorker } from './helpers.mjs';
import { importCatalog, removal } from '../src/store.mjs';
import { refreshSourceRecords } from '../src/source-evidence.mjs';
import { importPostResearch, postResearchQueue, reviewPostResearch, postResearchReport } from '../src/post-research.mjs';
import { researchVersion, rubric, fingerprint } from '../../scripts/post-research-core.mjs';

const deps={now:()=>NOW},admin={subject:'reviewer'};
async function setup(){
  const env=fixtureEnv();await importCatalog(env.DB,fixtureCatalog());
  const raw=rawPost('abc12',{author:'MakerName',selftext:'This is a prototype. I used an AI tool to make a puzzle. Feedback welcome.'});
  await refreshSourceRecords(env.DB,[raw],deps);
  const source=JSON.parse(env.DB.sql.prepare('SELECT payload_json FROM source_evidence').get().payload_json);
  const entry={id:raw.id,fingerprint:fingerprint(source),model:'fixture',classifiedAt:new Date(NOW).toISOString(),labels:Object.fromEntries(Object.keys(rubric).map(key=>[key,{value:'unknown',proposed:'unknown',probability:.95}]))};
  return {env,entry,raw};
}
const body=entry=>({version:researchVersion,entries:[entry]});
const decision=revision=>({action:'review',revision,labels:{purpose:'demo',feedback:'general',detail:'general',wording:'unknown',access:'unclear',constraint:'unknown'},questions:['Which build is available, and how do I start?']});
test('only matching source text becomes a private draft; reviewed findings need an explicit revision-safe decision',async()=>{
  const {env,entry}=await setup();const db=env.DB;
  assert.equal((await importPostResearch(db,body({...entry,fingerprint:'a'.repeat(64)}),deps)).skipped,1);
  assert.equal((await importPostResearch(db,body(entry),deps)).imported,1);
  const q=await postResearchQueue(db,new URLSearchParams());assert.equal(q.entries.length,1);assert.equal(q.entries[0].questions.length,5);
  assert.equal((await postResearchReport(db)).facets.reviewed.access.total,0);
  await reviewPostResearch(db,entry.id,decision(1),admin,deps);
  const r=await postResearchReport(db);assert.equal(r.counts.reviewed,1);assert.equal(r.facets.reviewed.access.counts.unclear,1);assert.equal(r.facets.reviewed.wording.counts.unknown,1);
  await assert.rejects(()=>reviewPostResearch(db,entry.id,decision(1),admin,deps),e=>e.status===409);
  assert.equal((await importPostResearch(db,body(entry),deps)).skipped,1,'idempotent import preserves human review');
  assert.equal((await postResearchReport(db)).counts.reviewed,1);db.close();
});
test('source edits invalidate approvals and stale drafts; removals scrub research',async()=>{
  const {env,entry,raw}=await setup();const db=env.DB;await importPostResearch(db,body(entry),deps);await reviewPostResearch(db,entry.id,decision(1),admin,deps);
  await refreshSourceRecords(db,[{...raw,selftext:'A changed post with a different build.',retrieved_on:NOW/1000+60}],{now:()=>NOW+120000});
  const report=await postResearchReport(db);assert.equal(report.counts.stale,1);assert.equal(report.facets.reviewed.access.total,0);
  await assert.rejects(()=>reviewPostResearch(db,entry.id,decision(2),admin,deps),e=>e.status===409);
  assert.equal((await postResearchQueue(db,new URLSearchParams('status=stale'))).entries.length,1);
  await refreshSourceRecords(db,[{...raw,selftext:'[deleted]',retrieved_on:NOW/1000+180}],{now:()=>NOW+240000});
  assert.equal(db.sql.prepare('SELECT count(*) n FROM post_research').get().n,0);db.close();
});
test('low-confidence or malformed model labels cannot be promoted by import; project withdrawal removes drafts',async()=>{
  const {env,entry}=await setup();const bad=structuredClone(entry);bad.labels.access={value:'clear',proposed:'clear',probability:.5};
  await assert.rejects(()=>importPostResearch(env.DB,body(bad),deps));
  await importPostResearch(env.DB,body(entry),deps);
  await removal(env.DB,null,'g_abc12','Creator request',new Date(NOW).toISOString());
  assert.equal(env.DB.sql.prepare('SELECT count(*) n FROM post_research').get().n,0);env.DB.close();
});
test('private research routes require admin authentication and are not cached',async()=>{
  const worker=fixtureWorker(),env=fixtureEnv(undefined,{CLERK_SECRET_KEY:'sk_test_'+'a'.repeat(40)});
  for(const path of ['/admin/post-research','/admin/post-research/report']){
    const r=await worker.fetch(new Request('https://api.example/api/v1'+path),env);assert.equal(r.status,401);assert.equal(r.headers.get('Cache-Control'),'no-store');
  }env.DB.close();
});
