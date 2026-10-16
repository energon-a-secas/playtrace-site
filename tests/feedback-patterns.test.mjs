import test from 'node:test';
import assert from 'node:assert/strict';
import { feedbackReport } from '../js/feedback-patterns.js';
import { feedbackEvidence, feedbackResearchLeads, feedbackEvidenceCsv } from '../js/feedback-research.js';
import { researchLeadsMarkup, topicEvidenceMarkup } from '../js/feedback-research-view.js';
import { reviewMarkup } from '../js/feedback-review.js';

test('published summary coverage counts cited sources instead of missing or larger draft totals',()=>{
  const citation={number:1,url:'https://www.reddit.com/r/aigamedev/comments/abc12/_/comm1/',source:'reddit',body:'I played it.',author:'Player'};
  const review={summary:'A reported play session [1].',citations:[citation],classifiedComments:null,windowStart:'2026-10-01T00:00:00Z',windowEnd:'2026-10-12T00:00:00Z'};
  const selected=reviewMarkup(review);
  assert.match(selected,/1 cited Reddit comment ·/);assert.doesNotMatch(selected,/null|undefined|0 cited Playtrace/);
  const mixed=reviewMarkup({...review,classifiedComments:30,sources:{reddit:{classified:30},playtrace:{classified:10}},citations:[citation,{...citation,number:2,source:'playtrace',url:'https://playtrace.neorgon.com/games/g_abc12/#feedback-2'}]});
  assert.match(mixed,/1 cited Reddit comment · 1 cited Playtrace note/);assert.doesNotMatch(mixed,/30 archived|10 public/);
});

test('pattern filters keep missing context unknown, count source URLs once and avoid calling one project a trend',()=>{
  const citation={url:'https://www.reddit.com/comments/abc12/_/comm1/',source:'reddit',theme:'controls',tone:'concern'};
  const records=[{id:'g_abc12',feedback:[{experience:'unspecified',count:2,notes:1,choices:[{id:'controls',count:2}]}],review:{citations:[citation,citation,{...citation,url:'different',theme:null}]}}];
  const games=[{id:'g_abc12',category:'puzzle',distribution:'itch.io'}];
  const result=feedbackReport(records,games);assert.equal(result.counts.redditCitations,2);assert.equal(result.counts.unclassified,1);assert.equal(result.counts.unspecified,2);
  assert.equal(result.themes[0].contexts.unspecified.concern,1);assert.equal(result.themes[0].recurring,false);
  assert.equal(feedbackReport(records,games,{experience:'played'}).counts.projects,0);
  assert.equal(feedbackReport(records,games,{platform:'itch'}).counts.projects,0);
  assert.equal(feedbackReport(records,games,{platform:'itch.io',source:'reddit'}).counts.siteContributions,0);
  assert.equal(feedbackReport(records,games,{source:'playtrace'}).counts.redditCitations,0);
});

const project=(id,category='puzzle',distribution='itch.io')=>({id,title:id,category,distribution});
const comment=(number,theme,tone,experience='unspecified')=>({number,theme,tone,experience,source:'reddit',
  url:`https://www.reddit.com/r/aigamedev/comments/abc12/_/comment${number}/`,createdAt:'2026-10-10T12:00:00Z'});
const record=(game,citations,feedback=[])=>({id:game.id,feedback,review:{publishedAt:'2026-10-12T12:00:00Z',citations}});

test('research leads rank distinct projects before volume and do not turn praise or mixed reactions into concerns',()=>{
  const games=Array.from({length:6},(_,i)=>project('g_abc1'+i));
  const records=games.map((game,i)=>record(game,[comment(i,'visuals','praise'),comment(i+10,'pacing','mixed','played'),
    ...(i<3?[comment(i+20,'reliability','concern','played')]:[]),
    ...(i===0?[comment(30,'visuals','suggestion'),...Array.from({length:9},(_,n)=>comment(40+n,'controls','concern','played'))]:[])]));
  const report=feedbackReport(records,games),leads=feedbackResearchLeads(report);
  assert.deepEqual(leads.map(lead=>[lead.id,lead.count,lead.projects]),[['reliability',3,3],['controls',9,1],['visuals',1,1]]);
  assert.ok(report.themes.find(theme=>theme.id==='visuals').recurring);
  assert.ok(leads.every(lead=>!lead.recurring));
  records[1].review.citations.push(comment(60,'reliability','suggestion'),comment(61,'reliability','concern'));
  const repeated=feedbackResearchLeads(feedbackReport(records,games))[0];
  assert.equal(repeated.recurring,true);assert.deepEqual(repeated.contexts,{preview:0,played:3,unspecified:2});
});

