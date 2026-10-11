import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeSteam, refreshSteam } from '../src/steam.mjs';
import { validateSteam } from '../../js/collection.js';
import { catalog, importCatalog } from '../src/store.mjs';
import { enqueueJobs, runJobs } from '../src/jobs.mjs';
import { fixtureEnv, fixtureCatalog, fixtureGame, NOW } from './helpers.mjs';
import { editDetails, detailsOf } from '../src/details.mjs';

const art='https://shared.akamai.steamstatic.com/store_item_assets/steam/apps/4610750/';
const payload=(overrides={})=>({'4610750':{success:true,data:{steam_appid:4610750,type:'demo',name:'Wayward Crown Demo',is_free:true,
  short_description:'Build a <b>kingdom</b> &amp; guide its people.',release_date:{coming_soon:false,date:'May 15, 2026'},
  fullgame:{appid:'4609640',name:'Wayward Crown'},platforms:{windows:true,mac:false,linux:'true'},
  screenshots:[{path_full:art+'one.jpg'},{path_full:art+'one.jpg'},{path_full:'https://private.example/pixel.jpg'}],
  genres:[{id:'2',description:'Strategy'}],categories:[{id:2,description:'Single-player'}],developers:['Robin H'],publishers:['Robin H'],header_image:art+'header.jpg',...overrides}}});
test('Steam enriches demo identity, parent, systems, description and allowlisted screenshots',()=>{
  const steam=normalizeSteam(payload(),'4610750',NOW);validateSteam(steam,steam.url);
  assert.equal(steam.releaseKind,'demo');assert.equal(steam.fullGame.appId,'4609640');
  assert.equal(steam.description,'Build a kingdom & guide its people.');assert.deepEqual(steam.platforms,['Windows']);
  assert.deepEqual(steam.screenshots,[art+'one.jpg']);assert.equal(steam.priceCents,0);assert.equal(steam.state,'released');
  assert.equal(normalizeSteam(payload({type:'game',genres:[{id:'70',description:'Early Access'}]}),'4610750',NOW).releaseKind,'early-access');
  assert.equal(normalizeSteam(payload({type:'game'}),'4610750',NOW).fullGame,null);
  assert.equal(normalizeSteam(payload({release_date:{coming_soon:true}}),'4610750',NOW).priceCents,null);
  assert.throws(()=>validateSteam({...steam,screenshots:['https://evil.example/a.jpg']},steam.url));
  assert.throws(()=>validateSteam({...steam,fullGame:{...steam.fullGame,url:'javascript:alert(1)'}},steam.url));
});
test('automatic Steam fields fill gaps while manual details and uploaded artwork win',async()=>{
  const env=fixtureEnv(),game=fixtureGame();game.projectUrl='https://store.steampowered.com/app/4610750/';game.summary=`Source post by u/${game.author.name}: ${game.title}`;
  await importCatalog(env.DB,fixtureCatalog([game]));
  await refreshSteam(env.DB,'4610750',{now:()=>NOW,fetch:async url=>{assert.equal(new URL(url).searchParams.has('filters'),false);return Response.json(payload());}});
  let result=(await catalog(env.DB)).games[0];assert.deepEqual(result.platforms,['Windows']);assert.equal(result.summary,'Build a kingdom & guide its people.');
  await editDetails(env.DB,game.id,{mode:'edit',revision:0,details:{...detailsOf(game),platforms:['Linux'],summary:'A saved editorial description.'}},{subject:'admin'},{now:()=>NOW});
  const preview={...game.preview,storage:'r2',rights:'owner-consent',url:'https://api.example/api/v1/media/11111111-1111-4111-8111-111111111111'};
  env.DB.sql.prepare("UPDATE games SET payload_json=json_set(payload_json,'$.preview',json(?)) WHERE id=?").run(JSON.stringify(preview),game.id);
  result=(await catalog(env.DB)).games[0];assert.equal(result.summary,'A saved editorial description.');assert.deepEqual(result.platforms,['Linux']);assert.deepEqual(result.preview,preview);env.DB.close();
});
test('malformed successful Steam responses retain the last verified result and retry later',async()=>{
  const env=fixtureEnv();await refreshSteam(env.DB,'4610750',{now:()=>NOW,fetch:async()=>Response.json(payload())});
  const stale=await refreshSteam(env.DB,'4610750',{now:()=>NOW+86400001,fetch:async()=>Response.json(payload({steam_appid:999}))});
  assert.equal(stale.checkedAt,new Date(NOW).toISOString());assert.equal(stale.fullGame.title,'Wayward Crown');env.DB.close();
});
test('editorial daily budget reserves attempts before work and resumes after the UTC reset',async()=>{
  const env=fixtureEnv(undefined,{EDITORIAL_DAILY_LIMIT:'2'});await importCatalog(env.DB,fixtureCatalog(['first','other','third'].map(id=>fixtureGame(id))));
  let now=NOW,calls=0;const deps={now:()=>now,sleep:async()=>{},fetch:async()=>{calls++;return new Response('Unavailable',{status:404});}};
  await enqueueJobs(env.DB,{kind:'links',scope:'all',gameId:null},{subject:'admin'},deps);
  assert.equal((await runJobs(env.DB,env,deps,2,'links')).processed,2);const count=calls;
  const capped=await runJobs(env.DB,env,deps,2,'links');assert.equal(capped.limited,true);assert.equal(capped.processed,0);assert.equal(calls,count);
  now+=86400000;assert.equal((await runJobs(env.DB,env,deps,2,'links')).processed,1);assert.ok(calls>count);env.DB.close();
});
