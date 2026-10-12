import test from 'node:test';
import assert from 'node:assert/strict';
import { reviewedFeedback } from '../src/reviewed-feedback.mjs';
import { fixtureGame } from './helpers.mjs';
test('editorial summaries require unchanged, attributable, in-window comments and complete citation numbering',()=>{
 const game=fixtureGame(),body='The controls feel responsive.',createdAt='2026-10-09T11:00:00.000Z';
 const row={id:'comm1',link_id:'t3_abc12',author:'Player1',body,created_utc:Date.parse(createdAt)/1000};
 const draft={windowStart:'2026-10-01T00:00:00.000Z',windowEnd:'2026-10-10T00:00:00.000Z',classifiedComments:1,evidence:[{id:row.id,author:row.author,body,createdAt,url:'https://www.reddit.com/r/aigamedev/comments/abc12/_/comm1/'}]};
 const decision={gameId:game.id,commentIds:['comm1'],summary:'One commenter praised the responsiveness of the controls [1].'};
 assert.equal(reviewedFeedback(game,draft,decision,[row],createdAt).reviewedComments,1);
 const labels=[{number:1,theme:'controls',tone:'praise',experience:'played'}];
 assert.equal(reviewedFeedback(game,draft,{...decision,labels},[row],createdAt).citations[0].experience,'played');
 assert.equal(reviewedFeedback(game,draft,decision,[row],createdAt).citations[0].experience,'unspecified');
 for(const labels of [[],[{number:2,theme:'controls',tone:'praise',experience:'played'}],[{number:1,theme:'fiction',tone:'praise',experience:'played'}],[{number:1,theme:'controls',tone:'praise',experience:'guessed'}]])assert.throws(()=>reviewedFeedback(game,draft,{...decision,labels},[row],createdAt));
 for(const change of [{body:'[deleted]'},{body:'Actually I dislike the controls.'},{link_id:'t3_other'},{author:game.author.name},{created_utc:0}])assert.throws(()=>reviewedFeedback(game,draft,decision,[{...row,...change}],createdAt));
 assert.throws(()=>reviewedFeedback(game,draft,{...decision,summary:decision.summary.replace('[1]','[2]')},[row],createdAt));
});
