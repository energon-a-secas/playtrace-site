import { catalog, query, meta } from './store.mjs';
import { extractMentions } from '../../js/insight-evidence.js';
import { distributionFor } from '../../js/collection.js';

// A public-safe evidence projection behind admin authorization for the pilot.
// No questionnaire text, identities, guest keys, private jobs or notes are read.
export async function insightPage(db, cursor, deps) {
  const page = await catalog(db,{limit:200,cursor});
  const ids = JSON.stringify(page.games.map(game=>game.id));
  const rows = await query(db,`SELECT s.id,e.payload_json,e.checked_at FROM source_posts s JOIN source_evidence e ON e.post_id=s.id
    WHERE s.game_id IN(SELECT value FROM json_each(?)) AND s.status='published'`,ids).all();
  const sources = new Map(rows.results.map(row=>[row.id,{...JSON.parse(row.payload_json),checkedAt:row.checked_at}]));
  const games = page.games.map(game=>({
    id:game.id,title:game.title,author:game.author.name,category:game.category,stage:game.stage,
    distribution:distributionFor(game.projectUrl)?.label||'No project link',platforms:game.platforms,
    firstSeenAt:game.firstSeenAt,updatedAt:game.updatedAt,projectUrl:game.projectUrl,
    releaseKind:game.steam?.releaseKind||(game.availability?.demo===true?'demo':null),
    storeProvider:game.steam?'Steam':game.availability?.metadataVersion===2?game.availability.provider:null,
    storeCheckedAt:game.steam?.checkedAt||game.availability?.storeCheckedAt||null,
    storeState:game.steam?.state||null,browserBuild:game.availability?.browser===true,downloadableBuild:game.availability?.downloadable===true,storeEngines:game.availability?.engines||[],aiDisclosure:game.availability?.aiDisclosure||[],priceCents:game.steam?.currency==='USD'?game.steam.priceCents:null,
    linkState:game.availability?.status||'not-checked',linkCheckedAt:game.availability?.checkedAt||null,
    observations:game.posts.map(post=>{
      const source=sources.get(post.id),removed=source?.state==='removed';
      const full=source?.state==='available'&&Boolean(source.body);
      const mentions=extractMentions(removed?'':`${post.title}\n${full?source.body:post.excerpt||''}`);
      return {id:post.id,url:post.url,at:post.createdAt,coverage:removed?'removed':full?'full-text':post.excerpt?'title-excerpt':'title-only',
        checkedAt:source?.checkedAt||null,editedAt:source?.sourceEditedAt||null,...mentions};
    }),
  }));
  return {version:1,generatedAt:page.generatedAt,observedAt:new Date(deps.now()).toISOString(),source:page.source,
    history:cursor?null:await meta(db,'history'),categories:page.categories,pagination:page.pagination,games};
}
