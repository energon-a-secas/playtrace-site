// Rebase a reviewed offline plan onto a fresh private backup. Concurrently
// changed project groups are left intact and listed for follow-up, never merged
// by guessing which edit should win. The resulting SQL still has equality guards.
import fs from 'node:fs/promises';
import path from 'node:path';
import { LocalD1 } from './local-d1.mjs';
import { splitSource } from '../worker/src/source-split.mjs';
import { catalog } from '../worker/src/store.mjs';
const arg=name=>process.argv[process.argv.indexOf('--'+name)+1];
if(['baseline','current','plan','output'].some(key=>!process.argv.includes('--'+key)))throw new Error('Use --baseline private.sql --current fresh.sql --plan private-plan-directory --output private-output-directory');
const out=arg('output'),plan=arg('plan');await fs.mkdir(out,{recursive:true,mode:0o700});
const original=await fs.readFile(arg('baseline'),'utf8'),fresh=await fs.readFile(arg('current'),'utf8');
const before=new LocalD1(original),target=new LocalD1(original),current=new LocalD1(fresh);
for(const db of [before,target,current])if(!db.sql.prepare("SELECT name FROM sqlite_master WHERE name='reddit_scores'").get())db.sql.exec(await fs.readFile(new URL('../worker/migrations/0013_reddit_scores.sql',import.meta.url),'utf8'));
const statements=await fs.readFile(path.join(plan,'apply.sql'),'utf8');
target.sql.exec('BEGIN');target.sql.exec(statements);target.sql.exec('COMMIT');
const keys={game_categories:['id'],games:['id'],source_posts:['id'],source_evidence:['post_id'],reddit_scores:['post_id'],steam_cache:['app_id'],project_enrichment:['game_id'],project_facts:['game_id','field'],editorial_jobs:['id']};
const quote=v=>v===null?'NULL':typeof v==='number'?String(v):"'"+String(v).replaceAll("'","''")+"'";
const key=(row,fields)=>JSON.stringify(fields.map(f=>row[f])),same=(a,b)=>JSON.stringify(a)===JSON.stringify(b);
const maps=db=>Object.fromEntries(Object.entries(keys).map(([t,k])=>[t,new Map(db.sql.prepare(`SELECT * FROM ${t}`).all().map(row=>[key(row,k),row]))]));
const old=maps(before),wanted=maps(target),live=maps(current),changes=[],dirty=new Set(),skipped=[];
for(const [table,fields] of Object.entries(keys))for(const [id,row]of wanted[table]){
  const previous=old[table].get(id),actual=live[table].get(id);if(same(previous,row)||same(actual,row))continue;
  const gameId=table==='games'?row.id:row.game_id||(['source_evidence','reddit_scores'].includes(table)?old.source_posts.get(JSON.stringify([row.post_id]))?.game_id:null);
  // A maintenance touch with identical source content does not invalidate an
  // editorial review. Preserve its newer check date while retaining full-row
  // equality guards against any subsequent edit or withdrawal.
  const checkOnly=table==='source_evidence'&&previous&&actual
    &&same({...previous,checked_at:null},{...actual,checked_at:null});
  if(checkOnly&&actual.checked_at>row.checked_at)row.checked_at=actual.checked_at;
  const conflict=!same(previous,actual)&&!checkOnly;
  if(conflict&&['games','source_posts','source_evidence'].includes(table)&&gameId)dirty.add(gameId);
  changes.push({table,fields,id,row,actual,gameId,conflict});
}
const output=[],counts={};
for(const c of changes){
  const {table,fields,row,actual,gameId}=c;
  const game=gameId?current.sql.prepare('SELECT status FROM games WHERE id=?').get(gameId):null;
  if(c.conflict||(dirty.has(gameId)&&table!=='reddit_scores')||(gameId&&(!game||game.status!=='published'))){skipped.push({table,id:c.id,reason:c.conflict?'Concurrent change retained':'Concurrent project group retained'});continue;}
  const condition=actual?`NOT EXISTS(SELECT 1 FROM ${table} WHERE ${Object.entries(actual).map(([f,v])=>`${f} IS ${quote(v)}`).join(' AND ')})`:`EXISTS(SELECT 1 FROM ${table} WHERE ${fields.map(f=>`${f}=${quote(row[f])}`).join(' AND ')})`;
  output.push(`INSERT INTO app_meta(key,value_json) VALUES('campaign_guard',CASE WHEN ${condition} THEN NULL ELSE 'true' END) ON CONFLICT(key) DO UPDATE SET value_json=excluded.value_json;`);
  output.push(`INSERT INTO ${table}(${Object.keys(row).join(',')}) VALUES(${Object.values(row).map(quote).join(',')}) ON CONFLICT(${fields.join(',')}) DO UPDATE SET ${Object.keys(row).filter(f=>!fields.includes(f)).map(f=>`${f}=excluded.${f}`).join(',')};`);
  counts[table]=(counts[table]||0)+1;
}
// Run the exact reviewed repair after the enrichment mutations on the same copy.
current.sql.exec('BEGIN');current.sql.exec(output.join('\n'));current.sql.exec('COMMIT');
const raw=JSON.parse(await fs.readFile(path.join(plan,'raw-sources.json'),'utf8'));
const batch=current.batch.bind(current);
current.batch=async rows=>{const result=await batch(rows);for(const s of rows){let i=0;output.push(s.sql.replace(/\?/g,()=>quote(s.args[i++]))+';');}return result;};
const splitCandidate=raw.find(row=>row.id==='1vspz2l');let split=null;
if(splitCandidate&&!current.sql.prepare('SELECT id FROM games WHERE id=?').get('g_1vspz2l'))split=await splitSource(current,'g_1vppapc',splitCandidate,
  'STARBATTLE explicitly describes Chapel Knights as a separate parallel project. Keep their source histories and model evidence separate.',
  'operator:catalogue-review-2026-10-12',Date.now());
