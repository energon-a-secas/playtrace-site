import test from 'node:test';
import assert from 'node:assert/strict';
import { fixtureEnv,fixtureCatalog,fixtureGame,NOW } from './helpers.mjs';
import { importCatalog,query } from '../src/store.mjs';
import { checkProject } from '../src/enrichment.mjs';
import { projectContext } from '../src/references.mjs';
import { queueLinkMaintenance } from '../src/jobs.mjs';
import { destinationHost,linkEvidence,hostingReport } from '../../js/link-health.js';
import { publicPage } from '../src/public-fetch.mjs';

const publicFetcher=response=>async url=>String(url).includes('dns-query')?Response.json({Answer:[{type:1,data:'8.8.8.8'}]}):response;
test('an oversized page retains HTTP reachability without parsing a partial metadata document',async()=>{
  for(const declared of [false,true]){
    let cancelled=false;
    const stream=new ReadableStream({start(controller){controller.enqueue(new TextEncoder().encode('<title>Partial</title>'.repeat(8)));},cancel(){cancelled=true;}});
    const response=new Response(stream,{headers:{'Content-Type':'text/html',...(declared?{'Content-Length':'9999'}:{})}});
    const page=await publicPage('https://game.example/',{fetch:publicFetcher(response)},64);
    assert.equal(page.status,200);assert.equal(page.bodyStatus,'too-large');assert.equal(page.html,'');assert.equal(cancelled,true);
  }
});
test('body stream failures and binary downloads stay separate from HTTP failures',async()=>{
  const stream=new ReadableStream({pull(controller){controller.error(new Error('stream interrupted'));}});
  const interrupted=await publicPage('https://game.example/',{fetch:publicFetcher(new Response(stream,{headers:{'Content-Type':'text/html'}}))});
  assert.equal(interrupted.status,200);assert.equal(interrupted.bodyStatus,'unavailable');assert.equal(interrupted.html,'');
  const binary=await publicPage('https://game.example/build.zip',{fetch:publicFetcher(new Response('binary',{headers:{'Content-Type':'application/zip'}}))});
  assert.equal(binary.status,200);assert.equal(binary.bodyStatus,'not-html');assert.equal(binary.html,'');
  const missing=await publicPage('https://game.example/',{fetch:publicFetcher(new Response('',{status:404}))});
  assert.equal(missing.status,404);assert.equal(missing.bodyStatus,'not-read');
});
test('large HTML records a successful link check without inventing a playable build or refreshing prior store evidence',async()=>{
  const env=fixtureEnv(),game=fixtureGame();await importCatalog(env.DB,fixtureCatalog([game]));
  const failed=await checkProject(env.DB,env,game.id,{now:()=>NOW-1000,fetch:async()=>{throw new DOMException('Timed out','TimeoutError');}},true);
  assert.equal(failed.status,'unverified');assert.ok(failed.note.includes('could not verify'));
  const response=()=>new Response('<div class="html_embed_widget">'+'x'.repeat(1024*1024),{headers:{'Content-Type':'text/html'}});
  let result=await checkProject(env.DB,env,game.id,{now:()=>NOW,fetch:publicFetcher(response())},true);
  assert.equal(result.status,'reachable');assert.equal(result.httpStatus,200);assert.equal(result.metadataStatus,'too-large');assert.equal(result.provider,undefined);assert.equal(result.playable,undefined);
  assert.equal(result.note,null);assert.equal(result.failureReason,null);
  const at=new Date(NOW-86400000).toISOString();
  await query(env.DB,'UPDATE project_enrichment SET payload_json=? WHERE game_id=?',JSON.stringify({...result,provider:'itch',playable:true,storeCheckedAt:at,storeStatus:'reachable'}),game.id).run();
  result=await checkProject(env.DB,env,game.id,{now:()=>NOW+60000,fetch:publicFetcher(response())},true);
  assert.equal(result.storeCheckedAt,at);assert.equal(result.playable,true);
  const history=await projectContext(env.DB,game.id);assert.equal(history.linkHistory[0].status,'reachable');assert.equal(history.linkHistory[0].httpStatus,200);env.DB.close();
});

