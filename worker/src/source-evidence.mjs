import { query, meta, putMeta } from './store.mjs';
import { normalizePost, decodeEntities } from './archive.mjs';
import { includedPost } from './source-policy.mjs';
import { inferName } from './names.mjs';
import { canonicalProjectUrl } from './validation.mjs';
import { unavailable } from './http.mjs';
import { archiveJson } from './references.mjs';
import { acquire, release } from './lease.mjs';
import { reviewedSource } from './source-reviews.mjs';
import { scoreObservation, saveScoreObservations } from './reddit-scores.mjs';

// Store public prose as evidence, never arbitrary archive fields or rendered HTML.
export function sourceBody(raw) {
  return typeof raw?.selftext==='string' ? raw.selftext.slice(0,40000).replace(/[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]/g,'') : '';
}
export function plainExcerpt(value, limit=600) {
  const plain=(decodeEntities(value)||'').replace(/!\[[^\]]*\]\([^)]*\)/g,'')
    .replace(/\[([^\]]+)\]\([^)]*\)/g,'$1').replace(/<[^>]*>/g,'')
    .replace(/https?:\/\/\S+/g,'').replace(/(^|\n)\s{0,3}[#>*-]+\s*/g,'$1')
    .replace(/[*`_]/g,'').replace(/[\x00-\x1f\x7f]/g,' ').replace(/\s+/g,' ').trim();
  if(plain.length<=limit)return plain;
  return plain.slice(0,limit-1).replace(/\s+\S*$/,'').trimEnd()+'…';
}
const timestamp=(seconds,now)=>typeof seconds==='number'&&seconds>=1104537600&&seconds*1000<=now+30000?new Date(seconds*1000).toISOString():null;
const hash=async value=>Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(JSON.stringify(value)))),byte=>byte.toString(16).padStart(2,'0')).join('');

export function sourceObservation(raw, candidate, now) {
  const removed=raw?.removed_by_category||raw?.removed_by||raw?.banned_by||raw?.removed===true
    ||[raw?.author,raw?.title,raw?.selftext].some(value=>typeof value==='string'&&/^\[(deleted|removed)\]$/i.test(value.trim()));
  const state=removed?'removed':candidate?'available':'needs-review';
  return {version:1,state,sourceUrl:`https://www.reddit.com/r/aigamedev/comments/${raw.id}/`,
    title:state==='available'?candidate.post.title:null,body:state==='available'?sourceBody(raw):'',
    sourceEditedAt:timestamp(raw.edited,now),archiveRetrievedAt:timestamp(raw.retrieved_on,now),
    normalized:candidate?{name:candidate.name,projectUrl:candidate.projectUrl,repositoryUrl:candidate.repositoryUrl,
      taxonomy:candidate.taxonomy,flair:candidate.post.flair,links:candidate.references}:null};
}

// Existing source membership is authoritative. An edited post can improve its
// own entry, but cannot publish a new game, move authors, or bypass a removal.
export async function refreshSourceRecords(db, rawRows, deps) {
  const rawById=new Map(rawRows.filter(raw=>typeof raw?.id==='string'&&/^[a-z0-9]{5,12}$/.test(raw.id)).map(raw=>[raw.id,raw]));
  if(!rawById.size)return {checked:0,changed:0,updatedGames:0};
  const rows=await query(db,`SELECT p.id,p.game_id,p.author_key,p.status,p.payload_json,
      g.payload_json AS game_json,e.payload_json AS evidence_json,e.content_hash,s.post_id AS scored_post
    FROM source_posts p LEFT JOIN games g ON g.id=p.game_id LEFT JOIN source_evidence e ON e.post_id=p.id
    LEFT JOIN reddit_scores s ON s.post_id=p.id
    WHERE p.id IN(SELECT value FROM json_each(?)) AND p.status<>'rejected'
      AND (p.game_id IS NULL OR (g.status='published' AND NOT EXISTS(SELECT 1 FROM removals WHERE game_id=g.id)))`,JSON.stringify([...rawById.keys()])).all();
  const records=[],games=new Map(),posts=[],scores=[];
  const at=new Date(deps.now()).toISOString();
  let changed=0;
  for(const row of rows.results) {
    const archived=rawById.get(row.id),{raw,review}=reviewedSource(archived,deps.now());
    const candidate=normalizePost(raw,deps.now(),{reviewUnlabeled:true,knownSource:row.status==='published'});
    const observed=sourceObservation(raw,candidate,deps.now());
    if(review)observed.currentReview={url:review.url,checkedAt:review.checkedAt,flair:review.flair,reason:review.reason,archived:review.archived};
    if(observed.state!=='removed'&&raw.author?.toLowerCase()!==row.author_key)continue;
    // Ingestion can seed a score without another request. Existing scores are
    // refreshed exclusively by the bounded Sunday maintenance job.
    const score=!row.scored_post&&observed.state==='available'?scoreObservation(archived,deps.now()):null;
    if(score)scores.push(score);
    const previous=row.evidence_json?JSON.parse(row.evidence_json):null;
    if(previous?.archiveRetrievedAt&&observed.archiveRetrievedAt&&previous.archiveRetrievedAt>observed.archiveRetrievedAt){
      records.push({id:row.id,payload:previous,hash:row.content_hash});
      continue;
    }
    const contentHash=await hash({...observed,archiveRetrievedAt:null});
    if(!previous||await hash({...previous,archiveRetrievedAt:null})!==contentHash)changed++;
    records.push({id:row.id,payload:observed,hash:contentHash});
    if(row.status!=='published')continue;
    const oldPost=JSON.parse(row.payload_json);
    if(!includedPost(oldPost))continue;
    if(observed.state==='needs-review')continue;
    // A previously reviewed unlabeled post may remain included. Explicitly
    // excluded flairs never pass normalizePost and cannot change public fields.
    const post=observed.state==='removed'?{...oldPost,excerpt:'This source is no longer available in the archive.'}
      :{...oldPost,title:candidate.post.title,excerpt:candidate.post.excerpt,kind:candidate.post.kind};
    if(!games.has(row.game_id))games.set(row.game_id,{before:row.game_json,game:JSON.parse(row.game_json)});
    const entry=games.get(row.game_id),game=entry.game;
    game.posts=game.posts.map(item=>item.id===row.id?post:item);
    if(game.reviewStatus==='source-described'&&game.id===`g_${row.id}`) {
      const oldName=inferName({title:oldPost.title,body:previous?.body||'',projectUrl:game.projectUrl})?.title;
      if(candidate&&(game.title===oldPost.title||game.title===oldName)&&(candidate.name||post.title.length<=160))game.title=candidate.name?.title||post.title;
      if(game.summary===oldPost.excerpt||/^Source post by u\/[^:]+:/.test(game.summary))game.summary=post.excerpt;
      if(candidate) {
        if(!game.projectUrl||(previous?.normalized?.projectUrl&&game.projectUrl===previous.normalized.projectUrl))game.projectUrl=candidate.projectUrl;
        if(!game.repositoryUrl&&candidate.repositoryUrl)game.repositoryUrl=candidate.repositoryUrl;
        if(game.category==='other')game.category=candidate.taxonomy.category;
        if(game.stage==='unknown')game.stage=candidate.taxonomy.stage;
        if(!game.platforms.length)game.platforms=candidate.taxonomy.platforms;
      }
    }
    if(JSON.stringify(post)!==row.payload_json)posts.push({id:row.id,post});
  }
  if(!records.length)return {checked:0,changed:0,updatedGames:0};
  const updates=[...games.values()].filter(entry=>JSON.stringify(entry.game)!==entry.before)
    .map(entry=>({id:entry.game.id,before:entry.before,game:entry.game,url:canonicalProjectUrl(entry.game.projectUrl)}));
  // Abort the entire batch if a concurrent import, upload or merge changed a
  // game. The queue can retry; no source hash is advanced ahead of public data.
  const statements=[query(db,`INSERT INTO app_meta(key,value_json) VALUES('source_refresh_guard',
      CASE WHEN EXISTS(SELECT 1 FROM json_each(?) j LEFT JOIN games g ON g.id=json_extract(j.value,'$.id')
        WHERE g.payload_json IS NULL OR g.payload_json<>json_extract(j.value,'$.before') OR g.status<>'published'
          OR EXISTS(SELECT 1 FROM removals WHERE game_id=g.id)) THEN NULL ELSE 'true' END)
      ON CONFLICT(key) DO UPDATE SET value_json=excluded.value_json`,JSON.stringify(updates)),
    query(db,`INSERT INTO source_evidence(post_id,payload_json,content_hash,checked_at,changed_at)
      SELECT json_extract(j.value,'$.id'),json_extract(j.value,'$.payload'),json_extract(j.value,'$.hash'),?,? FROM json_each(?) j
        JOIN source_posts p ON p.id=json_extract(j.value,'$.id') WHERE p.status<>'rejected'
      ON CONFLICT(post_id) DO UPDATE SET payload_json=excluded.payload_json,content_hash=excluded.content_hash,checked_at=excluded.checked_at,
        changed_at=CASE WHEN source_evidence.content_hash<>excluded.content_hash THEN excluded.changed_at ELSE source_evidence.changed_at END`,at,at,JSON.stringify(records))];
  if(posts.length)statements.push(query(db,`UPDATE source_posts SET payload_json=(SELECT json_extract(value,'$.post') FROM json_each(?) WHERE json_extract(value,'$.id')=source_posts.id),retrieved_at=?
    WHERE id IN(SELECT json_extract(value,'$.id') FROM json_each(?)) AND status='published'`,JSON.stringify(posts),at,JSON.stringify(posts)));
  const removedUrls=records.filter(record=>record.payload.state==='removed').map(record=>record.payload.sourceUrl);
  // Creator replies use the canonical /comments/{post}/_/{comment}/ path.
  // Withdraw their derived facts with the parent source too. Use an exact
  // prefix comparison: LIKE would treat Reddit ID underscores as wildcards.
  if(removedUrls.length)statements.push(query(db,`DELETE FROM project_facts WHERE EXISTS(
    SELECT 1 FROM json_each(?) removed WHERE source_url=removed.value
      OR substr(source_url,1,length(removed.value)+2)=removed.value||'_/')`,JSON.stringify(removedUrls)));
  if(updates.length)statements.push(query(db,`UPDATE games SET payload_json=(SELECT json_extract(value,'$.game') FROM json_each(?) WHERE json_extract(value,'$.id')=games.id),
    project_url=(SELECT json_extract(value,'$.url') FROM json_each(?) WHERE json_extract(value,'$.id')=games.id)
    WHERE id IN(SELECT json_extract(value,'$.id') FROM json_each(?))`,JSON.stringify(updates),JSON.stringify(updates),JSON.stringify(updates)));
  if(scores.length)statements.push(saveScoreObservations(db,scores,{initialOnly:true}));
  if(updates.length||changed||scores.length)statements.push(query(db,"UPDATE app_meta SET value_json=json_set(value_json,'$.generatedAt',?) WHERE key='catalog'",at));
  statements.push(query(db,"DELETE FROM app_meta WHERE key='source_refresh_guard'"));
  try{await db.batch(statements);}catch(error){if(/NOT NULL.*app_meta\.value_json/.test(error.message))throw unavailable();throw error;}
  return {checked:records.length,changed,updatedGames:updates.length,scoreObservations:scores.length};
}

export async function refreshSourceBatch(db,deps) {
  const owner=await acquire(db,'source_refresh_lock',deps.now(),60000);
  if(!owner)return {checked:0,busy:true};
  try {
    const cooldown=await meta(db,'editorial_cooldown')||{};
    if(cooldown.archive>deps.now())return {checked:0,retryAt:new Date(cooldown.archive).toISOString()};
    const due=await query(db,`SELECT p.id FROM source_posts p JOIN games g ON g.id=p.game_id
      LEFT JOIN source_evidence e ON e.post_id=p.id
      WHERE p.status='published' AND g.status='published' AND NOT EXISTS(SELECT 1 FROM removals WHERE game_id=g.id)
        AND (e.post_id IS NULL OR e.checked_at<?)
      ORDER BY COALESCE(e.checked_at,''),p.created_at DESC,p.id LIMIT 10`,new Date(deps.now()-7*86400000).toISOString()).all();
    if(!due.results.length)return {checked:0};
    const ids=due.results.map(row=>row.id);
    try {
      const raw=await archiveJson(`posts/ids?ids=${ids.join(',')}`,deps);
      const result=await refreshSourceRecords(db,raw.filter(row=>ids.includes(row.id)),deps);
      // A missing archive record is not a deletion. Record the check so it
      // cannot monopolize the front of every maintenance batch indefinitely.
      const missing=ids.filter(id=>!raw.some(row=>row.id===id)),at=new Date(deps.now()).toISOString();
      if(missing.length)await query(db,`INSERT INTO source_evidence(post_id,payload_json,content_hash,checked_at,changed_at)
        SELECT value,'{"version":1,"state":"missing-from-archive","body":""}','missing',?,? FROM json_each(?) WHERE 1
        ON CONFLICT(post_id) DO UPDATE SET checked_at=excluded.checked_at`,at,at,JSON.stringify(missing)).run();
      return {...result,missing:missing.length};
    }catch(error){
      if(error.queueCooldown==='archive')await putMeta(db,'editorial_cooldown',{...cooldown,archive:error.retryAt}).run();
      throw error;
    }
  }finally{await release(db,'source_refresh_lock',owner);}
}
