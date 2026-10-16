import { query } from './store.mjs';
import { exactKeys, ApiError, invalid } from './http.mjs';
import { researchVersion, rubric, modelText, followupQuestions } from '../../js/post-research-schema.js';

const joins=`FROM post_research r JOIN source_posts p ON p.id=r.post_id JOIN games g ON g.id=p.game_id JOIN source_evidence e ON e.post_id=p.id`;
const visible=`p.status='published' AND g.status='published' AND NOT EXISTS(SELECT 1 FROM removals WHERE game_id=g.id) AND json_extract(e.payload_json,'$.state')='available'`;
const current=`r.source_hash=e.content_hash AND r.game_id=p.game_id`;
const conflict=()=>new ApiError('EDIT_CONFLICT','This source or review changed. Reload and inspect the current evidence.',409);
const choicesValid=labels=>labels&&Object.keys(labels).length===Object.keys(rubric).length&&Object.entries(rubric).every(([key,r])=>Object.hasOwn(r.choices,labels[key]));
async function hashText(row){return [...new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(researchVersion+JSON.stringify(modelText(row)))))].map(b=>b.toString(16).padStart(2,'0')).join('');}

// Operator imports only typed cached answers. The server supplies and guards
// the source text; neither caller prose nor model labels become catalogue facts.
export async function importPostResearch(db,body,deps){
  exactKeys(body,['version','entries']);
  if(body.version!==researchVersion||!Array.isArray(body.entries)||body.entries.length<1||body.entries.length>20)throw invalid('Import one to twenty current study entries.');
  let imported=0,skipped=0;
  for(const entry of body.entries){
    exactKeys(entry,['id','fingerprint','model','classifiedAt','labels']);
    if(!/^[a-z0-9]{5,12}$/.test(entry.id)||!/^([a-f0-9]{64})$/.test(entry.fingerprint)||typeof entry.model!=='string'||!entry.model.length||entry.model.length>100||!Number.isFinite(Date.parse(entry.classifiedAt))||Date.parse(entry.classifiedAt)>deps.now()+30000)throw invalid();
    if(!entry.labels||Object.keys(entry.labels).length!==6)throw invalid();
    for(const [key,r] of Object.entries(rubric)){
      const label=entry.labels[key];exactKeys(label,['value','proposed','probability']);
      if(!Object.hasOwn(r.choices,label.proposed)||!Number.isFinite(label.probability)||label.probability<0||label.probability>1||label.value!==(label.probability>=.8?label.proposed:'unknown'))throw invalid('Invalid study label.');
    }
    const row=await query(db,`SELECT p.game_id,p.payload_json,e.payload_json evidence,e.content_hash FROM source_posts p JOIN games g ON g.id=p.game_id JOIN source_evidence e ON e.post_id=p.id WHERE p.id=? AND ${visible}`,entry.id).first();
    if(!row){skipped++;continue;}
    const source=JSON.parse(row.evidence),post=JSON.parse(row.payload_json);
    if(!source.body?.trim()||await hashText({title:source.title||post.title,body:source.body})!==entry.fingerprint){skipped++;continue;}
    const result=await query(db,`INSERT INTO post_research(post_id,game_id,version,fingerprint,source_hash,model,classified_at,labels_json)
      SELECT ?,?,?,?,?,?,?,? WHERE EXISTS(SELECT 1 FROM source_posts p JOIN games g ON g.id=p.game_id JOIN source_evidence e ON e.post_id=p.id WHERE p.id=? AND p.game_id=? AND e.content_hash=? AND ${visible})
      ON CONFLICT(post_id) DO UPDATE SET game_id=excluded.game_id,version=excluded.version,fingerprint=excluded.fingerprint,source_hash=excluded.source_hash,model=excluded.model,classified_at=excluded.classified_at,labels_json=excluded.labels_json,status='draft',reviewed_labels_json=NULL,questions_json='[]',reviewed_at=NULL,reviewed_by=NULL,revision=post_research.revision+1
      WHERE post_research.fingerprint!=excluded.fingerprint OR post_research.source_hash!=excluded.source_hash OR post_research.game_id!=excluded.game_id RETURNING post_id`,
    entry.id,row.game_id,researchVersion,entry.fingerprint,row.content_hash,entry.model,entry.classifiedAt,JSON.stringify(entry.labels),entry.id,row.game_id,row.content_hash).first();
    if(result)imported++;else skipped++;
  }
  return {imported,skipped};
}
export async function postResearchQueue(db,params){
  const status=params.get('status')||'draft',offset=Number(params.get('cursor')||0);
  if(!['draft','reviewed','dismissed','stale'].includes(status)||!Number.isInteger(offset)||offset<0||offset>10000)throw invalid();
  const rows=await query(db,`SELECT r.*,p.created_at,p.payload_json post,e.payload_json evidence,e.checked_at,COALESCE(json_extract(o.details_json,'$.title'),(SELECT json_extract(f.value_json,'$') FROM project_facts f WHERE f.game_id=g.id AND f.field='title'),json_extract(g.payload_json,'$.title')) title ${joins} LEFT JOIN project_overrides o ON o.game_id=g.id
    WHERE ${visible} AND ${status==='stale'?`NOT (${current})`:`${current} AND r.status=?`} ORDER BY r.classified_at DESC,r.post_id LIMIT 21 OFFSET ?`,...(status==='stale'?[]:[status]),offset).all();
  return {entries:rows.results.slice(0,20).map(row=>{
    const source=JSON.parse(row.evidence),post=JSON.parse(row.post),labels=JSON.parse(row.labels_json),reviewed=row.reviewed_labels_json?JSON.parse(row.reviewed_labels_json):null;
    return {id:row.post_id,gameId:row.game_id,title:row.title,sourceUrl:post.url,sourceTitle:source.title||post.title,text:modelText({title:source.title||post.title,body:source.body}),truncated:(source.body||'').length>5000,sourceCheckedAt:row.checked_at,createdAt:row.created_at,revision:row.revision,model:row.model,classifiedAt:row.classified_at,status,labels,reviewedLabels:reviewed,questions:row.status==='reviewed'?JSON.parse(row.questions_json):followupQuestions(labels),reviewedAt:row.reviewed_at,reviewMethod:row.reviewed_by==='assistant-source-review'?'Assistant source inspection':row.reviewed_by?'Admin source inspection':null};
  }),nextCursor:rows.results.length>20?String(offset+20):null};
}
export async function reviewPostResearch(db,id,body,admin,deps){
  exactKeys(body,['action','revision','labels','questions']);
  if(!['review','dismiss'].includes(body.action)||!Number.isInteger(body.revision)||body.revision<1||!choicesValid(body.labels)||!Array.isArray(body.questions)||body.questions.length>5||body.questions.some(q=>typeof q!=='string'||q.trim().length<10||q.length>500))throw invalid('Review all six labels and use up to five follow-up questions.');
  const saved=await query(db,`UPDATE post_research SET status=?,reviewed_labels_json=?,questions_json=?,reviewed_at=?,reviewed_by=?,revision=revision+1 WHERE post_id=? AND revision=? AND EXISTS(SELECT 1 FROM source_posts p JOIN games g ON g.id=p.game_id JOIN source_evidence e ON e.post_id=p.id WHERE p.id=post_research.post_id AND p.game_id=post_research.game_id AND e.content_hash=post_research.source_hash AND ${visible}) RETURNING post_id`,
    body.action==='review'?'reviewed':'dismissed',JSON.stringify(body.labels),JSON.stringify(body.questions.map(text=>({kind:'Reviewed follow-up',text:text.trim()}))),new Date(deps.now()).toISOString(),admin.subject,id,body.revision).first();
  if(!saved)throw conflict();return {saved:true};
}
export async function postResearchReport(db){
  const rows=await query(db,`SELECT r.status,r.labels_json,r.reviewed_labels_json,r.reviewed_by,CASE WHEN ${current} THEN 1 ELSE 0 END current,p.created_at,r.classified_at ${joins} WHERE ${visible}`).all();
  const counts={draft:0,reviewed:0,dismissed:0,stale:0};
  const facets=Object.fromEntries(['draft','reviewed'].map(group=>[group,Object.fromEntries(Object.entries(rubric).map(([key,r])=>[key,{total:0,counts:Object.fromEntries(Object.keys(r.choices).map(value=>[value,0]))}]))]));
  for(const row of rows.results){const status=row.current?row.status:'stale';counts[status]++;if(!facets[status])continue;
    const labels=JSON.parse(status==='reviewed'?row.reviewed_labels_json:row.labels_json);
    for(const key of Object.keys(rubric)){const value=status==='reviewed'?labels[key]:labels[key].value;facets[status][key].total++;facets[status][key].counts[value]++;}
  }
  return {version:researchVersion,counts,facets,assistantReviewed:rows.results.filter(r=>r.current&&r.status==='reviewed'&&r.reviewed_by==='assistant-source-review').length,sample:{firstPost:rows.results.map(r=>r.created_at).sort()[0]||null,lastPost:rows.results.map(r=>r.created_at).sort().at(-1)||null,classifiedAt:rows.results.map(r=>r.classified_at).sort().at(-1)||null,method:'Each local study samples one recent post per project, balanced across weeks. Combined studies can include multiple posts per project. This is a review sample, not a community prevalence estimate.'}};
}
