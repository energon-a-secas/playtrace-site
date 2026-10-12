// Prepare an explicitly reviewed selection. No automatic publication or model
// calls: inspect apply.sql, then apply with the operator's normal D1 workflow.
import fs from 'node:fs/promises';
import path from 'node:path';
import { LocalD1 } from './local-d1.mjs';
import { archiveJson } from '../worker/src/references.mjs';
import { reviewedFeedback } from '../worker/src/reviewed-feedback.mjs';

const arg=name=>process.argv[process.argv.indexOf('--'+name)+1];
const backup=arg('backup'),decisions=arg('reviews'),out=arg('output');
if(!process.argv.includes('--backup')||!process.argv.includes('--reviews')||!process.argv.includes('--output'))throw new Error('Use --backup private.sql --reviews reviewed.json --output private-directory');
await fs.mkdir(out,{recursive:true,mode:0o700});
const db=new LocalD1(await fs.readFile(backup,'utf8'));
const plan=JSON.parse(await fs.readFile(decisions,'utf8'));
if(plan.version!==1||!Array.isArray(plan.reviews)||new Set(plan.reviews.map(r=>r.gameId)).size!==plan.reviews.length)throw new Error('Invalid review selection');
const deps={fetch,now:()=>Date.now(),sleep:ms=>new Promise(resolve=>setTimeout(resolve,ms))};
const ids=[...new Set(plan.reviews.flatMap(r=>r.commentIds))],comments=[];
for(let i=0;i<ids.length;i+=100)comments.push(...await archiveJson('comments/ids?ids='+ids.slice(i,i+100).join(','),deps));
const quote=value=>"'"+String(value).replaceAll("'","''")+"'",statements=[],published=[];
const at=new Date().toISOString();
for(const decision of plan.reviews){
  const gameRow=db.sql.prepare("SELECT payload_json FROM games WHERE id=? AND status='published' AND NOT EXISTS(SELECT 1 FROM removals WHERE game_id=games.id)").get(decision.gameId);
  const job=db.sql.prepare("SELECT * FROM editorial_jobs WHERE game_id=? AND kind='feedback' AND status='ready' ORDER BY window_start DESC LIMIT 1").get(decision.gameId);
  if(!job||!gameRow)throw new Error('Project or ready draft unavailable: '+decision.gameId);
  const game=JSON.parse(gameRow.payload_json),data=JSON.parse(job.payload_json);
  const review=reviewedFeedback(game,data,decision,comments,at);
  const exists=db.sql.prepare('SELECT payload_json FROM feedback_reviews WHERE game_id=?').get(game.id);
  if(exists)throw new Error('Existing published review needs a separate replacement decision: '+game.id);
  const sources=review.citations.map(c=>new URL(c.url).pathname.split('/')[4]);
  statements.push(`INSERT INTO app_meta(key,value_json) VALUES('feedback_review_guard',CASE WHEN EXISTS(SELECT 1 FROM editorial_jobs WHERE id=${quote(job.id)} AND status='ready' AND payload_json=${quote(job.payload_json)}) AND EXISTS(SELECT 1 FROM games WHERE id=${quote(game.id)} AND status='published' AND NOT EXISTS(SELECT 1 FROM removals WHERE game_id=games.id)) AND NOT EXISTS(SELECT 1 FROM feedback_reviews WHERE game_id=${quote(game.id)}) AND NOT EXISTS(SELECT 1 FROM json_each(${quote(JSON.stringify(sources))}) j WHERE NOT EXISTS(SELECT 1 FROM source_posts p WHERE p.id=j.value AND p.game_id=${quote(game.id)} AND p.status='published')) THEN 'true' ELSE NULL END) ON CONFLICT(key) DO UPDATE SET value_json=excluded.value_json;`);
  statements.push(`INSERT INTO feedback_reviews(game_id,payload_json,published_at,published_by) VALUES(${quote(game.id)},${quote(JSON.stringify(review))},${quote(at)},'operator:reviewed-feedback-2026-10-12');`);
  statements.push(`UPDATE editorial_jobs SET status='published',payload_json=${quote(JSON.stringify({...data,...review}))},updated_at=${quote(at)} WHERE id=${quote(job.id)};`);
  published.push({gameId:game.id,title:game.title,citations:review.citations.length,summary:review.summary});
}
statements.push("DELETE FROM app_meta WHERE key='feedback_review_guard';");
await fs.writeFile(path.join(out,'apply.sql'),statements.join('\n'),{mode:0o600});
await fs.writeFile(path.join(out,'review.json'),JSON.stringify({at,reviews:published},null,2),{mode:0o600});
// Rehearse the guarded transaction against the baseline before it can be used.
db.sql.exec('BEGIN');try{db.sql.exec(statements.join('\n'));db.sql.exec('ROLLBACK');}catch(error){db.sql.exec('ROLLBACK');throw error;}
console.log(JSON.stringify({prepared:published.length,citations:published.reduce((n,r)=>n+r.citations,0),verifiedAgainstArchive:comments.length}));db.close();
