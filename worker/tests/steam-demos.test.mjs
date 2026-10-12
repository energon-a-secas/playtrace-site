import test from 'node:test';
import assert from 'node:assert/strict';
import { refreshSteam, refreshSteamBatch } from '../src/steam.mjs';
import { checkProject } from '../src/enrichment.mjs';
import { catalog, importCatalog } from '../src/store.mjs';
import { editDetails, detailsOf } from '../src/details.mjs';
import { insightPage } from '../src/catalogue-insights.mjs';
import { fixtureEnv, fixtureCatalog, fixtureGame } from './helpers.mjs';
import { validateSteam, distributionFor } from '../../js/collection.js';
import { verifiedSteamDemo } from '../../js/steam-demo.js';
import { playLink, playLabel } from '../../js/icons.js';
import { gamePageContent } from '../../js/game-page-view.js';
import { highlightPanels } from '../../js/highlight-view.js';
import { releaseTimeline } from '../../js/release-evidence.js';

const NOW=Date.now(),url=id=>`https://store.steampowered.com/app/${id}/`;
const payload=(id,overrides={})=>({[id]:{success:true,data:{steam_appid:Number(id),type:'game',name:'A game',is_free:false,
  release_date:{coming_soon:true,date:'Coming soon'},platforms:{windows:true},demos:[{appid:Number(id)+1}],...overrides}}});
const demo=(id,parent,overrides={})=>payload(id,{type:'demo',name:'A game demo',is_free:true,fullgame:{appid:parent,name:'A game'},
  release_date:{coming_soon:false,date:'Oct 7, 2026'},demos:[],...overrides});
const setup=async()=>{const env=fixtureEnv(),game={...fixtureGame(),projectUrl:url('100'),stage:'unknown'};await importCatalog(env.DB,fixtureCatalog([game]));return {env,game};};

test('a released demo gets the primary action without making its full game released',async()=>{
  const {env,game}=await setup(),calls=[];
  const deps={now:()=>NOW,fetch:async u=>{const id=new URL(u).searchParams.get('appids');calls.push(id);return Response.json(id==='100'?payload(id):demo(id,'100'));}};
  const check=await checkProject(env.DB,{},game.id,deps,true);
  const first=(await catalog(env.DB)).games[0];first.distribution=distributionFor(first.projectUrl);
  assert.deepEqual(calls,['100','101']);assert.equal(check.playable,true);
  assert.equal(first.stage,'playable');assert.equal(first.steam.state,'coming-soon');assert.equal(first.steam.priceCents,null);
  validateSteam(first.steam,game.projectUrl);assert.equal(playLabel(first),'Play demo');assert.match(playLink(first),/href="https:\/\/store.steampowered.com\/app\/101\/"/);
  const html=gamePageContent(first,fixtureCatalog([first]));assert.match(html,/Demo available · full game coming soon/);assert.match(html,/Full game on Steam/);
  assert.match(highlightPanels([{game:first}]),/href="https:\/\/store.steampowered.com\/app\/101\/"/);
  const insights=await insightPage(env.DB,null,deps),g=insights.games[0];assert.equal(g.demoAvailable,true);assert.equal(g.storeRelease.state,'coming-soon');assert.equal(g.demoRelease.kind,'demo');
  const timeline=releaseTimeline(insights.games);assert.equal(timeline.entries.length,1);assert.equal(timeline.entries[0].storeRelease.appId,'101');assert.equal(timeline.periods[0].game,0);
  await refreshSteam(env.DB,'100',deps);assert.equal(calls.length,2,'both apps use the daily cache');
  await editDetails(env.DB,game.id,{mode:'edit',revision:0,details:{...detailsOf(game),stage:'concept'}},{subject:'editor'},deps);
  assert.equal((await catalog(env.DB)).games[0].stage,'concept','explicit editorial stage is preserved');env.DB.close();
});

test('unreleased, mismatched, non-demo and paid apps cannot become a play-demo action',async()=>{
  for(const override of [{release_date:{coming_soon:true,date:'2027'}},{fullgame:{appid:'200',name:'Other game'}},{type:'game'},{is_free:false}]){
    const {env,game}=await setup();const steam=await refreshSteam(env.DB,'100',{now:()=>NOW,fetch:async u=>Response.json(new URL(u).searchParams.get('appids')==='100'?payload('100'):demo('101','100',override))});
    assert.equal(verifiedSteamDemo(steam),null);assert.equal((await catalog(env.DB)).games[0].stage,'unknown');
    assert.equal(playLabel({...game,steam,distribution:distributionFor(game.projectUrl)}),'View on Steam');env.DB.close();
  }
});

