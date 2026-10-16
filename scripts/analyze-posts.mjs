import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs, parseEnv } from 'node:util';
import { LocalD1 } from './local-d1.mjs';
import { chooseSample, classifyPosts, fingerprint, modelText, redactText, researchVersion, summarizeStudy } from './post-research-core.mjs';

const {values}=parseArgs({options:{database:{type:'string'},output:{type:'string'},env:{type:'string'},classify:{type:'boolean'},days:{type:'string',default:'60'},sample:{type:'string',default:'120'},'max-requests':{type:'string',default:'24'},timezone:{type:'string',default:'UTC'}}});
if(!values.database||!values.output)throw new Error('Use --database /private/backup.sql --output /private/study [--classify --env /private/.env].');
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..'),out=path.resolve(values.output),days=Number(values.days),limit=Number(values.sample),budget=Number(values['max-requests']);
if(out===root||out.startsWith(root+path.sep))throw new Error('Research output must stay outside the website repository.');
if(!Number.isInteger(days)||days<1||days>1460||!Number.isInteger(limit)||limit<1||limit>500||!Number.isInteger(budget)||budget<1||budget>24)throw new Error('Use 1–1460 days, 1–500 sampled projects and 1–24 requests.');
const now=Date.now();new Intl.DateTimeFormat('en',{timeZone:values.timezone}).format(now);
await fs.mkdir(out,{recursive:true,mode:0o700});await fs.chmod(out,0o700);
const db=new LocalD1(await fs.readFile(values.database,'utf8'));
const rows=db.sql.prepare(`SELECT p.id,p.game_id,p.author_key,p.created_at,p.payload_json,e.payload_json evidence,s.score,s.observed_at
  FROM source_posts p JOIN games g ON g.id=p.game_id JOIN source_evidence e ON e.post_id=p.id LEFT JOIN reddit_scores s ON s.post_id=p.id
  WHERE p.status='published' AND g.status='published' AND NOT EXISTS(SELECT 1 FROM removals WHERE game_id=g.id)
    AND json_extract(e.payload_json,'$.state')='available'`).all().map(r=>{const p=JSON.parse(r.payload_json),e=JSON.parse(r.evidence);return {id:r.id,gameId:r.game_id,makerKey:r.author_key,createdAt:r.created_at,title:e.title||p.title,body:e.body||'',state:e.state,url:p.url,score:r.score,observedAt:r.observed_at};}).filter(r=>Number.isFinite(Date.parse(r.createdAt))&&Date.parse(r.createdAt)<=now);
