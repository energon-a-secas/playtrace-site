import { query, getGame, removal } from './store.mjs';
import { exactKeys, invalid, ApiError } from './http.mjs';
import { text } from './validation.mjs';
import { acquire, release } from './lease.mjs';

export async function removeEntry(db, env, id, body, admin, deps) {
  exactKeys(body, ['confirm','reason']); text(body.reason,1200);
  if (body.confirm !== id) throw invalid('Confirm the selected project before removing it.');
  return removal(db,env.PREVIEWS,id,body.reason,new Date(deps.now()).toISOString(),admin.subject);
}
export async function removeSourcePost(db, gameId, postId, body, admin, deps) {
  exactKeys(body, ['confirm','reason']); text(body.reason,1200);
  if (body.confirm !== postId) throw invalid('Confirm the selected source post.');
  const owner=await acquire(db,'ingestion_lock',deps.now());
  if (!owner) throw new ApiError('EDIT_CONFLICT','Source syncing is running. Try again shortly.',409);
  try {
    const game=await getGame(db,gameId),post=game.posts.find(post=>post.id===postId);
    if (!post) throw invalid('This post is no longer in the project history.');
    if (game.posts.length===1) throw invalid('This is the only source. Remove the project instead.');
    const override=await query(db,'SELECT preview_json FROM preview_overrides WHERE game_id=?',gameId).first();
    if (game.preview.sourceUrl===post.url || (override && JSON.parse(override.preview_json).sourceUrl===post.url)) {
      throw invalid('This post credits the current preview. Keep it as the preview source, or remove the whole duplicate entry.');
    }
    const posts=game.posts.filter(item=>item.id!==postId).sort((a,b)=>a.createdAt.localeCompare(b.createdAt));
    const at=new Date(deps.now()).toISOString(),next={...game,posts,firstSeenAt:posts[0].createdAt,updatedAt:posts.at(-1).createdAt};
    await db.batch([
      query(db,`INSERT INTO app_meta(key,value_json) VALUES('source_removal_guard',CASE WHEN EXISTS(
        SELECT 1 FROM games WHERE id=? AND payload_json=? AND status='published' AND NOT EXISTS(SELECT 1 FROM removals WHERE game_id=games.id)
        AND COALESCE((SELECT preview_json FROM preview_overrides WHERE game_id=games.id),'null')=?)
        THEN 'true' ELSE NULL END) ON CONFLICT(key) DO UPDATE SET value_json=excluded.value_json`,gameId,JSON.stringify(game),override?.preview_json||'null'),
      query(db,"UPDATE source_posts SET status='rejected',payload_json=json_set(payload_json,'$.editorRemoval',json(?)) WHERE id=? AND game_id=?",JSON.stringify({reason:body.reason,at,by:admin.subject}),postId,gameId),
      query(db,'UPDATE games SET payload_json=?,updated_at=? WHERE id=?',JSON.stringify(next),next.updatedAt,gameId),
      query(db,'DELETE FROM project_references WHERE game_id=? AND source_post_id=?',gameId,postId),
      query(db,'DELETE FROM project_facts WHERE game_id=? AND source_url=?',gameId,post.url),
      query(db,"UPDATE app_meta SET value_json=json_set(value_json,'$.generatedAt',?) WHERE key='catalog'",at),
      query(db,"DELETE FROM app_meta WHERE key='source_removal_guard'"),
    ]);
    return {removed:true,gameId,postId};
  } catch(error) {
    if (/NOT NULL.*app_meta\.value_json/.test(error.message)) throw new ApiError('EDIT_CONFLICT','The project changed. Reload it before removing this post.',409);
    throw error;
  } finally { await release(db,'ingestion_lock',owner); }
}
