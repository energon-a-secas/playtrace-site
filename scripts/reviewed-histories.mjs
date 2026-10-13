import { createHash } from 'node:crypto';
import { normalizePost } from '../worker/src/archive.mjs';
import { sourceObservation } from '../worker/src/source-evidence.mjs';
import { validateGame } from '../worker/src/validation.mjs';
import { listCategories } from '../worker/src/categories.mjs';
import { scoreObservation } from '../worker/src/reddit-scores.mjs';

export const quote=value=>value===null?'NULL':typeof value==='number'?String(value):"'"+String(value).replaceAll("'","''")+"'";
const plain=value=>String(value).replace(/[\\*_]/g,'').replace(/\s+/g,' ').trim().toLowerCase();
const id=value=>typeof value==='string'&&/^g_[a-z0-9]{5,12}$/.test(value);
// Reviewed operator work only. Every source is explicitly named; this never
// extends the automatic repost rule or infers identity from a shared author.
export async function reviewedHistoryPlan(db,review,rawSources,now=Date.now()){
  if(!id(review.keep)||!Array.isArray(review.aliases)||!review.aliases.length||review.aliases.length>20||review.aliases.some(v=>!id(v))||new Set([review.keep,...review.aliases]).size!==review.aliases.length+1||typeof review.reason!=='string'||review.reason.length<40)throw new Error('Explicit reviewed history required');
  const members=[review.keep,...review.aliases],all=members.map(quote).join(','),old=review.aliases.map(quote).join(','),at=new Date(now).toISOString();
  const statements=[],guard=condition=>statements.push(`INSERT INTO app_meta(key,value_json) VALUES('history_review_guard',CASE WHEN ${condition} THEN 'true' ELSE NULL END) ON CONFLICT(key) DO UPDATE SET value_json=excluded.value_json;`);
  function unchanged(table,where){
    const rows=db.sql.prepare(`SELECT * FROM ${table} WHERE ${where}`).all();
    guard(`(SELECT count(*) FROM ${table} WHERE ${where})=${rows.length}`);
    for(const row of rows)guard(`EXISTS(SELECT 1 FROM ${table} WHERE ${Object.entries(row).map(([k,v])=>`${k} IS ${quote(v)}`).join(' AND ')})`);
    return rows;
  }
  const records=unchanged('games',`id IN(${all})`);
  if(records.length!==members.length||records.some(r=>r.status!=='published'))throw new Error('All reviewed entries must still be published');
  const games=records.map(r=>JSON.parse(r.payload_json)),winner=games.find(g=>g.id===review.keep),author=winner.author.name.toLowerCase();
  if(games.some(g=>g.author.name.toLowerCase()!==author))throw new Error('History authors differ');
  if(games.some(g=>g.updatedAt>winner.updatedAt))throw new Error('Keep the latest reviewed entry');
  const removed=unchanged('removals',`game_id IN(${all})`);if(removed.length)throw new Error('A reviewed entry was withdrawn');
  // Stop for a separate contribution/consent review rather than silently
  // choosing between ratings, guest edits, questionnaires or approved images.
  for(const table of ['feedback','ratings','follows','price_signals','play_expectations','research_responses','questionnaires','media_assets','preview_overrides','project_overrides','change_requests']){
    if(unchanged(table,`game_id IN(${old})`).length)throw new Error(`Review ${table} before combining histories`);
  }
  const reviews=unchanged('feedback_reviews',`game_id IN(${all})`),olderReviews=reviews.filter(r=>review.aliases.includes(r.game_id));
  let adoptedReview=null;
  if(review.adoptPublishedReview!==undefined){
    if(!review.aliases.includes(review.adoptPublishedReview)||olderReviews.length!==1||olderReviews[0].game_id!==review.adoptPublishedReview||reviews.some(r=>r.game_id===winner.id))throw new Error('Adopt exactly one published review into an empty destination');
    adoptedReview=olderReviews[0];
  }else if(olderReviews.length)throw new Error('Review feedback_reviews before combining histories');
  if(games.some(g=>review.aliases.includes(g.id)&&g.preview.storage==='r2'))throw new Error('Review uploaded artwork before combining histories');
  unchanged('project_overrides',`game_id=${quote(winner.id)}`);
  const memberships=unchanged('source_posts',`game_id IN(${all})`),posts=games.flatMap(g=>g.posts);
  if(memberships.length!==posts.length||memberships.some(r=>r.status!=='published'||!games.find(g=>g.id===r.game_id)?.posts.some(p=>p.id===r.id)))throw new Error('Source membership changed');
  if(new Set(posts.map(p=>p.id)).size!==posts.length)throw new Error('Duplicate source membership');
  const rawById=new Map(rawSources.map(r=>[r.id,r])),added=[];
  for(const postId of review.addPosts||[]){
    const rows=unchanged('source_posts',`id=${quote(postId)}`);
    if(rows.some(r=>r.status!=='pending'||r.game_id!==null)||posts.some(p=>p.id===postId))throw new Error('Only an unassigned pending source can be added');
    if(db.sql.prepare(`SELECT 1 FROM removals,json_each(source_post_ids_json) WHERE value=?`).get(postId))throw new Error('Source was withdrawn');
    guard(`NOT EXISTS(SELECT 1 FROM removals,json_each(source_post_ids_json) WHERE value=${quote(postId)})`);
    const candidate=normalizePost(rawById.get(postId),now);
    if(!candidate||candidate.authorKey!==author||candidate.requiresReview)throw new Error('Additional source needs eligible explicit flair and matching author');
    posts.push(candidate.post);added.push(candidate);
  }
  const evidenceRows=unchanged('source_evidence',`post_id IN(${posts.map(p=>quote(p.id)).join(',')})`);
  const observations=[];
  for(const post of posts){
    const raw=rawById.get(post.id),candidate=normalizePost(raw,now,{knownSource:!added.some(c=>c.post.id===post.id)});
    if(!candidate||candidate.authorKey!==author)throw new Error('A reviewed source is no longer eligible');
    const citation=review.evidence?.find(e=>e.postId===post.id);
    if(!citation?.quote||!plain(raw.title+' '+raw.selftext).includes(plain(citation.quote)))throw new Error('Every source needs a verified review quote');
    const observation=sourceObservation(raw,candidate,now),payload=JSON.stringify(observation),hash=createHash('sha256').update(JSON.stringify({...observation,archiveRetrievedAt:null})).digest('hex');
    const previous=evidenceRows.find(r=>r.post_id===post.id);
    if(previous&&JSON.parse(previous.payload_json).archiveRetrievedAt>observation.archiveRetrievedAt)throw new Error('Source review is older than retained evidence');
    observations.push(`INSERT INTO source_evidence(post_id,payload_json,content_hash,checked_at,changed_at) VALUES(${quote(post.id)},${quote(payload)},${quote(hash)},${quote(at)},${quote(at)}) ON CONFLICT(post_id) DO UPDATE SET payload_json=excluded.payload_json,content_hash=excluded.content_hash,checked_at=excluded.checked_at,changed_at=CASE WHEN source_evidence.content_hash=excluded.content_hash THEN source_evidence.changed_at ELSE excluded.changed_at END;`);
  }
  if(adoptedReview){
    const citations=JSON.parse(adoptedReview.payload_json).citations;
    // A public Reddit summary can follow its verified source history. Site
    // contributions require a separate consent/conflict review and stay blocked.
    if(!Array.isArray(citations)||!citations.length||citations.some(c=>c.source!=='reddit'||!posts.some(p=>new RegExp('^https://www\\.reddit\\.com/r/aigamedev/comments/'+p.id+'/_/[a-z0-9]+/$').test(c.url))))throw new Error('Published review citations must belong to the reviewed Reddit history');
  }
  const aliases=unchanged('game_aliases',`alias_id IN(${all}) OR game_id IN(${all})`);
  if(aliases.some(a=>members.includes(a.alias_id)))throw new Error('A reviewed entry is already an alias');
  const facts=unchanged('project_facts',`game_id IN(${all})`),adopted=[];
  for(const [field,from] of Object.entries(review.adoptFacts||{})){
    if(!review.aliases.includes(from))throw new Error('Fact source is outside the review');
    if(facts.some(f=>f.game_id===winner.id&&f.field===field))throw new Error('The current project already has this reviewed fact');
    const fact=facts.find(f=>f.game_id===from&&f.field===field);if(!fact||!posts.some(p=>p.url===fact.source_url))throw new Error('Missing source-linked fact');
    adopted.push({...fact,game_id:winner.id});
  }
  const enrichments=unchanged('project_enrichment',`game_id IN(${all})`);
  const oldChecks=unchanged('link_observations',`game_id IN(${all})`);
  if(new Set(oldChecks.map(c=>c.project_url+' '+c.checked_at)).size>52)throw new Error('Review long link history before combining');
  unchanged('project_references',`game_id IN(${all})`);
  const jobs=unchanged('editorial_jobs',`game_id IN(${old})`);if(jobs.some(j=>j.status==='running'))throw new Error('Wait for the current editorial job');
  const timeline=posts.sort((a,b)=>a.createdAt.localeCompare(b.createdAt)||a.id.localeCompare(b.id));
  const combined={...winner,posts:timeline,firstSeenAt:timeline[0].createdAt,updatedAt:timeline.at(-1).createdAt};
  const categories=await listCategories(db);validateGame(combined,categories);
  const accepted=Object.fromEntries([...facts.filter(f=>f.game_id===winner.id),...adopted].map(f=>[f.field,JSON.parse(f.value_json)]));
  const override=db.sql.prepare('SELECT details_json FROM project_overrides WHERE game_id=?').get(winner.id);
  const effective={...combined,...accepted,...(override?JSON.parse(override.details_json):{})};validateGame(effective,categories);
  for(const candidate of added){const p=candidate.post;
    statements.push(`INSERT INTO source_posts(id,game_id,author_key,created_at,retrieved_at,payload_json,status) VALUES(${quote(p.id)},${quote(winner.id)},${quote(author)},${quote(p.createdAt)},${quote(at)},${quote(JSON.stringify(p))},'published') ON CONFLICT(id) DO UPDATE SET game_id=excluded.game_id,author_key=excluded.author_key,created_at=excluded.created_at,retrieved_at=excluded.retrieved_at,payload_json=excluded.payload_json,status='published';`);
    for(const ref of candidate.references)statements.push(`INSERT INTO project_references(game_id,url,title,source_post_id) VALUES(${quote(winner.id)},${quote(ref.url)},${quote(ref.title)},${quote(p.id)}) ON CONFLICT(game_id,url) DO NOTHING;`);
    const score=scoreObservation(rawById.get(p.id),now);
    if(score)statements.push(`INSERT INTO reddit_scores(post_id,score,observed_at,checked_at) VALUES(${quote(score.postId)},${score.score},${quote(score.observedAt)},${quote(score.checkedAt)}) ON CONFLICT(post_id) DO NOTHING;`);
  }
  statements.push(...observations);
  for(const alias of review.aliases)statements.push(`INSERT INTO game_aliases(alias_id,game_id,reason,created_at) VALUES(${quote(alias)},${quote(winner.id)},${quote(review.reason)},${quote(at)});`);
  statements.push(`UPDATE game_aliases SET game_id=${quote(winner.id)} WHERE game_id IN(${old});`,
    `UPDATE games SET payload_json=${quote(JSON.stringify(combined))},updated_at=${quote(combined.updatedAt)} WHERE id=${quote(winner.id)};`,
    `UPDATE games SET status='hidden' WHERE id IN(${old});`,
    `UPDATE source_posts SET game_id=${quote(winner.id)} WHERE game_id IN(${old});`);
  for(const f of adopted)statements.push(`INSERT INTO project_facts(game_id,field,value_json,source_url,evidence_text,checked_at) VALUES(${['game_id','field','value_json','source_url','evidence_text','checked_at'].map(key=>quote(f[key])).join(',')});`);
  if(adoptedReview)statements.push(`UPDATE feedback_reviews SET game_id=${quote(winner.id)} WHERE game_id=${quote(adoptedReview.game_id)};`);
  // Keep the archived records too. Their failed, expired URLs are evidence,
  // not current destinations for the combined game.
  statements.push(`INSERT OR IGNORE INTO link_observations SELECT ${quote(winner.id)},project_url,checked_at,status,http_status,final_url,reason,redirect_count FROM link_observations WHERE game_id IN(${old});`,
    `INSERT INTO project_references(game_id,url,title,source_post_id) SELECT ${quote(winner.id)},url,title,source_post_id FROM project_references WHERE game_id IN(${old}) ON CONFLICT(game_id,url) DO NOTHING;`);
  const matching=enrichments.filter(e=>e.project_url===effective.projectUrl).sort((a,b)=>b.checked_at.localeCompare(a.checked_at))[0];
  if(matching&&matching.game_id!==winner.id)statements.push(`INSERT INTO project_enrichment(game_id,project_url,payload_json,checked_at) VALUES(${quote(winner.id)},${quote(matching.project_url)},${quote(matching.payload_json)},${quote(matching.checked_at)}) ON CONFLICT(game_id) DO UPDATE SET project_url=excluded.project_url,payload_json=excluded.payload_json,checked_at=excluded.checked_at;`);
  statements.push(`UPDATE editorial_jobs SET status='dismissed',payload_json=json_set(payload_json,'$.combinedInto',${quote(winner.id)}),updated_at=${quote(at)} WHERE game_id IN(${old}) AND status IN('pending','ready','failed');`,
    `INSERT INTO app_meta(key,value_json) VALUES(${quote('history_review:'+winner.id)},${quote(JSON.stringify({review,at,posts:timeline.map(p=>p.id)}))});`,
    `UPDATE app_meta SET value_json=json_set(value_json,'$.generatedAt',${quote(at)}) WHERE key='catalog';`,
    "DELETE FROM app_meta WHERE key='history_review_guard';");
  return {sql:statements.join('\n'),report:{keep:winner.id,aliases:review.aliases,posts:timeline.length,addedPosts:added.map(c=>c.post.id),adoptedFacts:adopted.map(f=>f.field),adoptedPublishedReview:adoptedReview?.game_id||null,retainedLinkChecks:oldChecks.length}};
}
