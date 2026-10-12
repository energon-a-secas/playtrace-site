import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp,readFile,rm,access } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { buildSite,fetchCatalog,indexable } from '../scripts/build-site.mjs';
import { fixtureGame,fixtureCatalog } from '../worker/tests/helpers.mjs';
import { gameStructuredData } from '../js/game-page-view.js';
import { playLabel } from '../js/icons.js';
import { validateCatalog } from '../js/collection.js';

test('static game pages include their content, unique metadata and safe JSON without publishing private files',async()=>{
 const out=await mkdtemp(path.join(os.tmpdir(),'playtrace-build-'));
 try{
  const game=fixtureGame();game.title='A puzzle <script>alert(1)</script>';game.reviewStatus='reviewed';game.summary='A reviewed puzzle game with twelve rooms, a playable build and a clear source history.';
  const catalog=fixtureCatalog([game]);const result=await buildSite({catalog,out});
  assert.equal(result.games,1);const html=await readFile(path.join(out,'games/g_abc12/index.html'),'utf8');
  assert.match(html,/<h1 id="gameTitle">A puzzle &lt;script&gt;/);assert.match(html,/rel="canonical" href="https:\/\/playtrace.neorgon.com\/games\/g_abc12\/"/);
  assert.doesNotMatch(html,/<script>alert\(1\)/);assert.match(html,/\\u003cscript>/);assert.match(html,/Project history/);assert.match(html,/Player feedback/);
  assert.equal((html.match(/rel="canonical"/g)||[]).length,1);assert.equal((html.match(/<h1\b/g)||[]).length,1);
  assert.match(html,/src="\/js\/game-page\.js\?v=[a-f0-9]{12}"/);
  assert.match(await readFile(path.join(out,'js/game-page.js'),'utf8'),/from '\.\/api\.js\?v=[a-f0-9]{12}'/);
  assert.match(await readFile(path.join(out,'sitemap.xml'),'utf8'),/games\/g_abc12/);
  for(const file of ['worker/src/index.mjs','.env','docs/insights','data/historical-review.json'])await assert.rejects(access(path.join(out,file)));
  const schema=gameStructuredData(game,catalog);assert.equal(schema['@graph'][1]['@type'],'VideoGame');assert.equal(schema['@graph'][1].aggregateRating,undefined);
 }finally{await rm(out,{recursive:true,force:true});}
});
test('sparse source headlines stay accessible without being advertised as search-ready game pages',()=>{
 const game=fixtureGame();assert.equal(indexable(game),false);game.reviewStatus='reviewed';assert.equal(indexable(game),false);
 game.summary='A reviewed puzzle prototype with an original source and a description of how to play.';assert.equal(indexable(game),true);
});
test('publishing refuses partial, changing or duplicated catalogue snapshots',async()=>{
 const game=fixtureGame(),first={...fixtureCatalog([game]),pagination:{total:2,nextCursor:'next'}};
 const second={...fixtureCatalog([fixtureGame('other1')]),pagination:{total:2,nextCursor:null}};
 let i=0;const ok=await fetchCatalog(async()=>Response.json(i++?second:first));assert.equal(ok.games.length,2);
 i=0;await assert.rejects(fetchCatalog(async()=>Response.json(i++?{...second,generatedAt:'2026-10-11T00:00:00.000Z'}:first)),/changed/);
 await assert.rejects(fetchCatalog(async()=>Response.json({...first,pagination:{total:2,nextCursor:null}})),/missing/);
 i=0;await assert.rejects(fetchCatalog(async()=>Response.json(i++?{...second,games:[game]}:first)),/Duplicate/);
});
test('play actions distinguish confirmed demos, stores, playable browsers and repositories',()=>{
 const game={...fixtureGame(),distribution:{id:'steam'},steam:{type:'demo',state:'released'}};
 assert.equal(playLabel(game),'Play demo');game.steam.state='coming-soon';assert.equal(playLabel(game),'View on Steam');
 game.distribution={id:'website'};assert.equal(playLabel(game),'View game');game.platforms=['Browser'];game.stage='playable';assert.equal(playLabel(game),'Play it');
 game.distribution={id:'github',kind:'repository'};assert.equal(playLabel(game),'Source code');
});
test('merged histories publish canonical redirect pages without duplicating search results',async()=>{
 const out=await mkdtemp(path.join(os.tmpdir(),'playtrace-alias-'));
 try{
  const game={...fixtureGame(),aliases:['g_older1'],reviewStatus:'reviewed',summary:'A source-linked game with a complete development history and playable browser build.'};
  await buildSite({catalog:fixtureCatalog([game]),out});
  const html=await readFile(path.join(out,'games/g_older1/index.html'),'utf8');
  assert.match(html,/id="canonicalProject" href="\/games\/g_abc12\/"/);assert.match(html,/noindex, follow/);
  assert.match(html,/src="\/js\/alias-redirect.js\?v=/);assert.doesNotMatch(await readFile(path.join(out,'sitemap.xml'),'utf8'),/g_older1/);
  for(const aliases of [['../bad'],['g_abc12'],['g_older1','g_older1']])assert.throws(()=>validateCatalog(fixtureCatalog([{...game,aliases}])));
  assert.throws(()=>validateCatalog(fixtureCatalog([game,{...fixtureGame('other1'),aliases:['g_older1']}])));
 }finally{await rm(out,{recursive:true,force:true});}
});
