import test from 'node:test';
import assert from 'node:assert/strict';
import { feedbackReport } from '../js/feedback-patterns.js';

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