test('topic evidence, filters and ranking share the same deduplicated source set',()=>{
  const games=[project('g_abc12'),project('g_abc13','action','Steam')];
  const played=comment(1,'controls','concern','played');
  const records=[record(games[0],[played,played,comment(2,'controls','praise','preview'),comment(3,null,null)]),
    record(games[1],[played,{...comment(4,'controls','suggestion','played'),source:'playtrace',url:'https://playtrace.neorgon.com/games/g_abc13/#feedback-4'}])];
  const report=feedbackReport(records,games);assert.equal(feedbackEvidence(report).length,4);
  assert.equal(feedbackEvidence(report,{topic:'controls'}).length,report.themes[0].count);
  assert.equal(feedbackEvidence(report,{topic:'unclassified'}).length,report.counts.unclassified);
  const scoped=feedbackReport(records,games,{category:'puzzle',platform:'itch.io',source:'reddit',experience:'played',gameId:'g_abc12'});
  assert.deepEqual(feedbackEvidence(scoped,{topic:'controls',tone:'actionable'}).map(row=>row.citation),[played]);
  assert.equal(feedbackResearchLeads(scoped)[0].count,1);
  assert.equal(feedbackEvidence(scoped,{topic:'controls',tone:'mixed'}).length,0);
  assert.equal(feedbackEvidence(report,{topic:'unknown'}).length,0);
});

test('expectation-only projects do not inflate comment counts when experience is filtered',()=>{
  const game=project('g_abc12'),records=[{...record(game,[]),expectations:{started:2,pairs:[{count:1,before:3,after:4,expectation:'better'}]}}];
  assert.equal(feedbackReport(records,[game]).counts.projects,1);
  const scoped=feedbackReport(records,[game],{experience:'played'});
  assert.equal(scoped.counts.projects,0);assert.equal(scoped.expectations.paired,1);
  assert.equal(feedbackReport(records,[game],{source:'reddit'}).expectations.started,0);
});

test('evidence CSV retains filter/window context, neutralizes formulas and exports no note bodies or identities',()=>{
  const game={...project('g_abc12'),title:'=HYPERLINK("bad")'},citation={...comment(1,'controls','concern','played'),body:'Not for the export',author:'Do not export identity',guestKey:'never-public'};
  const report=feedbackReport([record(game,[citation,comment(2,'visuals','mixed')])],[game]);
  const output=feedbackEvidenceCsv(report,{topic:'controls',tone:'actionable',filters:{experience:'played',category:'puzzle'},
    categories:[{id:'puzzle',label:'Puzzle'}],windowStart:'2026-08-13',windowEnd:'2026-10-12'});
  assert.equal(output.split('\r\n').length,2);assert.ok(output.includes('"\'=HYPERLINK(""bad"")"'));
  for(const value of ['2026-08-13','2026-10-12','Puzzle','Reported play','Controls & feel','Concerns & suggestions',citation.url])assert.ok(output.includes(value));
  for(const value of ['Not for the export','Do not export identity','never-public','comment2/'])assert.ok(!output.includes(value));
});

test('evidence presentation escapes source titles, keeps direct citations and offers an honest empty response',()=>{
  const game={...project('g_abc12'),title:'<img src=x onerror=alert(1)>'};
  const report=feedbackReport([record(game,[comment(1,'controls','concern','played')])],[game]);
  const html=topicEvidenceMarkup(report,{topic:'controls'});
  assert.ok(html.includes('&lt;img'));assert.ok(!html.includes('<img'));assert.ok(html.includes('target="_blank" rel="noopener noreferrer"'));
  assert.ok(html.includes('/games/g_abc12/#review-source-1'));assert.ok(html.includes('Reported play'));
  assert.ok(topicEvidenceMarkup(report,{topic:'controls',tone:'praise'}).includes('No reviewed comments match'));
  assert.ok(researchLeadsMarkup(report,{gameId:game.id}).includes('/feedback/?form=controls&amp;game=g_abc12'));
  report.projects[0].cited[0].url='javascript:alert(1)';assert.throws(()=>topicEvidenceMarkup(report,{topic:'controls'}),/Invalid source URL/);
});
