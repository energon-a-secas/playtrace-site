import { publishPreview } from './media-publication.mjs';
import { query, putMeta, meta, getGame } from './store.mjs';
import { acquire, release } from './lease.mjs';
import { canonicalProjectUrl } from './validation.mjs';
import { applyDetails } from './details.mjs';

const normalized = title => title.normalize('NFKC').toLowerCase().replace(/[^\p{L}\p{N}]+/gu,' ').trim();
const anchor = game => game.posts.find(post=>`g_${post.id}`===game.id) || game.posts[0];
export function likelyRepost(a,b) {
  if(a.author.name.toLowerCase()!==b.author.name.toLowerCase())return false;
  const pa=anchor(a),pb=anchor(b);
  if(Math.abs(Date.parse(pa.createdAt)-Date.parse(pb.createdAt))>48*3600000)return false;
  const x=normalized(pa.title),y=normalized(pb.title);
  if(Math.min(x.length,y.length)<50)return false;
  const ua=canonicalProjectUrl(a.projectUrl),ub=canonicalProjectUrl(b.projectUrl);
  if(ua&&ub&&ua!==ub)return false;
  if(x===y)return true;
  const ax=new Set(x.split(' ')),by=new Set(y.split(' '));
  const overlap=[...ax].filter(word=>by.has(word)).length/new Set([...ax,...by]).size;
  let prefix=0;while(prefix<Math.min(x.length,y.length)&&x[prefix]===y[prefix])prefix++;
  return overlap>=.92 || (prefix>=90 && overlap>=.78 && Math.min(x.length,y.length)/Math.max(x.length,y.length)>.85);
}
export function duplicateGroups(games) {
  const groups=[];
  for(const game of [...games].sort((a,b)=>anchor(b).createdAt.localeCompare(anchor(a).createdAt)||b.id.localeCompare(a.id))){
    const group=groups.find(group=>group.every(other=>likelyRepost(game,other)));
    if(group)group.push(game);else groups.push([game]);
  }
  return groups.filter(group=>group.length>1);
}
export function repostFlags(games) {
  const flags = [];
  const ordered = [...games].sort((a,b)=>anchor(b).createdAt.localeCompare(anchor(a).createdAt));
  const previous = new Map();
  for (const game of ordered) {
    const author = game.author.name.toLowerCase(), newer = previous.get(author); previous.set(author, game);
    if (!newer) continue;
    const hours = Math.abs(Date.parse(anchor(newer).createdAt)-Date.parse(anchor(game).createdAt))/3600000;
    const sameTitle = normalized(anchor(game).title) === normalized(anchor(newer).title);
    const sameLink = canonicalProjectUrl(game.projectUrl) && canonicalProjectUrl(game.projectUrl) === canonicalProjectUrl(newer.projectUrl);
    if (hours > 48 && !(sameTitle || sameLink)) continue;
    flags.push({ gameId: game.id, title: game.title, otherId: newer.id, otherTitle: newer.title, author: game.author.name,
      reason: sameLink ? 'Same maker and project link' : sameTitle ? 'Same maker and source title' : `Consecutive showcases by this maker, ${Math.round(hours)} hours apart`,
      automaticMatch: likelyRepost(game,newer) });
  }
  return flags.slice(0,50);
}
export async function resolveGame(db,id){
  const alias=await query(db,'SELECT game_id FROM game_aliases WHERE alias_id=?',id).first();
  const game=await getGame(db,alias?.game_id||id);return {gameId:game.id,redirected:Boolean(alias)};
}
export async function consolidateReposts(db,deps,apply=false,bucket=null){
  const lock=await acquire(db,'ingestion_lock',deps.now());if(!lock)return {busy:true,groups:[]};
  try{
    const rows=await query(db,"SELECT payload_json FROM games WHERE status='published' AND NOT EXISTS(SELECT 1 FROM removals WHERE game_id=games.id)").all();
    const games=rows.results.map(row=>JSON.parse(row.payload_json)), byId=new Map(games.map(game=>[game.id,game]));
    const groups=duplicateGroups(await applyDetails(db,games)).map(group=>group.map(game=>byId.get(game.id)));
    if(!apply)return {groups:groups.map(group=>({keep:group[0].id,title:group[0].title,aliases:group.slice(1).map(game=>game.id)})),flags:repostFlags(await applyDetails(db,games))};
    // One group per invocation keeps this bounded under the D1 statement budget.
    const group=groups[0];if(!group)return {merged:0,remaining:0};
    const [winner,...old]=group, ids=JSON.stringify(old.map(game=>game.id));
    const posts=[...new Map(group.flatMap(game=>game.posts).map(post=>[post.id,post])).values()].sort((a,b)=>a.createdAt.localeCompare(b.createdAt));
    const legacyPreview=winner.preview.storage!=='r2'?old.find(game=>game.preview.storage==='r2')?.preview:null;
    const combined={...winner,...(legacyPreview?{preview:legacyPreview}:{}),posts,firstSeenAt:posts[0].createdAt,updatedAt:posts.at(-1).createdAt};
    const now=new Date(deps.now()).toISOString();
    await db.batch([
      query(db,`INSERT INTO game_aliases(alias_id,game_id,reason,created_at) SELECT value,?,'Same-author repost within 48 hours; latest source retained',? FROM json_each(?) WHERE 1 ON CONFLICT(alias_id) DO UPDATE SET game_id=excluded.game_id`,winner.id,now,ids),
      query(db,'UPDATE game_aliases SET game_id=? WHERE game_id IN(SELECT value FROM json_each(?))',winner.id,ids),
      query(db,"UPDATE games SET payload_json=?,updated_at=? WHERE id=? AND status='published'",JSON.stringify(combined),combined.updatedAt,winner.id),
      query(db,"UPDATE games SET status='hidden' WHERE id IN(SELECT value FROM json_each(?))",ids),
      query(db,'UPDATE source_posts SET game_id=? WHERE game_id IN(SELECT value FROM json_each(?))',winner.id,ids),
      query(db,`INSERT INTO follows(subject,game_id,created_at) SELECT subject,?,created_at FROM follows WHERE game_id IN(SELECT value FROM json_each(?)) ON CONFLICT(subject,game_id) DO NOTHING`,winner.id,ids),
      query(db,`INSERT INTO price_signals(subject,game_id,amount_cents,currency,updated_at) SELECT subject,?,amount_cents,currency,updated_at FROM price_signals WHERE game_id IN(SELECT value FROM json_each(?)) ON CONFLICT(subject,game_id) DO UPDATE SET amount_cents=excluded.amount_cents,updated_at=excluded.updated_at WHERE excluded.updated_at>price_signals.updated_at`,winner.id,ids),
      query(db,`INSERT INTO ratings(game_id,guest_key_hash,stars,updated_at) SELECT ?,guest_key_hash,stars,updated_at FROM ratings WHERE game_id IN(SELECT value FROM json_each(?)) ON CONFLICT(game_id,guest_key_hash) DO UPDATE SET stars=excluded.stars,updated_at=excluded.updated_at WHERE excluded.updated_at>ratings.updated_at`,winner.id,ids),
      // Preserve a complete comparison as one record; never pair different baselines.
      query(db,`INSERT INTO play_expectations(game_id,guest_key_hash,first_interest,first_at,played_interest,expectation,played_at,updated_at,revision)
        SELECT ?,guest_key_hash,first_interest,first_at,played_interest,expectation,played_at,updated_at,revision FROM play_expectations WHERE game_id IN(SELECT value FROM json_each(?))
        ON CONFLICT(game_id,guest_key_hash) DO UPDATE SET first_interest=excluded.first_interest,first_at=excluded.first_at,played_interest=excluded.played_interest,expectation=excluded.expectation,played_at=excluded.played_at,updated_at=excluded.updated_at,revision=max(excluded.revision,play_expectations.revision)+1
        WHERE (excluded.played_at IS NOT NULL AND play_expectations.played_at IS NULL) OR ((excluded.played_at IS NULL)=(play_expectations.played_at IS NULL) AND excluded.updated_at>play_expectations.updated_at)`,winner.id,ids),
      query(db,`INSERT OR IGNORE INTO link_observations SELECT ?,project_url,checked_at,status,http_status,final_url,reason,redirect_count FROM link_observations WHERE game_id IN(SELECT value FROM json_each(?))`,winner.id,ids),
      query(db,`DELETE FROM link_observations WHERE game_id=? AND (project_url,checked_at) IN(SELECT project_url,checked_at FROM link_observations WHERE game_id=? ORDER BY checked_at DESC,project_url LIMIT -1 OFFSET 52)`,winner.id,winner.id),
      ...['play_expectations','link_observations'].map(table=>query(db,`DELETE FROM ${table} WHERE game_id IN(SELECT value FROM json_each(?))`,ids)),
      // Independent edits are retained on the archived rows. Adopt one only when the winner has no editor override.
      query(db,`INSERT INTO project_overrides(game_id,details_json,updated_by,updated_at,revision) SELECT ?,details_json,updated_by,updated_at,revision FROM project_overrides WHERE game_id IN(SELECT value FROM json_each(?)) ORDER BY updated_at DESC LIMIT 1 ON CONFLICT(game_id) DO NOTHING`,winner.id,ids),
      query(db,`INSERT INTO preview_overrides(game_id,preview_json,approved_by,updated_at) SELECT ?,preview_json,approved_by,updated_at FROM preview_overrides WHERE game_id IN(SELECT value FROM json_each(?)) ORDER BY updated_at DESC LIMIT 1 ON CONFLICT(game_id) DO NOTHING`,winner.id,ids),
      query(db,'UPDATE media_assets SET game_id=? WHERE game_id IN(SELECT value FROM json_each(?))',winner.id,ids),
      query(db,`INSERT INTO project_facts(game_id,field,value_json,source_url,evidence_text,checked_at)
        SELECT ?,field,value_json,source_url,evidence_text,checked_at FROM project_facts WHERE game_id IN(SELECT value FROM json_each(?))
        ORDER BY checked_at DESC ON CONFLICT(game_id,field) DO NOTHING`,winner.id,ids),
      query(db,'DELETE FROM project_facts WHERE game_id IN(SELECT value FROM json_each(?))',ids),
      query(db,'UPDATE questionnaires SET game_id=? WHERE game_id IN(SELECT value FROM json_each(?))',winner.id,ids),
      query(db,`INSERT INTO research_responses(questionnaire_id,game_id,guest_key_hash,revision,questions_json,answers_json,created_at,updated_at)
        SELECT questionnaire_id,?,guest_key_hash,revision,questions_json,answers_json,created_at,updated_at FROM research_responses WHERE game_id IN(SELECT value FROM json_each(?))
        ON CONFLICT(questionnaire_id,game_id,guest_key_hash) DO UPDATE SET revision=excluded.revision,questions_json=excluded.questions_json,answers_json=excluded.answers_json,updated_at=excluded.updated_at WHERE excluded.updated_at>research_responses.updated_at`,winner.id,ids),
      ...['follows','price_signals','ratings','research_responses'].map(table=>query(db,`DELETE FROM ${table} WHERE game_id IN(SELECT value FROM json_each(?))`,ids)),
      query(db,'UPDATE change_requests SET game_id=? WHERE game_id IN(SELECT value FROM json_each(?))',winner.id,ids),
      query(db,`UPDATE feedback SET game_id=? WHERE game_id IN(SELECT value FROM json_each(?)) AND guest_key_hash NOT IN(SELECT guest_key_hash FROM feedback WHERE game_id=?) AND id=(SELECT f.id FROM feedback f WHERE f.guest_key_hash=feedback.guest_key_hash AND f.game_id IN(SELECT value FROM json_each(?)) ORDER BY (f.status='hidden') DESC,f.updated_at DESC,f.id LIMIT 1)`,winner.id,ids,winner.id,ids),
      query(db,`UPDATE feedback SET status='hidden',moderation_reason='Moderation retained from consolidated repost'
        WHERE game_id=? AND EXISTS(SELECT 1 FROM feedback f WHERE f.game_id IN(SELECT value FROM json_each(?)) AND f.guest_key_hash=feedback.guest_key_hash AND f.status='hidden')`,winner.id,ids),
      query(db,`DELETE FROM feedback WHERE game_id IN(SELECT value FROM json_each(?)) AND status='published'`,ids),
      query(db,`INSERT INTO project_references(game_id,url,title,source_post_id) SELECT ?,url,title,source_post_id FROM project_references WHERE game_id IN(SELECT value FROM json_each(?)) ON CONFLICT(game_id,url) DO NOTHING`,winner.id,ids),
    ]);
    await publishPreview(db,bucket,winner.id);
    const head=await meta(db,'catalog');if(head)await putMeta(db,'catalog',{...head,generatedAt:now}).run();
    return {merged:old.length,keep:winner.id,aliases:old.map(game=>game.id),remaining:groups.length-1};
  }finally{await release(db,'ingestion_lock',lock);}
}
