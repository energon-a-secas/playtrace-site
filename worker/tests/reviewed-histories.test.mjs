import test from 'node:test';import assert from 'node:assert/strict';
import {TestDB,fixtureGame,fixtureCatalog,NOW} from './helpers.mjs';
import {importCatalog,catalog} from '../src/store.mjs';
import {publicGame} from '../src/discovery.mjs';
import {reviewedHistoryPlan} from '../../scripts/reviewed-histories.mjs';
async function setup(){
 const db=new TestDB(),old=fixtureGame('older1'),latest=fixtureGame('latest');
 old.posts[0].createdAt=old.firstSeenAt=old.updatedAt='2026-07-01T10:00:00.000Z';
 await importCatalog(db,fixtureCatalog([old,latest]));
 const raw=[old,latest].map(g=>({id:g.posts[0].id,subreddit:'aigamedev',author:g.author.name,title:g.posts[0].title,link_flair_text:'Demo | Project | Workflow',created_utc:Date.parse(g.firstSeenAt)/1000,selftext:'My Puzzle is the same game. Following up on the earlier showcase.'}));
 const review={keep:latest.id,aliases:[old.id],reason:'The creator explicitly identifies the same named game in both reviewed showcases.',evidence:raw.map(r=>({postId:r.id,quote:'My Puzzle is the same game.'}))};
 return {db,old,latest,raw,review};
}
test('reviewed history retains source dates, alias paths, target contributions and old link evidence',async()=>{
 const {db,old,latest,raw,review}=await setup();
 db.sql.prepare('INSERT INTO ratings VALUES(?,?,?,?)').run(latest.id,'visitor',4,new Date(NOW).toISOString());
 db.sql.prepare('INSERT INTO link_observations VALUES(?,?,?,?,?,?,?,?)').run(old.id,'https://expired.example/','2026-10-01T00:00:00.000Z','broken',404,null,'missing',0);
 const plan=await reviewedHistoryPlan(db,review,raw,NOW);db.sql.exec('BEGIN;'+plan.sql+'COMMIT;');
 const result=await catalog(db);assert.equal(result.games.length,1);assert.equal(result.games[0].posts.length,2);assert.equal(result.games[0].firstSeenAt,old.firstSeenAt);
 assert.deepEqual(result.games[0].aliases,[old.id]);assert.equal((await publicGame(db,old.id)).games[0].id,latest.id);
 assert.equal(db.sql.prepare('SELECT stars FROM ratings WHERE game_id=?').get(latest.id).stars,4);
 assert.equal(db.sql.prepare('SELECT count(*) n FROM link_observations WHERE game_id=?').get(latest.id).n,1);
 assert.equal(db.sql.prepare('SELECT count(*) n FROM link_observations WHERE game_id=?').get(old.id).n,1);
 await importCatalog(db,fixtureCatalog([old]));assert.equal((await catalog(db)).games.length,1);db.close();
});
test('history planning rejects missing evidence, different makers, excluded flair and protected alias data',async()=>{
 const {db,old,raw,review}=await setup();
 await assert.rejects(reviewedHistoryPlan(db,{...review,evidence:[]},raw,NOW),/quote/);
 await assert.rejects(reviewedHistoryPlan(db,review,raw.map((r,i)=>i?{...r,author:'OtherMaker'}:r),NOW),/eligible/);
 await assert.rejects(reviewedHistoryPlan(db,review,raw.map((r,i)=>i?{...r,link_flair_text:'News'}:r),NOW),/eligible/);
 db.sql.prepare('INSERT INTO ratings VALUES(?,?,?,?)').run(old.id,'visitor',5,new Date(NOW).toISOString());
 await assert.rejects(reviewedHistoryPlan(db,review,raw,NOW),/ratings/);assert.equal((await catalog(db)).games.length,2);db.close();
});
test('a new visitor contribution or source change aborts the entire prepared transaction',async()=>{
 for(const change of ['rating','source']){
  const {db,old,raw,review}=await setup(),plan=await reviewedHistoryPlan(db,review,raw,NOW);
  if(change==='rating')db.sql.prepare('INSERT INTO ratings VALUES(?,?,?,?)').run(old.id,'visitor',5,new Date(NOW).toISOString());
  else db.sql.prepare("UPDATE source_posts SET status='rejected' WHERE game_id=?").run(old.id);
  db.sql.exec('BEGIN');assert.throws(()=>db.sql.exec(plan.sql),/NOT NULL/);db.sql.exec('ROLLBACK');
  assert.equal(db.sql.prepare('SELECT count(*) n FROM game_aliases').get().n,0);assert.equal((await catalog(db)).games.length,2);db.close();
 }
});
test('an eligible original joins history with a source score',async()=>{
 const {db,raw,review}=await setup();
 const original={...raw[0],id:'origin1',created_utc:Date.parse('2026-06-01T10:00:00Z')/1000,score:7};
 const decision={...review,addPosts:['origin1'],evidence:[...review.evidence,{postId:'origin1',quote:'My Puzzle is the same game.'}]};
 const plan=await reviewedHistoryPlan(db,decision,[...raw,original],NOW);db.sql.exec('BEGIN;'+plan.sql+'COMMIT;');
 assert.equal((await catalog(db)).games[0].posts.length,3);assert.equal(db.sql.prepare('SELECT score FROM reddit_scores WHERE post_id=?').get('origin1').score,7);db.close();
});
test('rejected, withdrawn and excluded additional sources cannot be restored by a history review',async()=>{
 for(const kind of ['rejected','withdrawn','excluded']){
  const {db,raw,review}=await setup();
  const original={...raw[0],id:'origin1',created_utc:Date.parse('2026-06-01T10:00:00Z')/1000};
  if(kind==='excluded')original.link_flair_text='Tools or Resource';
  if(kind==='rejected')db.sql.prepare('INSERT INTO source_posts(id,game_id,author_key,created_at,retrieved_at,payload_json,status) VALUES(?,NULL,?,?,?,?,?)').run(original.id,original.author.toLowerCase(),'2026-06-01T10:00:00.000Z',new Date(NOW).toISOString(),'{}','rejected');
  if(kind==='withdrawn')db.sql.prepare('INSERT INTO removals VALUES(?,?,?,?,?)').run('g_origin1','["origin1"]','Owner removal',new Date(NOW).toISOString(),'owner');
  await assert.rejects(reviewedHistoryPlan(db,{...review,addPosts:['origin1'],evidence:[...review.evidence,{postId:'origin1',quote:'My Puzzle'}]},[...raw,original],NOW));
  assert.equal(db.sql.prepare('SELECT count(*) n FROM game_aliases').get().n,0);db.close();
 }
});
