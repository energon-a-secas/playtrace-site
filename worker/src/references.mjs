import { query, getGame } from './store.mjs';
import { readBytes } from './http.mjs';
import { decodeEntities } from './archive.mjs';
import { publicUrl } from './public-fetch.mjs';
import { applyDetails } from './details.mjs';

export function extractReferences(raw) {
  const body = typeof raw?.selftext === 'string' ? raw.selftext.slice(0,24000) : '';
  const labels = new Map([...body.matchAll(/\[([^\]\n]{1,180})\]\((https:\/\/[^\s)]+)\)/g)].map(m => [decodeEntities(m[2]), m[1]]));
  const found = new Map();
  for (const match of body.matchAll(/https:\/\/[^\s<>"\]]+/g)) {
    try {
      const value = decodeEntities(match[0]).replace(/\\([_*])/g,'$1').replace(/[).,;!*]+$/, ''), url = publicUrl(value);
      if (/\.(png|jpe?g|gif|webp|mp4|webm)(?:$|\?)/i.test(url.pathname) || url.href.length > 2048) continue;
      url.hash = '';
      const postId = ['reddit.com','www.reddit.com','old.reddit.com'].includes(url.hostname)
        ? /^\/(?:r\/[^/]+\/)?comments\/([a-z0-9]{5,12})(?:\/|$)/i.exec(url.pathname)?.[1]
        : url.hostname === 'redd.it' ? /^\/([a-z0-9]{5,12})(?:\/|$)/i.exec(url.pathname)?.[1] : null;
      if (postId === raw.id) continue;
      const slug = decodeURIComponent(url.pathname.split('/').filter(Boolean).at(-1) || url.hostname).replace(/[_-]/g,' ');
      if(postId){
        const tail=url.pathname.slice(url.pathname.indexOf(postId)+postId.length),comment=/^\/[^/]+\/([a-z0-9]{5,12})(?:\/|$)/i.exec(tail)?.[1];
        url.hostname='www.reddit.com';url.pathname=`/comments/${postId}/${comment?`_/${comment}/`:''}`;url.search='';
      }
      found.set(url.href, { url: url.href, title: (labels.get(value) || slug || url.hostname).slice(0,180), postId: postId || null, sourcePostId: raw.id });
      if (found.size >= 30) break;
    } catch { /* Ignore malformed or private links. */ }
  }
  return [...found.values()];
}
export async function archiveJson(path, deps) {
  for(let attempt=0;attempt<2;attempt++){
    const response = await deps.fetch(`https://arctic-shift.photon-reddit.com/api/${path}`, { headers: { Accept: 'application/json', 'User-Agent': 'Playtrace/1.0 (+https://playtrace.neorgon.com)' }, redirect: 'manual', signal: AbortSignal.timeout(15000) });
    if (!response.ok) {
      let timedOut=false;
      if(response.status===422){try{const data=JSON.parse(new TextDecoder().decode(await readBytes(response.body,8192)));timedOut=data.error==='Timeout. Maybe slow down a bit';}catch{}}
      else await response.body?.cancel();
      if(timedOut&&attempt===0){await deps.sleep(4000);continue;}
      const error=new Error(`Archive HTTP ${response.status}`);
      if(response.status===429){
        const retry=response.headers.get('Retry-After'),reset=Number(response.headers.get('X-RateLimit-Reset'))||0,rawAt=Number(response.headers.get('X-RateLimit-Reset-At'))||0;
        const resetAt=rawAt>0&&rawAt<1e12?rawAt*1000:rawAt, retryAt=/^\d+(\.\d+)?$/.test(retry||'')?deps.now()+Number(retry)*1000:Date.parse(retry)||0;
        Object.assign(error,{queueCooldown:'archive',retryAt:Math.max(deps.now()+60000,deps.now()+reset*1000,resetAt,retryAt)});
      }
      throw error;
    }
    const data = JSON.parse(new TextDecoder().decode(await readBytes(response.body, 8 * 1024 * 1024)));
    if (!Array.isArray(data.data)) throw new Error('Archive response could not be read.');
    return data.data;
  }
}
export async function refreshReferences(db, gameId, deps) {
  const game = await getGame(db, gameId), ids = [...game.posts].sort((a,b)=>b.createdAt.localeCompare(a.createdAt)).slice(0,25).map(post=>post.id);
  const raw = await archiveJson(`posts/ids?ids=${ids.join(',')}`, deps);
  const refs = raw.filter(post => ids.includes(post.id) && post.author?.toLowerCase() === game.author.name.toLowerCase() && !/^\[(removed|deleted)\]$/.test(post.selftext || '')).sort((a,b)=>a.created_utc-b.created_utc).flatMap(extractReferences);
  const linkedIds = [...new Set(refs.map(ref=>ref.postId).filter(Boolean))].slice(0,30);
  if (linkedIds.length) {
    const linked = await archiveJson(`posts/ids?ids=${linkedIds.join(',')}`, deps);
    for (const ref of refs) { const post = linked.find(post=>post.id===ref.postId); if (typeof post?.title==='string' && !/^\[(removed|deleted)\]$/.test(post.title)) ref.title=post.title.slice(0,300); }
  }
  const unique = [...new Map(refs.map(ref=>[ref.url,ref])).values()].slice(0,100);
  // Commit only after all source reads succeed; never empty a good list on a network failure.
  await db.batch([query(db, 'DELETE FROM project_references WHERE game_id=?', gameId),
    query(db, `INSERT INTO project_references(game_id,url,title,source_post_id)
      SELECT ?,json_extract(value,'$.url'),json_extract(value,'$.title'),json_extract(value,'$.sourcePostId') FROM json_each(?)`, gameId, JSON.stringify(unique))]);
  const sourceChecks=ids.map(id=>{const post=raw.find(row=>row.id===id);return {id,url:`https://www.reddit.com/r/aigamedev/comments/${id}/`,state:!post?'missing-from-archive':/^\[(deleted|removed)\]$/i.test(post.selftext||'')||/^\[(deleted|removed)\]$/i.test(post.author||'')||post.removed_by_category?'removed-in-archive':'present-in-archive'};});
  return { references: unique, sourceChecks, checkedPosts: raw.length, totalPosts: game.posts.length, checkedAt: new Date(deps.now()).toISOString() };
}
export async function projectContext(db, gameId) {
  const [game] = await applyDetails(db, [await getGame(db, gameId)]);
  const [references, review, enrichment] = await db.batch([
    query(db, 'SELECT url,title,source_post_id AS sourcePostId FROM project_references WHERE game_id=? ORDER BY source_post_id DESC,url', gameId),
    query(db, 'SELECT payload_json,published_at FROM feedback_reviews WHERE game_id=?', gameId),
    query(db, 'SELECT project_url,payload_json FROM project_enrichment WHERE game_id=?', gameId),
  ]);
  return { gameId, references: references.results, review: review.results[0] ? { ...JSON.parse(review.results[0].payload_json), publishedAt: review.results[0].published_at } : null,
    availability: enrichment.results[0]?.project_url === game.projectUrl ? JSON.parse(enrichment.results[0].payload_json) : null };
}
