import {readFile,writeFile} from 'node:fs/promises';
import {parseArgs} from 'node:util';
import {feedbackSample,validFeedbackBatch} from '../worker/src/insights.mjs';

// Reuse one complete archive window for a large campaign. This writes reviewed
// SQL only; it neither calls Jev nor publishes drafts or synthetic contributions.
const {values}=parseArgs({options:{catalog:{type:'string'},comments:{type:'string'},output:{type:'string'}}});
if(!values.catalog||!values.comments||!values.output)throw new Error('Use --catalog file --comments window.json --output path-prefix.');
const catalog=JSON.parse(await readFile(values.catalog,'utf8')),window=JSON.parse(await readFile(values.comments,'utf8'));
if(!window.complete||!Array.isArray(window.rows)||!Number.isFinite(Date.parse(window.windowStart))||!Number.isFinite(Date.parse(window.windowEnd)))throw new Error('A complete, dated archive window is required.');
const literal=value=>`'${value.replaceAll("'","''")}'`,statements=[],review=[];
for(const game of catalog.games.filter(game=>game.updatedAt>=window.windowStart)){
  const sample=feedbackSample(game,window.windowStart,window.windowEnd,window.rows);
  if(!validFeedbackBatch(sample,game,window.windowStart,Date.now()))throw new Error(`Invalid evidence for ${game.id}`);
  const sql=`UPDATE editorial_jobs SET payload_json=${literal(JSON.stringify({archiveBatch:sample}))} WHERE game_id=${literal(game.id)} AND kind='feedback' AND window_start=${literal(window.windowStart)} AND status='pending';`;
  if(Buffer.byteLength(sql)>99000)throw new Error(`Evidence for ${game.id} exceeds the statement bound.`);
  statements.push(sql);review.push({gameId:game.id,comments:sample.classifiedComments,eligibleComments:sample.eligibleComments,sampled:sample.sampled});
}
await writeFile(values.output+'.sql',statements.join('\n')+'\n');
await writeFile(values.output+'.json',JSON.stringify({windowStart:window.windowStart,windowEnd:window.windowEnd,archiveComments:window.rows.length,projects:review},null,2)+'\n');
console.log(JSON.stringify({projects:review.length,comments:review.reduce((n,row)=>n+row.comments,0)}));
