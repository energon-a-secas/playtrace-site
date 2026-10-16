import test from 'node:test';
import assert from 'node:assert/strict';
import { releaseWindow,storeListings,releaseCalendar } from '../js/store-insights.js';
import { extractMentions } from '../js/insight-evidence.js';
import { trend } from '../js/insight-analysis.js';
import { hostingSliceGames,hostingSlices } from '../js/hosting-charts.js';
import { highlightPanels,highlightImageHints } from '../js/highlight-view.js';
import { fixtureGame } from '../worker/tests/helpers.mjs';
import { pageMetadata } from '../worker/src/page-metadata.mjs';

test('release calendar keeps exact days, months, quarters and unknown dates distinct',()=>{
  assert.deepEqual(releaseWindow('Oct 23, 2026'),{precision:'day',date:'2026-10-23',month:'2026-10',label:'Oct 23, 2026'});
  assert.deepEqual(releaseWindow('October 2026'),{precision:'month',month:'2026-10',label:'October 2026'});
  assert.deepEqual(releaseWindow('Q4 2026'),{precision:'quarter',year:2026,quarter:4,label:'Q4 2026'});
  assert.equal(releaseWindow('2027').precision,'year');
  for(const value of ['Coming soon','To be announced','2026-02-30','Q5 2026'])assert.equal(releaseWindow(value).precision,'unspecified');
  const entries=['Oct 23, 2026','October 2026','Q4 2026','Coming soon','Oct 1, 2026','Q1 2026','2025'].map(label=>({provider:'Steam',state:'upcoming',planned:releaseWindow(label)}));
  const report=releaseCalendar(entries,'2026-10','2026-10-16');
  assert.equal(report.scheduled.length,2);assert.equal(report.broader.length,2);assert.equal(report.overdue.length,3);
});
test('store reports deduplicate listings using their newest metadata and keep unknown prices unknown',()=>{
  const base={id:'g_abc12',title:'One',projectUrl:'https://store.steampowered.com/app/123/One',storeProvider:'Steam',storeState:'coming-soon',storeCheckedAt:'2026-10-14',storeIsFree:false,priceCents:null,storeRelease:{label:'Coming soon'},demoAvailable:true};
  const games=[base,{...base,id:'g_other1',storeCheckedAt:'2026-10-15',storeState:'released',storePrice:{cents:499,currency:'USD'}},
    {id:'g_itch01',title:'Itch',projectUrl:'https://maker.itch.io/game',listingStatus:'In development',storeIsFree:null,browserBuild:true},
    {id:'g_itch02',title:'Itch duplicate',projectUrl:'https://maker.itch.io/game/download',listingStatus:'Released',storeCheckedAt:'2026-10-15',storePrice:{cents:0,currency:'USD'}},
    {id:'g_other2',title:'Browser',projectUrl:'https://example.com'}];
  const rows=storeListings(games);assert.equal(rows.length,2);
  const steam=rows.find(row=>row.provider==='Steam');assert.equal(steam.games.length,2);assert.equal(steam.state,'released');assert.equal(steam.pricing,'paid');
  assert.equal(storeListings([base])[0].pricing,'unknown');assert.equal(storeListings([games[2]])[0].pricing,'unknown');
  assert.equal(rows.find(row=>row.provider==='itch.io').pricing,'free');
});
test('technique evidence highlights blockout/paint-over and projection workflows with attributable excerpts',()=>{
  const text="Opus 5.5 built the village out of plain 3D blocks. Opus took a screenshot, sent it back to Codex, and had the blocks 'painted over' by referencing the concept art again. Opus built a shader that projects the painting back onto the blocks. Cel-shaded, with Blender and CC0 assets.";
  const result=extractMentions(text);
  assert.ok(result.techniques.includes('3D blockout → paint-over'));assert.ok(result.techniques.includes('Projection mapping'));
  assert.ok(result.resources.includes('Blender'));assert.ok(result.resources.includes('CC0 assets'));assert.ok(result.styles.includes('Cel shaded'));
  assert.ok(result.evidence.some(e=>e.kind==='techniques'&&e.text.includes('painted over')));
  assert.deepEqual(extractMentions('https://example.com/Blender/ControlNet/').resources,[]);
  assert.equal(extractMentions('I painted a landscape.').techniques.length,0);
  const game={id:'g_test1',observations:[{...result,id:'p1',at:'2026-10-01',coverage:'full-text'},{...result,id:'p2',at:'2026-10-02',coverage:'full-text'}]};
  assert.equal(trend([game],{dimension:'techniques',value:'Projection mapping'})[0].count,1);
});
test('Other destination drilldowns exactly match their pie slice and keep cross-device overlap',()=>{
  const games=['a.itch.io','store.steampowered.com','a.github.io','a.netlify.app','a.vercel.app','a.pages.dev','a.web.app','a.replit.app','example.com'].map((host,i)=>({id:String(i),platforms:['Windows',...(i===0?['Android']:[])],projectUrl:`https://${host}/game`}));
  assert.ok(hostingSlices(games,'desktop').rows.some(row=>row.label==='Other destinations'));
  for(const row of hostingSlices(games,'desktop').rows)assert.equal(hostingSliceGames(games,'desktop',row.label).length,row.count);
  assert.equal(hostingSliceGames(games,'mobile','itch.io').length,1);
});
test('home preloads visible artwork without eager mobile fetches or repeating the editor pick',()=>{
  const first=fixtureGame(),second=fixtureGame('second1');second.preview.url='https://i.redd.it/editor.jpg';second.preview.posterUrl=null;
  const picks=[{game:first},{game:second}],editor={game:second};
  const html=highlightPanels(picks,editor),hints=highlightImageHints(picks,editor);
  assert.equal((html.match(/data-highlight-id=/g)||[]).length,2);assert.equal((hints.match(/rel="preload"/g)||[]).length,2);
  assert.equal((hints.match(/fetchpriority="high"/g)||[]).length,1);assert.match(hints,/media="\(min-width: 901px\)"/);
  assert.match(html,/loading="eager" fetchpriority="high"/);assert.match(html,/loading="lazy"/);
  assert.notEqual(highlightPanels([{game:first}]),highlightPanels([{game:{...first,title:'Changed by an admin'}}]));
});
test('itch pricing needs an explicit unambiguous structured offer, never just a download button',()=>{
  const markup=offers=>`<script type="application/ld+json">${JSON.stringify({'@type':'Product',name:'Game',offers})}</script><a class="download_btn">Download</a>`;
  const url='https://maker.itch.io/game';
  assert.deepEqual(pageMetadata(markup({price:'0.00',priceCurrency:'USD'}),url).pricing,{cents:0,currency:'USD'});
  assert.deepEqual(pageMetadata(markup({price:4.99,priceCurrency:'EUR'}),url).pricing,{cents:499,currency:'EUR'});
  for(const offers of [undefined,{price:-1,priceCurrency:'USD'},{price:'',priceCurrency:'USD'},[{price:0,priceCurrency:'USD'},{price:10,priceCurrency:'USD'}]])assert.equal(pageMetadata(markup(offers),url).pricing,undefined);
  assert.equal(pageMetadata(markup({price:0,priceCurrency:'USD'}),'https://example.com').pricing,undefined);
  assert.equal(pageMetadata('<!--'+markup({price:0,priceCurrency:'USD'})+'-->',url).pricing,undefined);
  assert.equal(pageMetadata(markup([{price:0,priceCurrency:'USD'},{price:'unknown',priceCurrency:'USD'}]),url).pricing,undefined);
});
