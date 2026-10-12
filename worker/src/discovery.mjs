import { query, getGame, meta } from './store.mjs';
import { listCategories } from './categories.mjs';
import { enrichGames } from './steam.mjs';

export async function publicGame(db,id){
  const alias=await query(db,'SELECT game_id FROM game_aliases WHERE alias_id=?',id).first();
  const [game,head,categories]=await Promise.all([getGame(db,alias?.game_id||id),meta(db,'catalog'),listCategories(db)]);
  return {...head,categories,games:await enrichGames(db,[game])};
}
