import { getGame, query } from './store.mjs';
import { normalizePost, sourceGame } from './archive.mjs';
import { validateGame } from './validation.mjs';
import { listCategories } from './categories.mjs';

// Operator-only repair of a reviewed identity error. Keeps all contributions
// and uploaded artwork on their existing project; moves only the cited source.
export async function splitSource(db, gameId, raw, reason, actor, now) {
  const game=await getGame(db,gameId),post=game.posts.find(p=>p.id===raw.id);
  if(!post||game.posts.length<2||game.id===`g_${post.id}`)throw new Error('Cannot split a missing or anchor source');
  const preview=await query(db,'SELECT preview_json FROM preview_overrides WHERE game_id=?',gameId).first();
  if(game.preview.sourceUrl===post.url||(preview&&JSON.parse(preview.preview_json).sourceUrl===post.url))throw new Error('Move the approved preview before splitting its source');
  const candidate=normalizePost(raw,now,{reviewUnlabeled:true,knownSource:true});
  if(!candidate||candidate.authorKey!==game.author.name.toLowerCase())throw new Error('The split needs an available, matching source');
  const created={...sourceGame(candidate),posts:[post],firstSeenAt:post.createdAt,updatedAt:post.createdAt};
  const posts=game.posts.filter(p=>p.id!==post.id).sort((a,b)=>a.createdAt.localeCompare(b.createdAt));
  const kept={...game,posts,firstSeenAt:posts[0].createdAt,updatedAt:posts.at(-1).createdAt};
  const categories=await listCategories(db);validateGame(created,categories);validateGame(kept,categories);
  const at=new Date(now).toISOString();
  await db.batch([
    query(db,`INSERT INTO app_meta(key,value_json) VALUES('source_split_guard',CASE WHEN
      EXISTS(SELECT 1 FROM games WHERE id=? AND payload_json=? AND status='published' AND NOT EXISTS(SELECT 1 FROM removals WHERE game_id=games.id))
      AND EXISTS(SELECT 1 FROM source_posts WHERE id=? AND game_id=? AND status='published')
      AND NOT EXISTS(SELECT 1 FROM games WHERE id=?) AND NOT EXISTS(SELECT 1 FROM game_aliases WHERE alias_id=?)
      AND COALESCE((SELECT preview_json FROM preview_overrides WHERE game_id=?),'null')=?
      THEN 'true' ELSE NULL END) ON CONFLICT(key) DO UPDATE SET value_json=excluded.value_json`,gameId,JSON.stringify(game),post.id,gameId,created.id,created.id,gameId,preview?.preview_json||'null'),
    query(db,"INSERT INTO games(id,author_key,project_url,updated_at,payload_json,status) VALUES(?,?,?,?,?,'published')",created.id,candidate.authorKey,created.projectUrl,created.updatedAt,JSON.stringify(created)),
    query(db,'UPDATE games SET payload_json=?,updated_at=? WHERE id=?',JSON.stringify(kept),kept.updatedAt,gameId),
    query(db,'UPDATE source_posts SET game_id=? WHERE id=? AND game_id=?',created.id,post.id,gameId),
    query(db,'UPDATE project_references SET game_id=? WHERE game_id=? AND source_post_id=?',created.id,gameId,post.id),
    query(db,'DELETE FROM project_facts WHERE game_id=? AND source_url=?',gameId,post.url),
    query(db,"INSERT INTO app_meta(key,value_json) VALUES(?,?)",`source_split:${post.id}`,JSON.stringify({from:gameId,to:created.id,postId:post.id,reason,actor,at})),
    query(db,"UPDATE app_meta SET value_json=json_set(value_json,'$.generatedAt',?) WHERE key='catalog'",at),
    query(db,"DELETE FROM app_meta WHERE key='source_split_guard'"),
  ]);
  return {from:gameId,to:created.id,postId:post.id};
}