db.close();
const sample=chooseSample(rows.filter(r=>Date.parse(r.createdAt)>=now-days*86400000),limit),cachePath=path.join(out,'classifications.json');
let cache={version:researchVersion,entries:{}};try{cache=JSON.parse(await fs.readFile(cachePath,'utf8'));}catch(error){if(error.code!=='ENOENT')throw error;}
if(cache.version!==researchVersion)throw new Error('This output directory belongs to another rubric version. Choose a new directory.');
const write=async(name,data)=>{const target=path.join(out,name);await fs.writeFile(target+'.tmp',typeof data==='string'?data:JSON.stringify(data,null,2)+'\n',{mode:0o600});await fs.rename(target+'.tmp',target);};
let requests=0,failure=null;
if(values.classify){
  if(!values.env)throw new Error('Supply a private environment file for Jev.');
  if(Date.parse(cache.retryAt)>now)throw new Error(`Jev is cooling down until ${cache.retryAt}; no requests sent.`);
  const {JEV_API_KEY}=parseEnv(await fs.readFile(values.env,'utf8'));if(!JEV_API_KEY)throw new Error('JEV_API_KEY is not configured.');
  const pending=sample.filter(r=>cache.entries[r.id]?.fingerprint!==fingerprint(r));
  for(let offset=0;offset<pending.length&&requests<budget;offset+=5){
    requests++;try{for(const c of await classifyPosts(pending.slice(offset,offset+5),JEV_API_KEY))cache.entries[c.id]=c;delete cache.retryAt;}
    catch(error){failure=error.message;if(error.retryAt)cache.retryAt=error.retryAt;}
    cache.updatedAt=new Date().toISOString();await write('classifications.json',cache);
    console.log(JSON.stringify({requests,budget,classified:sample.filter(r=>cache.entries[r.id]?.fingerprint===fingerprint(r)).length,selected:sample.length,...(failure?{stopped:failure}:{})}));
    if(failure)break;
  }
}
const current=sample.map(r=>cache.entries[r.id]).filter(Boolean),report=summarizeStudy(rows,current,{now,timezone:values.timezone});
report.sample={since:new Date(now-days*86400000).toISOString(),until:new Date(now).toISOString(),selected:sample.length,eligible:rows.filter(r=>Date.parse(r.createdAt)>=now-days*86400000).length,truncated:sample.filter(r=>redactText(r.body).length>5000||redactText(r.title).length>300).length,rule:'Latest available-text post per project, deterministic hash order within weeks, round-robin across weeks; independent of score.',requestsThisRun:requests,reviewStatus:'private draft; labels require editorial review',failure};
await write('report.json',report);
await write('review.json',sample.map(r=>({postId:r.id,gameId:r.gameId,url:r.url,text:modelText(r),classification:cache.entries[r.id]?.fingerprint===fingerprint(r)?cache.entries[r.id]:null})));
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const rowsHtml=Object.entries(report.facets).map(([field,f])=>`<tr><th scope="row">${esc(f.question)}</th><td>${Object.entries(f.counts).map(([label,n])=>`${esc(label)}: <strong>${n}</strong>`).join(' · ')}</td></tr>`).join('');
await write('report.html',`<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Playtrace post research</title><style>body{font:17px/1.6 system-ui;color:#172234;background:#f3f5f7;max-width:1050px;margin:auto;padding:32px 24px}h1{font-size:2.4rem;line-height:1.1}h2{margin-top:2.4rem}p{max-width:75ch}table{width:100%;border-collapse:collapse}td,th{padding:14px 12px;border-bottom:1px solid #c5ccd4;text-align:left;vertical-align:top}th{width:45%}.status{font-weight:600;color:#725013}.scroll{overflow:auto}small{color:#546174}</style></head><body><p class="status">PRIVATE RESEARCH · EDITORIAL REVIEW REQUIRED</p><h1>What can we learn from game showcases?</h1><p>${report.coverage.posts} available source posts, ${report.coverage.projects} projects. Jev classified ${report.coverage.classified} of ${sample.length} selected posts from the last ${days} days.</p><small>Generated ${esc(report.generatedAt)} · Timing timezone: ${esc(report.timezone)}</small><h2>Posting-time recommendations are not ready</h2><p>The median score observation is ${Math.round(report.coverage.medianScoreAgeSeconds??0)} seconds after publication. Only ${report.timing.eligibleProjects} projects have a score observed at the comparable 7–14-day age. Rechecking an old archive record does not make its score current.</p><p>${esc(report.timing.note)}</p><h2>Questions asked of the collected text</h2><p>These are model-assisted descriptions of a week-balanced sample, not estimates for the whole community. Low-confidence answers remain unknown. ${report.sample.truncated} sampled posts exceeded the text limit and were classified from a bounded excerpt.</p><div class="scroll"><table><thead><tr><th>Question</th><th>Answers, out of ${report.coverage.classified} classified posts</th></tr></thead><tbody>${rowsHtml}</tbody></table></div><h2>What to collect next</h2><ol><li>Preserve comparable, dated engagement observations. Compare scores captured at similar post ages, not retrieval dates.</li><li>Review labels against the linked sources in review.json before accepting aggregate findings.</li><li>Use a separate later cohort to test whether specific feedback questions, concrete development detail and clear build access relate to responses.</li><li>Keep Reddit reactions separate from site feedback and verified play. No identities are joined across sources.</li></ol><h2>Limits</h2><ul>${report.limits.map(s=>`<li>${esc(s)}</li>`).join('')}</ul><p>The API receives bounded public title/body text with links, common contact details and credential patterns redacted. Identifying free text can remain: this is data minimization, not guaranteed anonymization. No scores, author fields, dates, private answers or account records are sent. No classifications are automatically published.</p></body></html>`);
console.log(JSON.stringify({output:out,posts:report.coverage.posts,classified:report.coverage.classified,selected:sample.length,comparableProjects:report.timing.eligibleProjects,requests,failure}));
if(failure)process.exitCode=1;