test('URL hosting labels respect domain boundaries and do not invent infrastructure for custom domains',()=>{
  assert.equal(destinationHost('https://maker.github.io/demo/').provider,'github-pages');
  assert.equal(destinationHost('https://demo.pages.dev/').provider,'cloudflare-pages');
  assert.equal(destinationHost('https://maker.gitlab.io/demo/').kind,'site');
  assert.equal(destinationHost('https://gitlab.com/maker/demo').kind,'repository');
  assert.equal(destinationHost('https://mygame.example/').provider,'custom');
  assert.equal(destinationHost('https://itch.io.evil.example/').provider,'custom');
  assert.equal(destinationHost('https://itch.io@evil.example/'),null);
  const game={id:'g_one12',projectUrl:'https://demo.pages.dev/',availability:{projectUrl:'https://old.example/',status:'broken'}};
  assert.equal(linkEvidence(game).status,'not-checked');
  const report=hostingReport([{...game,link:linkEvidence(game)},{id:'g_two34',projectUrl:null}]);assert.equal(report.listed,1);assert.equal(report.unlisted,1);assert.equal(report.groups[0].states['not-checked'],1);
});
test('link observations retain dated failures, clear stale HTTP details on timeouts and record recoveries',async()=>{
  const env=fixtureEnv(),game=fixtureGame();game.projectUrl='https://maker.github.io/puzzle/';await importCatalog(env.DB,fixtureCatalog([game]));
  let now=NOW,status=404,fail=false;
  const deps={now:()=>now,fetch:async url=>{
    if(String(url).includes('dns-query'))return Response.json({Answer:[{type:1,data:'8.8.8.8'}]});
    if(fail)throw new DOMException('Timed out','TimeoutError');
    return new Response('<title>Game</title>',{status,headers:{'Content-Type':'text/html'}});
  }};
  const broken=await checkProject(env.DB,env,game.id,deps);assert.equal(broken.status,'broken');assert.equal(broken.failureSince,new Date(NOW).toISOString());
  now+=86400000;status=200;const recovered=await checkProject(env.DB,env,game.id,deps);assert.equal(recovered.recoveredAt,new Date(now).toISOString());
  now+=86400000;fail=true;const timeout=await checkProject(env.DB,env,game.id,deps);assert.equal(timeout.status,'unverified');assert.equal(timeout.httpStatus,null);assert.equal(timeout.finalUrl,null);assert.equal(timeout.failureReason,'timeout');
  let context=await projectContext(env.DB,game.id);assert.equal(context.linkHistory.length,3);assert.equal(context.linkHistory[2].httpStatus,404);
  fail=false;status=403;now+=86400000;assert.equal((await checkProject(env.DB,env,game.id,deps)).status,'blocked');
  for(let i=0;i<54;i++){now+=86400000;await checkProject(env.DB,env,game.id,deps);}
  assert.equal(env.DB.sql.prepare('SELECT count(*) AS n FROM link_observations').get().n,52);assert.equal((await projectContext(env.DB,game.id)).linkHistory.length,12);
  await query(env.DB,"UPDATE games SET payload_json=json_set(payload_json,'$.projectUrl','https://other.example/') WHERE id=?",game.id).run();
  context=await projectContext(env.DB,game.id);assert.equal(context.availability,null);assert.equal(context.linkHistory.length,0);env.DB.close();
});
test('link maintenance is bounded, coalesces work and respects healthy versus uncertain intervals',async()=>{
  const env=fixtureEnv(),game=fixtureGame();game.projectUrl='https://maker.github.io/puzzle';await importCatalog(env.DB,fixtureCatalog([game]));
  const at=new Date(NOW).toISOString(),value={projectUrl:game.projectUrl,status:'reachable',checkedAt:at};
  await query(env.DB,'INSERT INTO project_enrichment VALUES(?,?,?,?)',game.id,game.projectUrl,JSON.stringify(value),at).run();
  assert.equal((await queueLinkMaintenance(env.DB,{now:()=>NOW+8*86400000})).queued,0);
  await query(env.DB,"UPDATE project_enrichment SET payload_json=json_set(payload_json,'$.status','unverified') WHERE game_id=?",game.id).run();
  const deps={now:()=>NOW+8*86400000};assert.equal((await queueLinkMaintenance(env.DB,deps)).queued,1);assert.equal((await queueLinkMaintenance(env.DB,deps)).queued,0);
  for(let i=0;i<8;i++)await query(env.DB,"INSERT INTO editorial_jobs(id,game_id,kind,window_start,created_at,updated_at,requested_by) VALUES(?,?,'links',?,?,?,'fixture')",crypto.randomUUID(),game.id,'2026-09-'+String(i+1).padStart(2,'0'),at,at).run();
  assert.equal((await queueLinkMaintenance(env.DB,{now:()=>NOW+100*86400000})).queued,0);env.DB.close();
});
