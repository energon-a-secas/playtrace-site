import test from 'node:test';
import assert from 'node:assert/strict';
import { chooseSample, classifyPosts, fingerprint, modelText, redactText, rubric, scoreAge, summarizeStudy } from '../scripts/post-research-core.mjs';
const now=Date.parse('2026-10-16T12:00:00Z');
const row=(id='a')=>({id,gameId:`g_${id}`,makerKey:'private-author',title:'A browser puzzle',body:'Try the free demo. Does the jump feel slow?',state:'available',createdAt:'2026-10-01T12:00:00Z',score:10,observedAt:'2026-10-01T12:00:22Z'});
test('score age uses observation time, never a later retrieval or check',()=>{
 assert.equal(scoreAge({...row(),checkedAt:new Date(now).toISOString()},now)*3600,22);
 assert.equal(scoreAge({...row(),observedAt:null},now),null);
 assert.equal(scoreAge({...row(),observedAt:'2026-09-30T12:00:00Z'},now),null);
 assert.equal(scoreAge({...row(),observedAt:'2027-01-01T12:00:00Z'},now),null);
});
test('sampling excludes missing/withdrawn text, deduplicates projects and ignores scores',()=>{
 const data=[row(),{...row('b'),gameId:'g_a',createdAt:'2026-10-02T12:00:00Z'},row('c'),{...row('d'),body:''},{...row('e'),state:'needs-review'}];
 assert.deepEqual(chooseSample(data).map(r=>r.id).sort(),['b','c']);
 assert.deepEqual(chooseSample(data,1).map(r=>r.id),chooseSample(data.map(r=>({...r,score:10000-r.score})),1).map(r=>r.id));
});
test('Jev receives text only and common identifiers are removed',async()=>{
 let sent;const r={...row(),body:'See https://example.org/me u/someone name@example.com sk_live_12345678901234567890 +1 (555) 123-4567'};
 assert.doesNotMatch(redactText(r.body),/example\.org|someone|name@example|sk_live_|555/);
 const results=await classifyPosts([r],'private-key',{now:()=>now,fetch:async(url,init)=>{sent=JSON.parse(init.body);assert.equal(url,'https://api.typesafe.ai/v1/systemone');return Response.json({model:'fixture',answers:Object.fromEntries(Object.entries(rubric).map(([name,q])=>[`${name}_0`,{type:'choice',choice:Object.keys(q.choices)[0],probabilities:{[Object.keys(q.choices)[0]]:.91}}]))});}});
 assert.deepEqual(Object.keys(sent.state.posts[0]),['title','body']);assert.equal(Object.keys(sent.questions).length,6);assert.doesNotMatch(JSON.stringify(sent),/private-author|private-key|2026-10-01|makerKey|observedAt/);assert.equal(results.length,1);
});
test('uncertain classifications become unknown and malformed answers fail the batch',async()=>{
 const answers=Object.fromEntries(Object.keys(rubric).map(name=>[`${name}_0`,{type:'choice',choice:'unknown',probabilities:{unknown:.4}}]));
 const deps={now:()=>now,fetch:async()=>Response.json({answers})};
 const [r]=await classifyPosts([row()],'key',deps);assert.ok(Object.values(r.labels).every(l=>l.value==='unknown'));
 answers.access_0={type:'choice',choice:'invented',probabilities:{invented:1}};await assert.rejects(classifyPosts([row()],'key',deps),/invalid typed answer/);
});
test('rate limits retain an explicit retry time without automatic retry',async()=>{
 let requests=0;await assert.rejects(classifyPosts([row()],'key',{now:()=>now,fetch:async()=>{requests++;return new Response('',{status:429,headers:{'Retry-After':'120'}});}}),e=>e.retryAt===new Date(now+120000).toISOString());assert.equal(requests,1);
});
test('fresh archived scores cannot produce a best-time claim or named rankings',()=>{
 const report=summarizeStudy(Array.from({length:30},(_,i)=>row(String(i))),[],{now});
 assert.equal(report.coverage.medianScoreAgeSeconds,22);assert.equal(report.timing.eligibleProjects,0);assert.equal(report.timing.recommendation,null);assert.deepEqual(report.timing.cells,[]);assert.doesNotMatch(JSON.stringify(report),/private-author|g_a/);
});
test('small timing cells suppress score comparisons and duplicate games count once',()=>{
 const r={...row(),observedAt:'2026-10-10T12:00:00Z'},report=summarizeStudy([r,{...r,id:'duplicate'}],[],{now,timezone:'America/Santiago'});
 assert.equal(report.timing.eligibleProjects,1);assert.equal(report.timing.cells[0].reportable,false);assert.equal(report.timing.cells[0].medianScore,null);
});
test('changed text invalidates cached labels and metadata cannot change classifications',()=>{
 const r=row(),c={id:r.id,fingerprint:fingerprint(r),labels:Object.fromEntries(Object.keys(rubric).map(k=>[k,{value:'unknown'}]))};
 assert.equal(fingerprint({...r,score:1000,makerKey:'someone-else'}),fingerprint(r));
 assert.equal(summarizeStudy([r],[c],{now}).coverage.classified,1);
 assert.equal(summarizeStudy([{...r,body:'A different post'}],[c],{now}).coverage.classified,0);
 assert.deepEqual(Object.keys(modelText(r)),['title','body']);
});
