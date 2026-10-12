import test from 'node:test';
import assert from 'node:assert/strict';
import {fixtureEnv,fixtureWorker,fixtureCatalog,request,token,NOW} from './helpers.mjs';
import {importCatalog} from '../src/store.mjs';
import {recordUsage,usageMetrics} from '../src/usage.mjs';
import {insightPage} from '../src/catalogue-insights.mjs';
import {builtInQuestionnaires,validQuestions} from '../../js/research-schema.js';
import {ensureResearch,researchList,saveResearch} from '../src/research.mjs';
const deps={now:()=>NOW};
const event=(type='game_view',gameId='g_abc12')=>({id:crypto.randomUUID(),event:type,page:'browse',gameId});
test('anonymous actions deduplicate retries and exclude removed projects, private fields and privacy signals',async()=>{
  const env=fixtureEnv(),db=env.DB;await importCatalog(db,fixtureCatalog());const a=event(),b=event();
  const req=request('/usage',{method:'POST',body:{events:[a,b]}});
  await recordUsage(db,env,req,{events:[a,b]},deps);await recordUsage(db,env,req,{events:[a,b]},deps);
  assert.equal(db.sql.prepare('SELECT count FROM usage_daily').get().count,2);
  assert.equal(db.sql.prepare('SELECT count(*) AS n FROM usage_receipts').get().n,2);
  assert.deepEqual(db.sql.prepare('PRAGMA table_info(usage_daily)').all().map(row=>row.name),['day','event','page','game_id','count']);
  assert.equal(db.sql.prepare('SELECT bucket_key FROM rate_limits').get().bucket_key.includes('192.0.2.1'),false);
  for(const extra of [{subject:'user_a'},{url:'https://private.example/'},{query:'a search'}])await assert.rejects(recordUsage(db,env,req,{events:[{...event(),...extra}]},deps),/Invalid request/);
  for(const [name,value]of [['DNT','1'],['Sec-GPC','1'],['User-Agent','HeadlessChrome']]){const privacy=request('/usage');privacy.headers.set(name,value);assert.equal((await recordUsage(db,env,privacy,{events:[event()]},deps)).accepted,0);}
  db.sql.prepare("UPDATE games SET status='removed' WHERE id='g_abc12'").run();await recordUsage(db,env,req,{events:[event()]},deps);
  assert.equal(db.sql.prepare('SELECT count FROM usage_daily').get().count,2);assert.equal((await usageMetrics(db,deps)).projects.length,0);db.close();
});
test('measurement expiry and hourly request limits bound receipts and aggregates',async()=>{
  const env=fixtureEnv(),db=env.DB;await importCatalog(db,fixtureCatalog());
  db.sql.prepare('INSERT INTO usage_daily VALUES(?,?,?,?,?)').run('2025-01-01','page_view','home','',9);
  db.sql.prepare('INSERT INTO usage_receipts VALUES(?,?)').run(crypto.randomUUID(),1);
  const req=request('/usage');for(let i=0;i<120;i++)await recordUsage(db,env,req,{events:[event('page_view',null)]},deps);
  await assert.rejects(recordUsage(db,env,req,{events:[event('page_view',null)]},deps),error=>error.status===429);
  assert.equal(db.sql.prepare('SELECT count(*) AS n FROM usage_daily').get().n,1);assert.equal(db.sql.prepare('SELECT count(*) AS n FROM usage_receipts').get().n,120);db.close();
});
test('insights require server-verified admin access and exclude private contributions',async()=>{
  const env=fixtureEnv(undefined,{CLERK_SECRET_KEY:'sk_test_'+'z'.repeat(40)}),db=env.DB;
  const worker=fixtureWorker(async()=>Response.json({id:'user_a',primary_email_address_id:'e',email_addresses:[{id:'e',email_address:'luciano.adonis.villarroel@gmail.com',verification:{status:'verified'}}]}));
  await importCatalog(db,fixtureCatalog());
  db.sql.prepare('INSERT INTO source_evidence VALUES(?,?,?,?,?)').run('abc12',JSON.stringify({state:'available',body:'I used Claude Sonnet 4.5 for a pixel art puzzle. Private-looking <script> text is just source data.'}),'hash',new Date(NOW).toISOString(),new Date(NOW).toISOString());
  db.sql.prepare('INSERT INTO follows VALUES(?,?,?)').run('private_account_123','g_abc12',new Date(NOW).toISOString());
  for(const path of ['/admin/insights','/admin/usage'])assert.equal((await worker.fetch(request(path),env)).status,401);
  const response=await worker.fetch(request('/admin/insights',{auth:await token()}),env);assert.equal(response.status,200);assert.equal(response.headers.get('Cache-Control'),'no-store');
  const page=await response.json();assert.deepEqual(page.games[0].observations[0].styles,['Pixel art']);assert.deepEqual(page.games[0].observations[0].models,['Claude Sonnet 4.5']);assert.equal(page.games[0].observations[0].coverage,'full-text');
  db.sql.prepare('INSERT INTO project_overrides(game_id,details_json,revision,updated_at,updated_by) VALUES(?,?,1,?,?)').run('g_abc12',JSON.stringify({projectUrl:'https://play.google.com/store/apps/details?id=example.game'}),new Date(NOW).toISOString(),'owner');
  assert.equal((await insightPage(db,null,deps)).games[0].distribution,'Google Play');
  assert.ok(!JSON.stringify(page).includes('private_account_123'));assert.equal(page.games[0].observations[0].body,undefined);
  db.sql.prepare('UPDATE source_evidence SET payload_json=?').run(JSON.stringify({state:'removed',body:'Claude Opus 4 pixel art'}));
  const removed=(await insightPage(db,null,deps)).games[0].observations[0];assert.equal(removed.coverage,'removed');assert.deepEqual(removed.models,[]);assert.deepEqual(removed.styles,[]);db.close();
});
test('focused studies exist, list only available topics and preserve admin revisions',async()=>{
  const env=fixtureEnv(),db=env.DB;await importCatalog(db,fixtureCatalog());await ensureResearch(db);
  assert.ok(builtInQuestionnaires.every(form=>validQuestions(form.questions)));
  let list=await researchList(db);assert.equal(list.questionnaires[0].id,'playtest');assert.ok(list.categories.includes('Difficulty'));assert.ok(!list.categories.includes('Custom'));
  const base=list.questionnaires.find(q=>q.id==='difficulty');await saveResearch(db,'difficulty',{title:'Our custom challenge study',category:base.category,gameId:null,questions:base.questions,active:false,revision:base.revision},{subject:'owner'},deps);
  await ensureResearch(db);list=await researchList(db);assert.ok(!list.categories.includes('Difficulty'));assert.equal((await researchList(db,true)).questionnaires.find(q=>q.id==='difficulty').title,'Our custom challenge study');db.close();
});
