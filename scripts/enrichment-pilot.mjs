// Operator preparation only. Reads a private D1 backup and public upstreams;
// produces guarded SQL for inspection. It never applies production mutations.
import fs from 'node:fs/promises';
import path from 'node:path';
import { createHash, randomUUID } from 'node:crypto';
import { LocalD1 } from './local-d1.mjs';
import { catalog } from '../worker/src/store.mjs';
import { refreshSourceRecords } from '../worker/src/source-evidence.mjs';
import { archiveJson } from '../worker/src/references.mjs';
import { checkProject } from '../worker/src/enrichment.mjs';
import { extractMentions } from '../js/insight-evidence.js';
import { selectPilot, pilotStratum } from './pilot-selection.mjs';
import { createCategory } from '../worker/src/categories.mjs';
import { repostFlags } from '../worker/src/duplicates.mjs';

const arg=name=>{const i=process.argv.indexOf('--'+name);return i<0?null:process.argv[i+1];};
const backup=arg('backup'),out=arg('output');
if(!backup||!out)throw new Error('Usage: node scripts/enrichment-pilot.mjs --backup /private/backup.sql --output /private/pilot');
await fs.mkdir(out,{recursive:true,mode:0o700});await fs.chmod(backup,0o600);
const save=(name,data)=>fs.writeFile(path.join(out,name),JSON.stringify(data,null,2)+'\n',{mode:0o600});
const db=new LocalD1(await fs.readFile(backup,'utf8'));
if(!db.sql.prepare("SELECT name FROM sqlite_master WHERE name='project_facts'").get())db.sql.exec(await fs.readFile(new URL('../worker/migrations/0012_reviewed_project_facts.sql',import.meta.url),'utf8'));
if(!db.sql.prepare("SELECT name FROM sqlite_master WHERE name='reddit_scores'").get())db.sql.exec(await fs.readFile(new URL('../worker/migrations/0013_reddit_scores.sql',import.meta.url),'utf8'));
const before=await catalog(db),selection=arg('selection');
const all=process.argv.includes('--all'),dueOnly=process.argv.includes('--due-only');
const savedSelection=selection?JSON.parse(await fs.readFile(selection,'utf8')):null;
const selected=savedSelection?savedSelection.games.map(item=>before.games.find(game=>game.id===item.id)):all?before.games:selectPilot(before.games);
if(selected.some(game=>!game)||new Set(selected.map(game=>game.id)).size!==selected.length)throw new Error('Saved selection contains missing or repeated projects; review before continuing.');
if(!selected.length||selected.length>2000||!all&&!savedSelection&&selected.length!==100)throw new Error('Expected a complete pilot or an explicit bounded selection.');
const ids=new Set(selected.map(game=>game.id)),sourceIds=[...new Set(selected.flatMap(game=>game.posts.map(post=>post.id)))];
const at=new Date().toISOString(),stamp=at.slice(0,10),plan={version:1,asOf:at,method:'Deterministic balanced quality sample across first-shared year and destination, plus four regression sentinels; not a representative market sample.',games:selected.map(game=>({id:game.id,title:game.title,stratum:pilotStratum(game),sourceIds:game.posts.map(post=>post.id)}))};
if(all)plan.method='All currently published catalogue projects; source and due destination refresh. A community archive, not a representative games market sample.';
if(savedSelection)plan.method=savedSelection.method||'Explicit operator-selected quality batch; not a representative sample.';
await save('plan.json',plan);
if(process.argv.includes('--plan-only')){console.log(JSON.stringify({projects:selected.length,posts:sourceIds.length,strata:[...new Set(selected.map(pilotStratum))]}));db.close();process.exit(0);}
const sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms));
// No credentials are used or cached. Cache only successful public responses;
// a rate limit interrupts the run and may be retried after the stated time.
const deps={now:()=>Date.now(),sleep,fetch:async(url,options={})=>{
  if(options.headers?.Authorization)throw new Error('Pilot fetcher accepts public requests only.');
  const key=createHash('sha256').update(String(url)).digest('hex'),file=path.join(out,'fetch-'+key+'.json');
  try{
    const cached=JSON.parse(await fs.readFile(file,'utf8'));
    const collectedAt=cached.collectedAt??(await fs.stat(file)).mtimeMs;
    const age=Date.now()-collectedAt;
    if(age>=0&&age<24*60*60*1000)return new Response(cached.body,{status:cached.status,headers:cached.headers});
  }catch{}
  const response=await fetch(url,options);
  if(response.ok){const copy=response.clone(),body=await copy.text();if(body.length<=8*1024*1024)await save('fetch-'+key+'.json',{collectedAt:Date.now(),status:response.status,headers:Object.fromEntries(response.headers),body});}
  return response;
}};
const protectedTables=['project_overrides','preview_overrides','media_assets','feedback','ratings','research_responses','price_signals','follows'];
const checksum=table=>createHash('sha256').update(JSON.stringify(db.sql.prepare(`SELECT * FROM ${table} ORDER BY rowid`).all())).digest('hex');
const protectedBefore=Object.fromEntries(protectedTables.map(table=>[table,checksum(table)]));
const tables={game_categories:['id'],games:['id'],source_posts:['id'],source_evidence:['post_id'],reddit_scores:['post_id'],steam_cache:['app_id'],project_enrichment:['game_id'],project_facts:['game_id','field']};
const rowKey=(row,keys)=>JSON.stringify(keys.map(key=>row[key]));
const originals=Object.fromEntries(Object.entries(tables).map(([table,keys])=>[table,new Map(db.sql.prepare(`SELECT * FROM ${table}`).all().map(row=>[rowKey(row,keys),row]))]));
const raw=[];let sourceResult={checked:0,changed:0,updatedGames:0};
const sourceBatch=all||savedSelection?100:10;
for(let i=0;i<sourceIds.length;i+=sourceBatch){
  const batch=sourceIds.slice(i,i+sourceBatch),rows=await archiveJson('posts/ids?ids='+batch.join(','),deps);raw.push(...rows.filter(row=>batch.includes(row.id)));
  const result=await refreshSourceRecords(db,rows.filter(row=>batch.includes(row.id)),deps);
  for(const key of Object.keys(sourceResult))sourceResult[key]+=result[key];
  console.log(`Source evidence ${Math.min(i+sourceBatch,sourceIds.length)}/${sourceIds.length}`);await sleep(500);
}
await save('raw-sources.json',raw);
const checkedIds=new Set();
for(const game of (await catalog(db)).games.filter(game=>ids.has(game.id))){
  const fresh=game.availability&&Date.now()-Date.parse(game.availability.checkedAt)<7*86400000;
  const needsStore=/^https:\/\/(?:[^/]+\.itch\.io|store\.steampowered\.com)\//.test(game.projectUrl||'')
    && (!game.availability?.provider || (game.availability.provider==='itch'&&game.availability.metadataVersion!==2)
      || (game.availability.provider==='steam'&&game.steam?.metadataVersion!==2));
  if(game.projectUrl&&(!dueOnly||!fresh||needsStore)){await checkProject(db,{},game.id,deps,true);checkedIds.add(game.id);console.log(`Destination checked ${checkedIds.size}: ${game.id}`);await sleep(500);}
}
const enrichedBeforeReview=new Map((await catalog(db)).games.map(game=>[game.id,game]));
const reviews=JSON.parse(await fs.readFile(arg('reviews')||new URL('../data/pilot-reviewed-facts.json',import.meta.url),'utf8'));
const plain=value=>String(value).replace(/[\\*_]/g,'').replace(/\s+/g,' ').trim().toLowerCase();
for(const label of Object.values(reviews.categories))await createCategory(db,{label},{subject:'operator-pilot'},deps);
for(const fact of reviews.facts){
  if(!ids.has(fact.gameId)||!['title','summary','category','stage','platforms','projectUrl','repositoryUrl'].includes(fact.field))throw new Error('Review is outside the pilot.');
  const game=enrichedBeforeReview.get(fact.gameId),posts=raw.filter(post=>game.posts.some(source=>source.id===post.id));
  const store=game.availability,steam=game.steam;
  const citedPost=posts.find(post=>game.posts.some(source=>source.id===post.id&&source.url===fact.sourceUrl));
  const evidence=citedPost?citedPost.title+' '+citedPost.selftext
    :fact.sourceUrl===game.projectUrl||fact.sourceUrl===store?.sourceUrl?JSON.stringify({store,steam}):'';
  const existing=db.sql.prepare('SELECT * FROM project_facts WHERE game_id=? AND field=?').get(fact.gameId,fact.field);
  if(existing)continue; // A later editorial fact is never replaced by this pilot.
  if(!plain(evidence).includes(plain(fact.evidence)))throw new Error('Reviewed quote could not be located: '+fact.gameId+' '+fact.field);
  db.sql.prepare('INSERT INTO project_facts VALUES(?,?,?,?,?,?)').run(fact.gameId,fact.field,JSON.stringify(fact.value),fact.sourceUrl,fact.evidence,new Date(deps.now()).toISOString());
}
let checked=0;
const effective=(await catalog(db)).games.filter(game=>ids.has(game.id));
for(const game of effective){if(game.projectUrl&&game.projectUrl!==enrichedBeforeReview.get(game.id)?.projectUrl){await checkProject(db,{},game.id,deps,true);checkedIds.add(game.id);console.log(`Corrected destination checked: ${game.id}`);}}
checked=checkedIds.size;
const after=await catalog(db),afterById=new Map(after.games.map(game=>[game.id,game]));
const duplicates=repostFlags(after.games);
for(const table of protectedTables)if(checksum(table)!==protectedBefore[table])throw new Error('Protected table changed: '+table);
for(const game of before.games){
  const current=afterById.get(game.id);if(!current)throw new Error('A project disappeared');
  if(game.preview.storage==='r2'&&JSON.stringify(game.preview)!==JSON.stringify(current.preview))throw new Error('Approved preview changed');
}
const fields=['title','summary','category','stage','platforms','projectUrl','repositoryUrl'];
const report={version:1,checkedAt:new Date().toISOString(),method:plan.method,sourceResult,projectCount:selected.length,checkedDestinations:checked,protectedTablesUnchanged:protectedTables,projects:selected.map(old=>{
  const game=afterById.get(old.id),posts=game.posts.map(post=>{const row=db.sql.prepare('SELECT payload_json,checked_at FROM source_evidence WHERE post_id=?').get(post.id),source=row?JSON.parse(row.payload_json):null;return {id:post.id,url:post.url,state:source?.state||'not-found',fullText:Boolean(source?.state==='available'&&source.body),characters:source?.body?.length||0,checkedAt:row?.checked_at||null,...extractMentions(source?.state==='available'?`${post.title}\n${source.body}`:'')};});
  const changes=fields.filter(key=>JSON.stringify(old[key])!==JSON.stringify(game[key])).map(field=>({field,before:old[field]??null,after:game[field]??null}));
  const flags=[...(reviews.flags[game.id]||[])];for(const pair of duplicates.filter(pair=>pair.gameId===game.id||pair.otherId===game.id))flags.push(`Possible duplicate: ${pair.reason} (${pair.gameId===game.id?pair.otherId:pair.gameId})`);
  if(!game.projectUrl)flags.push('No game destination');if(['broken','blocked','unverified'].includes(game.availability?.status))flags.push('Destination '+game.availability.status);
  if(game.category==='other')flags.push('Genre needs review');if(game.stage==='unknown')flags.push('Build status needs review');
  if(game.title.length>100)flags.push('Headline needs a game name');if(posts.some(post=>post.state!=='available'))flags.push('Source availability needs review');
  return {id:game.id,title:game.title,stratum:pilotStratum(old),projectUrl:game.projectUrl,firstShared:game.firstSeenAt,release:game.steam?{provider:'Steam',dateLabel:game.steam.releaseDateLabel,kind:game.steam.releaseKind,state:game.steam.state}:null,changes,flags,posts,store:game.availability||null};
})};
await save('report.json',report);await save('catalogue-after.json',{...after,generatedAt:report.checkedAt,snapshotAt:report.checkedAt});
// Equality guards for every changed row prevent this offline preparation from
// overwriting an intervening import, moderation action or maintenance result.
const quote=value=>value===null?'NULL':typeof value==='number'?String(value):"'"+String(value).replace(/'/g,"''")+"'";
const statements=[],counts={};
for(const [table,keys]of Object.entries(tables)){
  for(const row of db.sql.prepare(`SELECT * FROM ${table}`).all()){
    const old=originals[table].get(rowKey(row,keys));if(JSON.stringify(old)===JSON.stringify(row))continue;
    if(['games','project_enrichment','project_facts'].includes(table)&&!ids.has(row[keys[0]]))throw new Error('Unexpected project mutation');
    if(['source_posts','source_evidence','reddit_scores'].includes(table)&&!sourceIds.includes(row[keys[0]]))throw new Error('Unexpected source mutation');
    const condition=old?`NOT EXISTS(SELECT 1 FROM ${table} WHERE ${Object.entries(old).map(([field,value])=>`${field} IS ${quote(value)}`).join(' AND ')})`:`EXISTS(SELECT 1 FROM ${table} WHERE ${keys.map(key=>`${key}=${quote(row[key])}`).join(' AND ')})`;
    statements.push(`INSERT INTO app_meta(key,value_json) VALUES('pilot_apply_guard',CASE WHEN ${condition} THEN NULL ELSE 'true' END) ON CONFLICT(key) DO UPDATE SET value_json=excluded.value_json;`);
    statements.push(`INSERT INTO ${table}(${Object.keys(row).join(',')}) VALUES(${Object.values(row).map(quote).join(',')}) ON CONFLICT(${keys.join(',')}) DO UPDATE SET ${Object.keys(row).filter(field=>!keys.includes(field)).map(field=>`${field}=excluded.${field}`).join(',')};`);
    counts[table]=(counts[table]||0)+1;
  }
}
// Preserve the complete review record in the existing admin queue. It contains
// public evidence only and cannot publish a generated feedback review.
for(const project of report.projects){
  const value={pilot:all?'catalogue-refresh-v2':savedSelection?'evidence-selection-v1':'evidence-100-v1',checkedAt:report.checkedAt,note:`${selected.length}-project enrichment review. Check the flagged facts before editing; manual details and approved images were preserved.`,flags:project.flags,changes:project.changes,sourceChecks:project.posts.map(post=>({id:post.id,url:post.url,state:post.state})),provenance:project.store?.provenance||{},release:project.release};
  statements.push(`INSERT INTO editorial_jobs(id,game_id,kind,window_start,status,payload_json,created_at,updated_at,requested_by) SELECT ${quote(randomUUID())},id,'references',${quote(stamp+'T00:00:00.000Z')},'ready',${quote(JSON.stringify(value))},${quote(report.checkedAt)},${quote(report.checkedAt)},'operator-pilot' FROM games WHERE id=${quote(project.id)} AND status='published' AND NOT EXISTS(SELECT 1 FROM removals WHERE game_id=games.id) ON CONFLICT(game_id,kind,window_start) DO NOTHING;`);
}
statements.push(`UPDATE app_meta SET value_json=json_set(value_json,'$.generatedAt',${quote(report.checkedAt)}) WHERE key='catalog';`,`DELETE FROM app_meta WHERE key='pilot_apply_guard';`);
await fs.writeFile(path.join(out,'apply.sql'),statements.join('\n'),{mode:0o600});
console.log(JSON.stringify({projects:selected.length,sources:sourceResult,checkedDestinations:checked,changedRows:counts,flagged:report.projects.filter(game=>game.flags.length).length,protectedTablesUnchanged:true,output:out}));db.close();
