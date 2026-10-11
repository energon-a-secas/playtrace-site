import {readFile,writeFile,rename} from 'node:fs/promises';
import {parseArgs,parseEnv} from 'node:util';
import {createHash} from 'node:crypto';
import {feedbackReview} from '../worker/src/insights.mjs';
import {validateCatalog} from '../js/collection.js';

// Operator-only batch runner. Input is a D1 export of pending feedback jobs.
// Reuses the Worker's typed classification and prepares SQL for review/import;
// it never publishes a review or creates a visitor contribution.
const {values}=parseArgs({options:{jobs:{type:'string'},catalog:{type:'string'},env:{type:'string'},output:{type:'string'}}});
if(!values.jobs||!values.catalog||!values.env||!values.output)throw new Error('Use --jobs file --catalog file --env private.env --output path-prefix.');
const {JEV_API_KEY}=parseEnv(await readFile(values.env,'utf8'));
if(!JEV_API_KEY)throw new Error('JEV_API_KEY is missing from the private environment file.');
const data=JSON.parse(await readFile(values.jobs,'utf8')),jobs=data[0]?.results;
if(!Array.isArray(jobs))throw new Error('Expected a D1 JSON export of pending feedback jobs.');
const games=new Map(validateCatalog(JSON.parse(await readFile(values.catalog,'utf8'))).games.map(game=>[game.id,game]));
const output=values.output+'.json',quote=value=>`'${value.replaceAll("'","''")}'`;
let saved={};try{saved=JSON.parse(await readFile(output,'utf8'));}catch(error){if(error.code!=='ENOENT')throw error;}
const results=saved.results||{},failures=[];
const fingerprint=job=>createHash('sha256').update(job.payload_json).digest('hex');
const deps={fetch:globalThis.fetch,now:()=>Date.now(),sleep:ms=>new Promise(resolve=>setTimeout(resolve,ms))};
async function checkpoint(){
  const rows=jobs.filter(job=>results[job.id]?.fingerprint===fingerprint(job));
  const sql=rows.map(job=>{
    const value=results[job.id],payload=JSON.stringify(value.result);
    const statement=`UPDATE editorial_jobs SET status='ready',payload_json=${quote(payload)},attempts=attempts+1,updated_at=${quote(value.completedAt)} WHERE id=${quote(job.id)} AND game_id=${quote(job.game_id)} AND kind='feedback' AND status='pending' AND payload_json=${quote(job.payload_json)};`;
    if(Buffer.byteLength(statement)>99000)throw new Error('A result exceeds the SQL statement limit.');return statement;
  }).join('\n')+'\n';
  await writeFile(output+'.tmp',JSON.stringify({results,failures},null,2)+'\n',{mode:0o600});await rename(output+'.tmp',output);
  await writeFile(values.output+'.sql',sql,{mode:0o600});
}
for(const [index,job] of jobs.entries()){
  if(!/^[a-f0-9-]{36}$/.test(job.id)||!games.has(job.game_id)||!Number.isFinite(Date.parse(job.window_start)))throw new Error('Invalid pending job.');
  if(results[job.id]?.fingerprint===fingerprint(job))continue;
  for(let attempt=0;attempt<4;attempt++){
    try{
      const batch=JSON.parse(job.payload_json).archiveBatch;
      if(!batch)throw new Error('Pending job lacks staged archive evidence.');
      const result=await feedbackReview(games.get(job.game_id),job.window_start,{JEV_API_KEY},deps,batch);
      results[job.id]={fingerprint:fingerprint(job),completedAt:new Date().toISOString(),result};break;
    }catch(error){
      if(attempt===3){failures.push({id:job.id,message:/^Jev /.test(error.message)?error.message:'The job could not finish; retry from the checkpoint.'});break;}
      const until=error.queueCooldown==='jev'?error.retryAt:Date.now()+5000*(attempt+1);
      while(Date.now()<until)await deps.sleep(Math.min(30000,until-Date.now()));
    }
  }
  await checkpoint();
  if(index%10===0)console.log(JSON.stringify({completed:Object.keys(results).length,total:jobs.length,failures:failures.length}));
}
await checkpoint();
console.log(JSON.stringify({complete:!failures.length,completed:Object.keys(results).length,total:jobs.length,failures:failures.length,citedDrafts:Object.values(results).filter(row=>row.result.summary&&row.result.citations.length).length}));
if(failures.length)process.exitCode=1;
