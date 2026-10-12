// Public creator replies can supply a missing destination, but must be reviewed:
// a creator can also be recommending someone else's game in the same thread.
import fs from 'node:fs/promises';
import path from 'node:path';
import { LocalD1 } from './local-d1.mjs';
import { catalog } from '../worker/src/store.mjs';
import { validateGame } from '../worker/src/validation.mjs';
import { checkProject } from '../worker/src/enrichment.mjs';
const arg=name=>process.argv[process.argv.indexOf('--'+name)+1];
if(['backup','evidence','reviews','output'].some(k=>!process.argv.includes('--'+k)))throw new Error('Use --backup private.sql --evidence creator-comments.json --reviews accepted.json --output private-directory');
const backup=await fs.readFile(arg('backup'),'utf8'),db=new LocalD1(backup),out=arg('output');
await fs.mkdir(out,{recursive:true,mode:0o700});
const rows=JSON.parse(await fs.readFile(arg('evidence'),'utf8')),facts=JSON.parse(await fs.readFile(arg('reviews'),'utf8')).facts;
const before=await catalog(db),byId=new Map(before.games.map(g=>[g.id,g])),at=new Date().toISOString(),ids=new Set(),statements=[];
const quote=v=>v===null?'NULL':typeof v==='number'?String(v):"'"+String(v).replaceAll("'","''")+"'";
const plain=s=>s.replace(/[\\*_]/g,'').replace(/\s+/g,' ').trim();
for(const fact of facts){
 const game=byId.get(fact.gameId),comment=rows.find(r=>r.gameId===fact.gameId)?.evidence.find(c=>fact.sourceUrl===`https://www.reddit.com/r/aigamedev/comments/${String(c.link_id).replace(/^t3_/,'')}/_/${c.id}/`);
 if(!game||!comment||comment.author?.toLowerCase()!==game.author.name.toLowerCase()||!game.posts.some(p=>p.id===String(comment.link_id).replace(/^t3_/,''))
   ||comment.removed_by_category||/^\[(deleted|removed)\]$/i.test(comment.body.trim())||!plain(comment.body).includes(plain(fact.evidence))
   ||!['projectUrl','title','category','stage'].includes(fact.field))throw new Error('Unverified creator evidence: '+fact.gameId);
 const raw=JSON.parse(db.sql.prepare('SELECT payload_json FROM games WHERE id=?').get(game.id).payload_json);
 validateGame({...raw,[fact.field]:fact.value},before.categories);
 const old=db.sql.prepare('SELECT * FROM project_facts WHERE game_id=? AND field=?').get(game.id,fact.field);
 if(old){if(old.value_json===JSON.stringify(fact.value))continue;throw new Error('Existing accepted fact needs a replacement review');}
 const guard=`INSERT INTO app_meta(key,value_json) VALUES('creator_fact_guard',CASE WHEN EXISTS(SELECT 1 FROM source_posts p JOIN games g ON g.id=p.game_id WHERE p.id=${quote(String(comment.link_id).replace(/^t3_/,''))} AND p.game_id=${quote(game.id)} AND p.status='published' AND g.status='published' AND NOT EXISTS(SELECT 1 FROM removals WHERE game_id=g.id)) AND NOT EXISTS(SELECT 1 FROM project_facts WHERE game_id=${quote(game.id)} AND field=${quote(fact.field)}) THEN 'true' ELSE NULL END) ON CONFLICT(key) DO UPDATE SET value_json=excluded.value_json;`;
 const insert=`INSERT INTO project_facts VALUES(${[game.id,fact.field,JSON.stringify(fact.value),fact.sourceUrl,fact.evidence,at].map(quote).join(',')});`;
 statements.push(guard,insert);db.sql.exec(insert);ids.add(game.id);
}
const tables={project_enrichment:'game_id',steam_cache:'app_id'};
const originals=Object.fromEntries(Object.keys(tables).map(t=>[t,new Map(db.sql.prepare(`SELECT * FROM ${t}`).all().map(row=>[row[tables[t]],row]))]));
const deps={fetch,now:()=>Date.now(),sleep:ms=>new Promise(r=>setTimeout(r,ms))};
for(const id of ids)await checkProject(db,{},id,deps,true);
for(const [table,key] of Object.entries(tables))for(const row of db.sql.prepare(`SELECT * FROM ${table}`).all()){
 const old=originals[table].get(row[key]);if(JSON.stringify(old)===JSON.stringify(row))continue;
 const conflict=old?`NOT EXISTS(SELECT 1 FROM ${table} WHERE ${Object.entries(old).map(([k,v])=>`${k} IS ${quote(v)}`).join(' AND ')})`:`EXISTS(SELECT 1 FROM ${table} WHERE ${key}=${quote(row[key])})`;
 statements.push(`INSERT INTO app_meta(key,value_json) VALUES('creator_fact_guard',CASE WHEN ${conflict} THEN NULL ELSE 'true' END) ON CONFLICT(key) DO UPDATE SET value_json=excluded.value_json;`);
 statements.push(`INSERT INTO ${table}(${Object.keys(row).join(',')}) VALUES(${Object.values(row).map(quote).join(',')}) ON CONFLICT(${key}) DO UPDATE SET ${Object.keys(row).filter(k=>k!==key).map(k=>`${k}=excluded.${k}`).join(',')};`);
}
statements.push(`UPDATE app_meta SET value_json=json_set(value_json,'$.generatedAt',${quote(at)}) WHERE key='catalog';`,"DELETE FROM app_meta WHERE key='creator_fact_guard';");
const verify=new LocalD1(backup);verify.sql.exec('BEGIN');verify.sql.exec(statements.join('\n'));verify.sql.exec('COMMIT');
await fs.writeFile(path.join(out,'apply.sql'),statements.join('\n'),{mode:0o600});
const after=await catalog(db);const report=after.games.filter(g=>ids.has(g.id)).map(g=>({id:g.id,title:g.title,projectUrl:g.projectUrl,linkStatus:g.availability?.status,provider:g.availability?.provider||null}));
await fs.writeFile(path.join(out,'report.json'),JSON.stringify({at,corrections:facts.length,projects:report},null,2),{mode:0o600});
console.log(JSON.stringify({corrections:facts.length,projects:report}));db.close();verify.close();