const report=JSON.parse(await fs.readFile(path.join(plan,'report.json'),'utf8'));
// Replace older pilot diagnostics only while still ready; a dismissed or
// independently refreshed review is never reopened by the campaign.
for(const project of report.projects){
  const flags=project.id==='g_1vppapc'?project.flags.filter(f=>!f.startsWith('Identity review:')):project.flags;
  const value={pilot:'evidence-selection-v1',checkedAt:report.checkedAt,note:dirty.has(project.id)?'A concurrent refresh was retained for this project. These are source observations; no conflicting edits were applied.':'Source and destination evidence checked. Unknown fields are retained where evidence is absent; unavailable links are not proof of a deleted game.',flags,changes:project.changes,sourceChecks:project.posts.filter(p=>!split||project.id!=='g_1vppapc'||p.id!=='1vspz2l').map(p=>({id:p.id,url:p.url,state:p.state})),provenance:project.store?.provenance||{}};
  output.push(`UPDATE editorial_jobs SET payload_json=${quote(JSON.stringify(value))},updated_at=${quote(report.checkedAt)} WHERE game_id=${quote(project.id)} AND kind='references' AND status='ready' AND updated_at<=${quote(report.checkedAt)} AND json_extract(payload_json,'$.pilot') IN('evidence-100-v1','catalogue-refresh-v2','evidence-selection-v1');`);
}
const at=new Date().toISOString();output.push(`UPDATE app_meta SET value_json=json_set(value_json,'$.generatedAt',${quote(at)}) WHERE key='catalog';`,"DELETE FROM app_meta WHERE key='campaign_guard';");
// Validate the full combined transaction, its row-size bounds and public DTO.
const verification=new LocalD1(fresh);verification.sql.exec('BEGIN');verification.sql.exec(output.join('\n'));verification.sql.exec('COMMIT');
const result=await catalog(verification),publication={...result,generatedAt:at,snapshotAt:at};
if(output.some(sql=>Buffer.byteLength(sql)>99000))throw new Error('A statement exceeds the remote D1 bound');
await fs.writeFile(path.join(out,'apply.sql'),output.join('\n'),{mode:0o600});
await fs.writeFile(path.join(out,'catalogue-after.json'),JSON.stringify(publication),{mode:0o600});
await fs.writeFile(path.join(out,'rebase.json'),JSON.stringify({at,counts,skipped,concurrentProjects:[...dirty],split},null,2),{mode:0o600});
console.log(JSON.stringify({projects:result.games.length,changedRows:counts,skippedRows:skipped.length,concurrentProjects:dirty.size,statements:output.length}));
for(const db of [before,target,current,verification])db.close();