test('a failed demo lookup preserves the parent listing and never follows a demo chain',async()=>{
  const {env}=await setup(),calls=[];
  const steam=await refreshSteam(env.DB,'100',{now:()=>NOW,fetch:async u=>{const id=new URL(u).searchParams.get('appids');calls.push(id);if(id==='101')throw new Error('upstream timeout');return Response.json(payload(id));}});
  assert.equal(steam.appId,'100');assert.equal(steam.state,'coming-soon');assert.equal(steam.demo,undefined);assert.deepEqual(calls,['100','101']);env.DB.close();
  const second=await setup(),visited=[];
  await refreshSteam(second.env.DB,'100',{now:()=>NOW,fetch:async u=>{const id=new URL(u).searchParams.get('appids');visited.push(id);return Response.json(payload(id));}});
  assert.deepEqual(visited,['100','101']);second.env.DB.close();
});

test('stale demo evidence and withdrawn demo relationships revert to the main listing',async()=>{
  const {env,game}=await setup();let related=true;
  const deps={now:()=>NOW,fetch:async u=>Response.json(new URL(u).searchParams.get('appids')==='100'?payload('100',related?{}:{demos:[]}):demo('101','100'))};
  const steam=await refreshSteam(env.DB,'100',deps);
  assert.equal(verifiedSteamDemo(steam,NOW+7*86400000),null);assert.equal(verifiedSteamDemo(steam,NOW-1),null);
  const stale={...steam,demo:{...steam.demo,checkedAt:new Date(NOW-8*86400000).toISOString()}};
  assert.equal(playLabel({...game,steam:stale,distribution:distributionFor(game.projectUrl)}),'View on Steam');
  assert.match(playLink({...game,steam:stale}),/href="https:\/\/store.steampowered.com\/app\/100\/"/);
  related=false;const refreshed=await refreshSteam(env.DB,'100',{...deps,now:()=>NOW+86400000});assert.equal(refreshed.demo,undefined);
  assert.equal(verifiedSteamDemo(refreshed,NOW+86400000),null);env.DB.close();
});

test('related demo metadata is validated before becoming an outbound link',async()=>{
  const {env}=await setup();const steam=await refreshSteam(env.DB,'100',{now:()=>NOW,fetch:async u=>Response.json(new URL(u).searchParams.get('appids')==='100'?payload('100'):demo('101','100'))});
  for(const bad of [{...steam,demoAppIds:['100']},{...steam,demo:{...steam.demo,url:'https://unrelated.example/'}},{...steam,demo:{...steam.demo,platforms:['<script>']}},{...steam,demo:{...steam.demo,checkedAt:'not a date'}}])assert.throws(()=>validateSteam(bad,url('100')));
  env.DB.close();
});

test('the scheduled Steam batch keeps its six-request cap including demo lookups',async()=>{
  const env=fixtureEnv();await importCatalog(env.DB,fixtureCatalog(Array.from({length:6},(_,i)=>({...fixtureGame('demo'+i),projectUrl:url(String(100+i*2))}))));
  const calls=[],result=await refreshSteamBatch(env.DB,{now:()=>NOW,sleep:async()=>{},fetch:async u=>{const id=new URL(u).searchParams.get('appids');calls.push(id);return Response.json(Number(id)%2?demo(id,String(Number(id)-1)):payload(id));}});
  assert.equal(calls.length,6);assert.equal(result.requests,6);assert.equal(result.checked,3);assert.equal(result.remaining,3);env.DB.close();
});

test('release timeline deduplicates a demo linked from its parent and its own showcase',()=>{
  const demoRelease={appId:'101',provider:'Steam',kind:'demo',state:'released',date:'2026-10-07'};
  const result=releaseTimeline([{id:'parent',firstSeenAt:'2026-10-01',storeRelease:{state:'coming-soon'},demoRelease},{id:'demo',firstSeenAt:'2026-10-08',storeRelease:demoRelease}]);
  assert.equal(result.entries.length,1);assert.equal(result.periods[0].demo,1);assert.equal(result.periods[0].game,0);
});
