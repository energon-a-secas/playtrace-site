import { query, getGame, meta, putMeta } from './store.mjs';
import { providerCooldownStatement } from './archive-cooldown.mjs';
import { applyDetails, effectiveProjectUrl } from './details.mjs';
import { checkProject } from './enrichment.mjs';
import { refreshReferences } from './references.mjs';
import { feedbackReview, classifyEvidence } from './insights.mjs';
import { exactKeys, invalid, notFound, ApiError } from './http.mjs';
import { GAME_ID } from './validation.mjs';
import { acquire, release } from './lease.mjs';
import { currentNotesSql } from './feedback-evidence.mjs';
import { feedbackTopics } from '../../js/feedback-patterns.js';
import { checkedRedditEvidence } from './evidence-maintenance.mjs';

export const jobKinds = ['links','store','feedback','references','research'];
const projectUrl = effectiveProjectUrl;
export async function queueLinkMaintenance(db,deps) {
  const pending=await query(db,"SELECT count(*) AS count FROM editorial_jobs WHERE kind='links' AND status IN('pending','running')").first();
  if(pending.count>=8)return {queued:0};
  const at=new Date(deps.now()).toISOString(),week=new Date(deps.now()-7*86400000).toISOString(),month=new Date(deps.now()-30*86400000).toISOString();
  const row=await query(db,`SELECT g.id FROM games g LEFT JOIN project_overrides o ON o.game_id=g.id LEFT JOIN project_enrichment e ON e.game_id=g.id
    WHERE g.status='published' AND NOT EXISTS(SELECT 1 FROM removals WHERE game_id=g.id)
    AND (${projectUrl()}) IS NOT NULL AND (${projectUrl()}) NOT LIKE 'https://%.itch.io/%' AND (${projectUrl()}) NOT LIKE 'https://store.steampowered.com/app/%'
    AND NOT EXISTS(SELECT 1 FROM editorial_jobs j WHERE j.game_id=g.id AND j.kind='links' AND (j.status IN('pending','running') OR j.updated_at>?))
    AND (e.game_id IS NULL OR e.project_url!=(${projectUrl()}) OR e.checked_at<CASE WHEN json_extract(e.payload_json,'$.status')='reachable' THEN ? ELSE ? END)
    ORDER BY CASE WHEN json_extract(e.payload_json,'$.status')='broken' THEN 0 WHEN e.game_id IS NULL THEN 1 ELSE 2 END,e.checked_at,g.updated_at DESC LIMIT 1`,week,month,week).first();
  if(!row)return {queued:0};
  const added=await query(db,`INSERT INTO editorial_jobs(id,game_id,kind,window_start,created_at,updated_at,requested_by)
    VALUES(?,?,'links',?,?,?,'link-maintenance') ON CONFLICT(game_id,kind,window_start) DO NOTHING RETURNING id`,crypto.randomUUID(),row.id,at.slice(0,10)+'T00:00:00.000Z',at,at).first();
  return {queued:added?1:0};
}
export async function queueFeedbackMaintenance(db,deps,{weekly=false}={}) {
  const at=new Date(deps.now()).toISOString(),since=new Date(deps.now()-60*86400000).toISOString();
  const key='weekly_feedback_queue',week=at.slice(0,10);
  if(weekly&&(await meta(db,key))?.week===week)return {queued:0};
  const pending=await query(db,"SELECT count(*) AS count FROM editorial_jobs WHERE kind='feedback' AND status IN('pending','running')").first();
  if(pending.count>=8)return {queued:0,backlog:true};
  // Hourly work starts from written feedback; IN alone still let SQLite scan
  // the catalogue even when no new notes were waiting. Weekly work is broader.
  const candidates=weekly?'games g':`(SELECT DISTINCT f.game_id FROM feedback f WHERE f.status='published' AND length(trim(f.body))>=8 AND f.updated_at>=?
    AND NOT EXISTS(SELECT 1 FROM editorial_jobs j WHERE j.game_id=f.game_id AND j.kind='feedback' AND j.updated_at>=f.updated_at)) eligible
    CROSS JOIN games g ON g.id=eligible.game_id`;
  const due=await query(db,`SELECT g.id FROM ${candidates} WHERE g.status='published' AND NOT EXISTS(SELECT 1 FROM removals WHERE game_id=g.id)
    AND NOT EXISTS(SELECT 1 FROM editorial_jobs j WHERE j.game_id=g.id AND j.kind='feedback' AND j.status IN('pending','running'))
    AND ${weekly?`g.updated_at>=? AND NOT EXISTS(SELECT 1 FROM editorial_jobs j WHERE j.game_id=g.id AND j.kind='feedback' AND j.updated_at>=?)`
      :'1'}
    ORDER BY COALESCE((SELECT max(updated_at) FROM editorial_jobs j WHERE j.game_id=g.id AND j.kind='feedback'),''),g.updated_at DESC,g.id LIMIT ?`,
    since,...(weekly?[new Date(deps.now()-7*86400000).toISOString()]:[]),Math.min(weekly?8:1,8-pending.count)).all();
  const start=since.slice(0,10)+'T00:00:00.000Z',items=due.results.map(row=>({id:crypto.randomUUID(),gameId:row.id}));
  const statements=[query(db,`INSERT INTO editorial_jobs(id,game_id,kind,window_start,created_at,updated_at,requested_by)
    SELECT json_extract(value,'$.id'),json_extract(value,'$.gameId'),'feedback',?,?,?,'feedback-maintenance' FROM json_each(?) WHERE 1
    ON CONFLICT(game_id,kind,window_start) DO UPDATE SET status='pending',payload_json='{}',updated_at=excluded.updated_at
      WHERE editorial_jobs.status NOT IN('pending','running') RETURNING id`,start,at,at,JSON.stringify(items))];
  if(weekly)statements.push(putMeta(db,key,{week,queued:items.length,at}));
  const [result]=await db.batch(statements);return {queued:result.results.length};
}
export async function queueStoreMaintenance(db, deps) {
  const at=new Date(deps.now()).toISOString(), weekAgo=new Date(deps.now()-7*86400000).toISOString();
  const rows=await query(db,`SELECT g.id FROM games g LEFT JOIN project_overrides o ON o.game_id=g.id
    WHERE g.status='published' AND NOT EXISTS(SELECT 1 FROM removals WHERE game_id=g.id)
    AND ((${projectUrl()}) LIKE 'https://%.itch.io/%'
      OR (${projectUrl()}) LIKE 'https://store.steampowered.com/app/%')
    AND NOT EXISTS(SELECT 1 FROM editorial_jobs j WHERE j.game_id=g.id AND j.kind='store' AND (j.status IN('pending','running') OR j.updated_at>?))
    AND NOT EXISTS(SELECT 1 FROM project_enrichment e WHERE e.game_id=g.id AND COALESCE(json_extract(e.payload_json,'$.storeCheckedAt'),e.checked_at)>?
      AND e.project_url=(${projectUrl()}))
    ORDER BY g.updated_at DESC LIMIT 2`,weekAgo,weekAgo).all();
  if(!rows.results.length)return;
  const count=await query(db,"SELECT count(*) AS count FROM editorial_jobs WHERE status IN('pending','running')").first();
  if(count.count>=20)return;
  await query(db,`INSERT INTO editorial_jobs(id,game_id,kind,window_start,created_at,updated_at,requested_by)
    SELECT json_extract(value,'$.id'),json_extract(value,'$.gameId'),'store',?,?,?,'maintenance' FROM json_each(?) WHERE 1
    ON CONFLICT(game_id,kind,window_start) DO NOTHING`,at.slice(0,10)+'T00:00:00.000Z',at,at,JSON.stringify(rows.results.map(row=>({id:crypto.randomUUID(),gameId:row.id})))).run();
}
export function reviewWindow(now) { return new Date(now-60*86400000).toISOString(); }
export async function enqueueJobs(db, body, admin, deps) {
  exactKeys(body, ['kind','scope','gameId']);
  if (!jobKinds.includes(body.kind) || !['recent','all','game'].includes(body.scope) || (body.scope === 'game' ? !GAME_ID.test(body.gameId || '') : body.gameId !== null)) throw invalid('Choose a job and a collection scope.');
  if (body.scope === 'game') await getGame(db,body.gameId);
  const at = new Date(deps.now()).toISOString(), since = reviewWindow(deps.now());
  // Frozen calendar-day windows make repeated enqueue requests idempotent.
  const start = ['feedback','research'].includes(body.kind) ? since.slice(0,10)+'T00:00:00.000Z' : at.slice(0,10)+'T00:00:00.000Z';
  const rows = await query(db, `SELECT games.id FROM games LEFT JOIN project_overrides o ON o.game_id=games.id WHERE games.status='published'
    AND NOT EXISTS(SELECT 1 FROM removals WHERE game_id=games.id)
    ${body.kind==='store'?`AND ((${projectUrl('games')}) LIKE 'https://%.itch.io/%' OR (${projectUrl('games')}) LIKE 'https://store.steampowered.com/app/%')`:''}
    ${body.kind==='links'&&body.scope!=='game'?`AND (${projectUrl('games')}) IS NOT NULL`:''}
    ${body.scope === 'game' ? 'AND games.id=?' : body.scope === 'recent' ? 'AND games.updated_at>=?' : ''}
    ORDER BY games.updated_at DESC LIMIT 2000`, ...(body.scope==='game'?[body.gameId]:body.scope==='recent'?[since]:[])).all();
  const items = rows.results.map(row=>({id:crypto.randomUUID(),gameId:row.id}));
  const result = await query(db, `INSERT INTO editorial_jobs(id,game_id,kind,window_start,created_at,updated_at,requested_by)
    SELECT json_extract(value,'$.id'),json_extract(value,'$.gameId'),?,?,?,?,? FROM json_each(?) WHERE 1
    ON CONFLICT(game_id,kind,window_start) DO NOTHING RETURNING id`, body.kind,start,at,at,admin.subject,JSON.stringify(items)).all();
  return { queued: result.results.length, matched: items.length, windowStart: start };
}
export async function listJobs(db, status, cursor = '', kind = '') {
  if (status && !['pending','running','ready','failed','published','dismissed','all'].includes(status)) throw invalid();
  if (kind && kind!=='all' && !jobKinds.includes(kind)) throw invalid();
  const filtered=kind&&kind!=='all';
  const offset = Number(cursor || 0); if (!Number.isInteger(offset) || offset < 0 || offset > 100000) throw invalid();
  const [rows, counts] = await db.batch([
    query(db, `SELECT j.*,COALESCE(json_extract(o.details_json,'$.title'),
      (SELECT json_extract(f.value_json,'$') FROM project_facts f WHERE f.game_id=g.id AND f.field='title'),json_extract(g.payload_json,'$.title')) AS title
      FROM editorial_jobs j JOIN games g ON g.id=j.game_id LEFT JOIN project_overrides o ON o.game_id=g.id
      WHERE g.status='published' ${status && status!=='all'?'AND j.status=?':''} ${filtered?'AND j.kind=?':''} ORDER BY j.created_at DESC,j.id LIMIT 21 OFFSET ?`, ...(status&&status!=='all'?[status]:[]), ...(filtered?[kind]:[]), offset),
    query(db, `SELECT status,count(*) AS count FROM editorial_jobs ${filtered?'WHERE kind=?':''} GROUP BY status`,...(filtered?[kind]:[])),
  ]);
  return { jobs: rows.results.slice(0,20).map(row=>({id:row.id,gameId:row.game_id,title:row.title,kind:row.kind,status:row.status,windowStart:row.window_start,createdAt:row.created_at,updatedAt:row.updated_at,attempts:row.attempts,result:JSON.parse(row.payload_json)})), counts: counts.results, nextCursor:rows.results.length>20?String(offset+20):null };
}
export async function runJobs(db, env, deps, limit = 1, kind = 'all') {
  if (!Number.isInteger(limit) || limit < 1 || limit > 2) throw invalid();
  if(kind!=='all'&&!jobKinds.includes(kind))throw invalid();
  const owner = await acquire(db,'editorial_queue_lock',deps.now(),180000); if (!owner) return { processed:0,busy:true };
  let processed=0;
  try {
    const day=new Date(deps.now()).toISOString().slice(0,10),savedBudget=await meta(db,'editorial_daily_budget');
    const budget=savedBudget?.day===day?savedBudget:{day,attempts:0};
    const configured=Number(env.EDITORIAL_DAILY_LIMIT||72),dailyLimit=Number.isInteger(configured)&&configured>=1&&configured<=200?configured:72;
    if(budget.attempts>=dailyLimit)return {processed:0,limited:true,retryAt:new Date(Date.parse(day+'T00:00:00.000Z')+86400000).toISOString()};
    limit=Math.min(limit,dailyLimit-budget.attempts);
    // Recover an interrupted worker; the fixed job ID survives retries.
    await query(db, "UPDATE editorial_jobs SET status='pending' WHERE status='running' AND updated_at<?",new Date(deps.now()-180000).toISOString()).run();
    const cooldown=await meta(db,'editorial_cooldown')||{};
    const rows=await query(db,`SELECT * FROM editorial_jobs WHERE status='pending'
      ${kind==='all'?'':'AND kind=?'}
      AND (kind NOT IN('feedback','references') OR ?<=? OR (kind='feedback' AND json_type(payload_json,'$.archiveBatch')='object')) AND (kind NOT IN('feedback','research') OR ?<=?)
      ORDER BY CASE WHEN kind='feedback' AND requested_by='feedback-maintenance' THEN 0 WHEN requested_by='link-maintenance' THEN 1 ELSE 2 END,created_at,id LIMIT ?`,...(kind==='all'?[]:[kind]),cooldown.archive||0,deps.now(),cooldown.jev||0,deps.now(),limit).all();
    if(!rows.results.length){
      const pending=await query(db,`SELECT count(*) AS count FROM editorial_jobs WHERE status='pending' ${kind==='all'?'':'AND kind=?'}`,...(kind==='all'?[]:[kind])).first();
      const retryAt=Math.min(...Object.values(cooldown).filter(at=>at>deps.now()));
      return {processed:0,...(pending.count&&Number.isFinite(retryAt)?{retryAt:new Date(retryAt).toISOString()}: {})};
    }
    let deferred=false;
    for(const job of rows.results){
      const at=new Date(deps.now()).toISOString();
      // Reserve before fetching; failures also consume the daily budget.
      // The global queue lease makes these reservations atomic.
      budget.attempts++;
      await putMeta(db,'editorial_daily_budget',budget).run();
      await query(db,"UPDATE editorial_jobs SET status='running',attempts=attempts+1,updated_at=? WHERE id=? AND status='pending'",at,job.id).run();
      try{
        let result;
        if(job.kind==='links'||job.kind==='store') result=await checkProject(db,env,job.game_id,deps,job.kind==='store');
        else if(job.kind==='references') result=await refreshReferences(db,job.game_id,deps);
        else if(job.kind==='feedback') { const [game]=await applyDetails(db,[await getGame(db,job.game_id)]);result=await feedbackReview(game,job.window_start,env,deps,JSON.parse(job.payload_json).archiveBatch||null); }
        else {
          const answers=await query(db,'SELECT questionnaire_id,revision,questions_json,answers_json,updated_at FROM research_responses WHERE game_id=? AND updated_at>=? ORDER BY updated_at DESC LIMIT 31',job.game_id,job.window_start).all();
          const evidence=answers.results.slice(0,30).map((row,i)=>({id:String(i+1),body:JSON.parse(row.questions_json).map(q=>{const answer=JSON.parse(row.answers_json)[q.id];return `${q.title}: ${Array.isArray(answer)?answer.map(n=>q.options[n]).join(', '):typeof answer==='number'?q.options[answer]:answer||'Skipped'}`;}).join('\n'),questionnaireId:row.questionnaire_id,revision:row.revision,createdAt:row.updated_at}));
          result={...await classifyEvidence(evidence,env,deps),sampled:answers.results.length>30,note:evidence.length?'Private analysis of questionnaire responses. These are browser contributions, not unique players.':'No questionnaire responses in this window.'};
        }
        const sourceCheck=job.kind==='feedback'?await checkedRedditEvidence(db,job.game_id,result.evidence):null;
        const payload=JSON.stringify(result);
        const saved=await query(db,`UPDATE editorial_jobs SET status='ready',payload_json=?,updated_at=? WHERE id=? AND status='running'
          AND EXISTS(SELECT 1 FROM games g WHERE g.id=editorial_jobs.game_id AND g.status='published' AND NOT EXISTS(SELECT 1 FROM removals WHERE game_id=g.id))
          ${job.kind==='feedback'?`AND ${currentNotesSql('evidence')} AND COALESCE((SELECT payload_json FROM evidence_checks WHERE game_id=?),'')=?`:''} RETURNING id`,payload,new Date(deps.now()).toISOString(),job.id,...(job.kind==='feedback'?[payload,job.game_id,job.game_id,sourceCheck]:[])).first();
        if(!saved)throw new Error('Public evidence changed while this review was running.');
      }catch(error){
        const message=/^(Jev |Archive HTTP )/.test(error.message||'')?error.message:'This job could not finish. The source may be unavailable. Retry to check again.';
        if(error.queueCooldown&&Number.isFinite(error.retryAt)){
          cooldown[error.queueCooldown]=error.retryAt;deferred=true;
          await db.batch([providerCooldownStatement(db,error.queueCooldown,error.retryAt),query(db,"UPDATE editorial_jobs SET status='pending',payload_json=?,updated_at=? WHERE id=? AND status='running'",JSON.stringify({...JSON.parse(job.payload_json),note:message,retryAt:new Date(error.retryAt).toISOString()}),new Date(deps.now()).toISOString(),job.id)]);
        }else await query(db,"UPDATE editorial_jobs SET status='failed',payload_json=?,updated_at=? WHERE id=? AND status='running'",JSON.stringify({...(JSON.parse(job.payload_json).archiveBatch?{archiveBatch:JSON.parse(job.payload_json).archiveBatch}:{}),error:message}),new Date(deps.now()).toISOString(),job.id).run();
      }
      processed++;
      if(deferred)break;
    }
    return {processed};
  }finally{await release(db,'editorial_queue_lock',owner);}
}
export async function updateJob(db,id,body,admin,deps){
  const edited=Object.hasOwn(body||{},'review');
  const versioned=Object.hasOwn(body||{},'expectedUpdatedAt');
  exactKeys(body,['action',...(edited?['review']:[]),...(versioned?['expectedUpdatedAt']:[])]); if(!['retry','dismiss','publish'].includes(body.action)||edited&&body.action!=='publish')throw invalid();
  const job=await query(db,'SELECT * FROM editorial_jobs WHERE id=?',id).first(); if(!job)throw notFound();
  if(job.requested_by==='evidence-maintenance'&&body.action!=='dismiss')throw invalid('Source-watch flags are rechecked by scheduled maintenance. Queue a fresh feedback review after checking the source.');
  if(versioned&&body.expectedUpdatedAt!==job.updated_at)throw new ApiError('EDIT_CONFLICT','This draft changed. Refresh the queue and check its sources again.',409);
  await getGame(db,job.game_id);
  if(job.status==='running')throw new ApiError('CONFLICT','This job is still running.',409);
  const at=new Date(deps.now()).toISOString();
  if(body.action==='publish'){
    const data=JSON.parse(job.payload_json);
    if(job.kind!=='feedback'||job.status!=='ready'||!data.summary||!data.citations?.length)throw invalid('Only a cited feedback draft can be published.');
    if(edited){
      exactKeys(body.review,['summary','labels']);
      if(typeof body.review.summary!=='string'||body.review.summary.trim().length<20||body.review.summary.length>6000
        ||!Array.isArray(body.review.labels)||body.review.labels.length!==data.citations.length)throw invalid('Review the summary and each source label.');
      const seen=new Set();
      for(const label of body.review.labels){
        exactKeys(label,['number','theme','tone','experience']);
        const source=data.citations.find(source=>source.number===label.number);
        if(!source||seen.has(label.number)||label.theme!==null&&!Object.hasOwn(feedbackTopics,label.theme)
          ||label.tone!==null&&!['praise','concern','suggestion','mixed'].includes(label.tone)||!['preview','played','unspecified'].includes(label.experience)
          ||source.source==='playtrace'&&label.experience!==source.experience)throw invalid('Use the listed labels and preserve the visitor’s stated perspective.');
        seen.add(label.number);Object.assign(source,label);
      }
      const refs=[...body.review.summary.matchAll(/\[(\d+)\]/g)].map(match=>Number(match[1]));
      if(refs.some(number=>!seen.has(number))||[...seen].some(number=>!refs.includes(number)))throw invalid('Keep a numbered reference for every cited contribution.');
      data.summary=body.review.summary.trim();
    }
    const review={version:data.version||1,summary:data.summary,citations:data.citations,windowStart:data.windowStart,windowEnd:data.windowEnd,sampled:data.sampled,model:data.model,classifiedComments:data.classifiedComments,
      ...(data.sources?{sources:data.sources,archiveWindowEnd:data.archiveWindowEnd}:{}),editorialReview:{checkedAt:at,method:'Admin-approved cited review'}};
    let sourceCheck;
    try{sourceCheck=await checkedRedditEvidence(db,job.game_id,review.citations);}catch{throw new ApiError('CONFLICT','A cited Reddit source changed. Run a new feedback review before publishing.',409);}
    const [saved]=await db.batch([query(db,`INSERT INTO feedback_reviews(game_id,payload_json,published_at,published_by)
      SELECT ?,?,?,? WHERE EXISTS(SELECT 1 FROM editorial_jobs WHERE id=? AND status='ready' AND payload_json=? AND updated_at=?)
        AND EXISTS(SELECT 1 FROM games WHERE id=? AND status='published' AND NOT EXISTS(SELECT 1 FROM removals WHERE game_id=games.id))
        AND ${currentNotesSql('citations')}
        AND COALESCE((SELECT payload_json FROM evidence_checks WHERE game_id=?),'')=?
      ON CONFLICT(game_id) DO UPDATE SET payload_json=excluded.payload_json,published_at=excluded.published_at,published_by=excluded.published_by RETURNING game_id`,job.game_id,JSON.stringify(review),at,admin.subject,id,job.payload_json,job.updated_at,job.game_id,JSON.stringify(review),job.game_id,job.game_id,sourceCheck),
      query(db,"UPDATE editorial_jobs SET status='published',payload_json=?,updated_at=? WHERE id=? AND status='ready' AND payload_json=? AND EXISTS(SELECT 1 FROM feedback_reviews WHERE game_id=? AND published_at=? AND payload_json=?)",JSON.stringify({...data,editorialReview:review.editorialReview}),at,id,job.payload_json,job.game_id,at,JSON.stringify(review))]);
    if(!saved.results.length)throw new ApiError('CONFLICT','A cited public note changed. Run this review again before publishing.',409);
  }else await query(db,'UPDATE editorial_jobs SET status=?,updated_at=? WHERE id=?',body.action==='retry'?'pending':'dismissed',at,id).run();
  return {updated:true};
}
