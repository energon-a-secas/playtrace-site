import test from 'node:test';import assert from 'node:assert/strict';
import {extractMentions,modelReleases} from '../js/insight-evidence.js';
import {trend,compareRelease,csv} from '../js/insight-analysis.js';
const post=(id,at,styles=[],models=[])=>({id,at,styles,models,engines:[],coverage:'title-excerpt'});
const game=(id,posts)=>({id,category:'puzzle',firstSeenAt:posts[0].at,observations:posts});
test('mentions preserve model versions and never infer a version from a generic tool name',()=>{
 const result=extractMentions('Not pixel art. I use Claude Code, GPT-5.4, Claude 3.5 Sonnet and Sonnet 4.5. Low-poly assets in Godot.');
 assert.deepEqual(result.styles,['Pixel art','Low poly']); // Mentions include negations; the UI explains this and shows the quote.
 assert.ok(result.evidence.find(e=>e.label==='Pixel art').text.includes('Not pixel art'));
 assert.deepEqual(result.models,['Claude Sonnet 4.5','Claude Sonnet 3.5','GPT-5.4']);
 assert.deepEqual(extractMentions('Claude Code and ChatGPT').models,['Claude (version not stated)','ChatGPT (version not stated)']);
 assert.deepEqual(extractMentions('Opus 5.5').models,['Claude Opus 5.5']);assert.ok(!modelReleases.some(m=>m.name==='Claude Opus 9.9'));
});
test('mention trends deduplicate projects per period, retain missingness and do not move a later mention into first-seen history',()=>{
 const a=game('a',[post('1','2025-01-01T00:00:00Z'),post('2','2025-03-01T00:00:00Z',['Pixel art']),post('3','2025-03-02T00:00:00Z',['Pixel art'])]);
 const b=game('b',[post('4','2025-03-03T00:00:00Z')]);
 const rows=trend([a,b],{dimension:'styles',value:'Pixel art'});assert.deepEqual(rows.map(r=>[r.period,r.total,r.count,r.unknown]),[['2025-01',1,0,1],['2025-02',0,0,0],['2025-03',2,1,1]]);
 assert.deepEqual(trend([a,b],{dimension:'category',value:'puzzle',grain:'quarter'}).map(r=>[r.period,r.total,r.count]),[['2025-Q1',2,2]]);
});
test('release windows are disjoint, use all observed projects as denominator, and flag partial or small samples',()=>{
 const release={date:'2025-02-01',mentions:['GPT-5']};const a=game('a',[post('1','2025-01-31T23:59:59Z',['Pixel art']),post('2','2025-02-01T00:00:00Z',['Pixel art'],['GPT-5'])]),b=game('b',[post('3','2025-02-03T00:00:00Z')]);
 const result=compareRelease([a,b],release,{dimension:'styles',value:'Pixel art',days:28,observedThrough:Date.parse('2025-02-10')});
 assert.equal(result.before.total,1);assert.equal(result.after.total,2);assert.equal(result.after.unknown,1);assert.equal(result.after.coMention,1);assert.equal(result.delta,-50);assert.ok(result.smallSample&&result.incompleteAfter);
 assert.equal(compareRelease([],release,{value:'Pixel art'}).delta,null);
});
test('CSV quotes source text and neutralizes spreadsheet formulas',()=>{assert.equal(csv([['=cmd','a"b','safe',3]]),'"\'=cmd","a""b","safe","3"');});
