import { query, getGame } from './store.mjs';
import { guestIdentity } from './feedback.mjs';
import { mutationLimit } from './limits.mjs';
import { exactKeys, invalid, ApiError } from './http.mjs';
import { expectationOptions } from '../../js/expectation-options.js';

const fields='first_interest,first_at,played_interest,expectation,played_at,updated_at,revision';
const project=row=>row?{firstInterest:row.first_interest,firstAt:row.first_at,playedInterest:row.played_interest,expectation:row.expectation,playedAt:row.played_at,updatedAt:row.updated_at,revision:row.revision}:null;
export async function ownExpectation(db,env,request,gameId) {
  await getGame(db,gameId);const key=await guestIdentity(request,env);
  return {gameId,entry:project(await query(db,`SELECT ${fields} FROM play_expectations WHERE game_id=? AND guest_key_hash=?`,gameId,key).first())};
}
export async function saveExpectation(db,env,request,gameId,body,deps) {
  await getGame(db,gameId);const key=await guestIdentity(request,env);
  if(request.method==='DELETE'){
    await mutationLimit(db,env,`guest:${key}`,request,'privacy',deps.now());
    await query(db,'DELETE FROM play_expectations WHERE guest_key_hash=? AND (game_id=? OR game_id IN(SELECT alias_id FROM game_aliases WHERE game_id=?))',key,gameId,gameId).run();
    return {deleted:true};
  }
  const played=body?.phase==='after-play';
  exactKeys(body,['phase','interest','revision',...(played?['expectation']:[])]);
  if(!['first-look','after-play'].includes(body.phase)||!Number.isInteger(body.interest)||body.interest<1||body.interest>5
    ||!Number.isSafeInteger(body.revision)||body.revision<0||played&&!Object.hasOwn(expectationOptions,body.expectation))throw invalid('Choose an interest level and a valid follow-up.');
  await mutationLimit(db,env,`guest:${key}`,request,'price',deps.now());
  const at=new Date(deps.now()).toISOString();let row;
  if(played){
    row=await query(db,`UPDATE play_expectations SET played_interest=?,expectation=?,played_at=COALESCE(played_at,?),updated_at=?,revision=revision+1
      WHERE game_id=? AND guest_key_hash=? AND revision=? AND first_at<?
      AND EXISTS(SELECT 1 FROM games WHERE id=? AND status='published' AND NOT EXISTS(SELECT 1 FROM removals WHERE game_id=games.id)) RETURNING ${fields}`,
      body.interest,body.expectation,at,at,gameId,key,body.revision,at,gameId).first();
  }else{
    row=await query(db,`INSERT INTO play_expectations(game_id,guest_key_hash,first_interest,first_at,updated_at)
      SELECT id,?,?,?,? FROM games WHERE id=? AND status='published' AND NOT EXISTS(SELECT 1 FROM removals WHERE game_id=games.id)
      AND (?=0 OR EXISTS(SELECT 1 FROM play_expectations WHERE game_id=? AND guest_key_hash=?))
      ON CONFLICT(game_id,guest_key_hash) DO UPDATE SET first_interest=excluded.first_interest,first_at=excluded.first_at,updated_at=excluded.updated_at,revision=play_expectations.revision+1
      WHERE play_expectations.played_at IS NULL AND play_expectations.revision=? RETURNING ${fields}`,
      key,body.interest,at,at,gameId,body.revision,gameId,key,body.revision).first();
  }
  if(!row){await getGame(db,gameId);throw new ApiError('CONFLICT','This comparison changed or needs a saved first impression. Reload before continuing.',409);}
  return {gameId,entry:project(row)};
}
export async function expectationAggregates(db,ids,since,until) {
  const [counts,pairs]=await db.batch([
    query(db,`SELECT game_id,count(*) AS started FROM play_expectations WHERE game_id IN(SELECT value FROM json_each(?)) AND first_at>=? AND first_at<=? GROUP BY game_id`,JSON.stringify(ids),since,until),
    query(db,`SELECT game_id,first_interest AS before,played_interest AS after,expectation,count(*) AS count FROM play_expectations
      WHERE game_id IN(SELECT value FROM json_each(?)) AND first_at>=? AND first_at<=? AND played_at IS NOT NULL AND played_at<=?
      GROUP BY game_id,first_interest,played_interest,expectation`,JSON.stringify(ids),since,until,until),
  ]);
  return ids.map(id=>({id,started:counts.results.find(row=>row.game_id===id)?.started||0,
    pairs:pairs.results.filter(row=>row.game_id===id).map(({before,after,expectation,count})=>({before,after,expectation,count}))}));
}
