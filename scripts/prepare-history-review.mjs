// Reads a private backup and public, already-reviewed archive responses. Writes
// guarded SQL and a rehearsal report; never mutates the production database.
import fs from 'node:fs/promises';
import path from 'node:path';
import { LocalD1 } from './local-d1.mjs';
import { reviewedHistoryPlan,quote } from './reviewed-histories.mjs';
import { catalog } from '../worker/src/store.mjs';
import { checkProject } from '../worker/src/enrichment.mjs';
import { normalizePost } from '../worker/src/archive.mjs';
import { createCategory } from '../worker/src/categories.mjs';
import { validateCatalog } from '../js/collection.js';
const arg=name=>{const i=process.argv.indexOf('--'+name);return i<0?null:process.argv[i+1];};
const backup=arg('backup'),sourceFile=arg('sources'),out=arg('output');
if(!backup||!sourceFile||!out)throw new Error('Use --backup private.sql --sources reviewed-archive.json --output private-directory');
const maxChecks=Number(arg('max-checks')??8);if(!Number.isInteger(maxChecks)||maxChecks<0||maxChecks>12)throw new Error('Use 0–12 new destination checks');
await fs.mkdir(out,{recursive:true,mode:0o700});
const original=await fs.readFile(backup,'utf8'),db=new LocalD1(original),source=JSON.parse(await fs.readFile(sourceFile,'utf8'));
const decisions=JSON.parse(await fs.readFile(arg('reviews')||new URL('../data/history-reviewed-october12.json',import.meta.url),'utf8'));
const sql=[],reports=[],before=await catalog(db),now=Date.now(),at=new Date(now).toISOString();
const protectedTables=['project_overrides','preview_overrides','media_assets','feedback','ratings','follows','price_signals','play_expectations','research_responses','questionnaires','feedback_reviews','change_requests','removals'];
const snapshot=table=>JSON.stringify(db.sql.prepare(`SELECT * FROM ${table} ORDER BY rowid`).all());
const protectedBefore=Object.fromEntries(protectedTables.map(t=>[t,snapshot(t)]));
for(const review of decisions.groups){const plan=await reviewedHistoryPlan(db,review,source,now);db.sql.exec('BEGIN;'+plan.sql+'COMMIT;');sql.push(plan.sql);reports.push(plan.report);}
const guard=(table,row,where)=>`INSERT INTO app_meta(key,value_json) VALUES('enrichment_review_guard',CASE WHEN ${row?`EXISTS(SELECT 1 FROM ${table} WHERE ${Object.entries(row).map(([k,v])=>`${k} IS ${quote(v)}`).join(' AND ')})`:`NOT EXISTS(SELECT 1 FROM ${table} WHERE ${where})`} THEN 'true' ELSE NULL END) ON CONFLICT(key) DO UPDATE SET value_json=excluded.value_json;`;
for(const label of decisions.categories||[]){
 const {category,created}=await createCategory(db,{label},{subject:'operator:reviewed-history'},{now:()=>now});
 if(created){const row=db.sql.prepare('SELECT * FROM game_categories WHERE id=?').get(category.id);sql.push(guard('game_categories',null,`id=${quote(category.id)}`),`INSERT INTO game_categories(${Object.keys(row).join(',')}) VALUES(${Object.values(row).map(quote).join(',')});`);}
}
for(const fact of decisions.facts||[]){
 const raw=source.find(r=>`g_${r.id}`===fact.gameId),candidate=normalizePost(raw,now,{knownSource:true}),row=db.sql.prepare('SELECT * FROM games WHERE id=?').get(fact.gameId);
 if(!candidate||row?.status!=='published'||candidate.authorKey!==row.author_key||!['title','category','stage'].includes(fact.field)||(raw.title+' '+raw.selftext).toLowerCase().indexOf(fact.quote.toLowerCase())<0)throw new Error('Fact needs current matching source evidence');
 const post=db.sql.prepare('SELECT * FROM source_posts WHERE id=? AND game_id=? AND status=\'published\'').get(raw.id,fact.gameId);
 if(!post)throw new Error('Fact source is outside the current project');
 if(db.sql.prepare('SELECT 1 FROM project_facts WHERE game_id=? AND field=?').get(fact.gameId,fact.field))continue;
 const statements=[guard('games',row),guard('source_posts',post),guard('project_facts',null,`game_id=${quote(fact.gameId)} AND field=${quote(fact.field)}`),`INSERT INTO project_facts VALUES(${quote(fact.gameId)},${quote(fact.field)},${quote(JSON.stringify(fact.value))},${quote(candidate.post.url)},${quote(fact.quote)},${quote(at)});`];
 db.sql.exec(statements.join('\n'));sql.push(...statements);
}
const games=new Map((await catalog(db)).games.map(g=>[g.id,g]));
let requests=0,checks=0;const reused=[],checked=[],skipped=[];
const deps={now:()=>Date.now(),fetch:async(...args)=>{requests++;return fetch(...args);},sleep:ms=>new Promise(r=>setTimeout(r,ms))};
const cacheBefore=new Map(db.sql.prepare('SELECT * FROM steam_cache').all().map(r=>[r.app_id,r]));
for(const job of db.sql.prepare("SELECT * FROM editorial_jobs WHERE kind='store' AND status='pending' ORDER BY created_at,id").all()){
 const game=games.get(job.game_id);if(!game)continue;
 const old=db.sql.prepare('SELECT * FROM project_enrichment WHERE game_id=?').get(game.id),value=old&&old.project_url===game.projectUrl?JSON.parse(old.payload_json):null;
 const age=now-Date.parse(value?.storeCheckedAt||value?.checkedAt);
 const fresh=value?.status==='reachable'&&age>=0&&age<86400000&&(value.metadataVersion===2||game.steam?.metadataVersion===2);
 let result=value;
 if(fresh)reused.push(game.id);
 else {
  if(checks>=maxChecks){skipped.push(game.id);continue;}
  checks++;result=await checkProject(db,{},game.id,deps,true);checked.push({id:game.id,status:result.status,provider:result.provider||null});
  const updated=db.sql.prepare('SELECT * FROM project_enrichment WHERE game_id=?').get(game.id);
  if(updated){sql.push(guard('project_enrichment',old,`game_id=${quote(game.id)}`),`INSERT INTO project_enrichment(game_id,project_url,payload_json,checked_at) VALUES(${['game_id','project_url','payload_json','checked_at'].map(k=>quote(updated[k])).join(',')}) ON CONFLICT(game_id) DO UPDATE SET project_url=excluded.project_url,payload_json=excluded.payload_json,checked_at=excluded.checked_at;`);}
  await deps.sleep(500);
 }
 // The completed job points to the original observation time, never a newly
 // invented check date. No upstream request is made for reused evidence.
 const payload=JSON.stringify({...result,...(fresh?{reusedEvidence:true}:{} )});
 const statement=`UPDATE editorial_jobs SET status='ready',payload_json=${quote(payload)},updated_at=${quote(at)} WHERE id=${quote(job.id)};`;
 sql.push(guard('editorial_jobs',job),statement);db.sql.exec(statement);
}
for(const row of db.sql.prepare('SELECT * FROM steam_cache').all())if(JSON.stringify(row)!==JSON.stringify(cacheBefore.get(row.app_id))){sql.push(guard('steam_cache',cacheBefore.get(row.app_id),`app_id=${quote(row.app_id)}`),`INSERT INTO steam_cache(${Object.keys(row).join(',')}) VALUES(${Object.values(row).map(quote).join(',')}) ON CONFLICT(app_id) DO UPDATE SET ${Object.keys(row).filter(k=>k!=='app_id').map(k=>`${k}=excluded.${k}`).join(',')};`);}
sql.push(`UPDATE app_meta SET value_json=json_set(value_json,'$.generatedAt',${quote(at)}) WHERE key='catalog';`,"DELETE FROM app_meta WHERE key='enrichment_review_guard';");
for(const t of protectedTables)if(snapshot(t)!==protectedBefore[t])throw new Error('Protected data changed: '+t);
// Validate the actual file against the untouched snapshot, not just the working copy.
const verify=new LocalD1(original);try{verify.sql.exec('BEGIN;'+sql.join('\n')+'COMMIT;');const after=validateCatalog(await catalog(verify));
 for(const g of before.games.filter(g=>g.preview.storage==='r2'))if(JSON.stringify(after.games.find(p=>p.id===g.id)?.preview)!==JSON.stringify(g.preview))throw new Error('Approved preview changed');
 const report={at,histories:reports,projectsBefore:before.games.length,projectsAfter:after.games.length,sourcePostsBefore:before.games.reduce((n,g)=>n+g.posts.length,0),sourcePostsAfter:after.games.reduce((n,g)=>n+g.posts.length,0),protectedTablesUnchanged:protectedTables,reusedStoreResults:reused,newChecks:checked,upstreamRequests:requests,pendingSkipped:skipped};
 await fs.writeFile(path.join(out,'apply.sql'),sql.join('\n'),{mode:0o600});await fs.writeFile(path.join(out,'report.json'),JSON.stringify(report,null,2),{mode:0o600});await fs.writeFile(path.join(out,'catalog.json'),JSON.stringify({...after,snapshotAt:at}),{mode:0o600});
 console.log(JSON.stringify({...report,reusedStoreResults:reused.length},null,2));
}finally{verify.close();db.close();}
