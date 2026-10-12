import test from 'node:test';
import assert from 'node:assert/strict';
import { exactReleaseDate,releaseEvidence,releaseTimeline } from '../js/release-evidence.js';
import { collectInsightPages } from '../js/insight-snapshot.js';
import { selectPilot,pilotStratum } from '../scripts/pilot-selection.mjs';
import { extractMentions } from '../js/insight-evidence.js';

test('release dates reject vague, upcoming, impossible and future labels instead of inventing days',()=>{
  for(const value of ['2026','Q4 2026','Oct 2026','Coming soon','2026-02-30','29 Feb, 2025','32 Oct, 2026',''])assert.equal(exactReleaseDate(value),null,value);
  for(const value of ['2024-02-29','29 Feb, 2024','February 29, 2024'])assert.equal(exactReleaseDate(value),'2024-02-29');
  const steam={releaseDateLabel:'12 Oct, 2026',state:'released',checkedAt:'2026-10-12T12:00:00Z',appId:'123',releaseKind:'demo'};
  assert.equal(releaseEvidence(steam).date,'2026-10-12');
  assert.equal(releaseEvidence({...steam,state:'coming-soon'}).date,null);
  assert.equal(releaseEvidence({...steam,releaseDateLabel:'13 Oct, 2026'}).date,null);
});
test('release counts deduplicate a Steam app across showcases and preserve demo versus full release',()=>{
  const game=(id,appId,kind,date,first='2026-09-01')=>({id,firstSeenAt:first,storeRelease:{appId,provider:'Steam',date,state:'released',kind}});
  const result=releaseTimeline([game('a','1','demo','2026-06-01'),game('b','1','demo','2026-06-01','2026-08-01'),game('c','2','game','2026-08-01'),{id:'d',storeRelease:{state:'coming-soon'}}]);
  assert.deepEqual(result.entries.map(g=>g.id),['c','b']);assert.deepEqual(result.periods,[{month:'2026-06',game:0,demo:1,'early-access':0},{month:'2026-08',game:1,demo:0,'early-access':0}]);
});
test('a public evidence snapshot refuses partial, duplicate and changing pages',async()=>{
  const page=(games,next=null,generatedAt='r1')=>({version:1,generatedAt,games,pagination:{total:2,nextCursor:next}});
  let n=0;const complete=await collectInsightPages(async()=>++n===1?page([{id:'one'}],'two'):page([{id:'two'}]));assert.equal(complete.games.length,2);
  for(const next of [page([{id:'one'}]),page([{id:'two'}],null,'r2'),page([])]){let calls=0;await assert.rejects(collectInsightPages(async()=>++calls===1?page([{id:'one'}],'next'):next));}
});
test('the 100-project quality sample is repeatable across input order and includes older unlinked projects',()=>{
  const games=Array.from({length:180},(_,i)=>({id:`g_sample${i}`,firstSeenAt:`${2023+i%4}-01-01`,projectUrl:i%3===0?null:i%3===1?'https://maker.itch.io/game':'https://store.steampowered.com/app/123/'}));
  const a=selectPilot(games),b=selectPilot([...games].reverse());assert.equal(a.length,100);assert.deepEqual(a.map(g=>g.id),b.map(g=>g.id));assert.equal(new Set(a.map(pilotStratum)).size,12);assert.throws(()=>selectPilot(games,101));
});
test('model matching ignores URLs, avoids partial malformed versions, and preserves explicitly named image versions',()=>{
  assert.deepEqual(extractMentions('https://claude.ai/ https://chatgpt.site/GPT-5.5/ https://godot.example/pixel-art').models,[]);
  assert.deepEqual(extractMentions('https://godot.example/pixel-art').styles,[]);
  assert.deepEqual(extractMentions('Gemini 1.5Flah API').models,['Gemini (version not stated)']);
  assert.deepEqual(extractMentions('GPT-5.4. Opus 5.5.').models,['Claude Opus 5.5','GPT-5.4']);
  assert.deepEqual(extractMentions('gpt-image-1.5 and Nano Banana 2').models,['GPT-image-1.5','Nano Banana 2']);
  assert.ok(extractMentions('GPT-5 codex and Midjourney').models.includes('Midjourney'));
});
