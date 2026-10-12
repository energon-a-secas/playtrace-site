import test from 'node:test';
import assert from 'node:assert/strict';
import { fixtureEnv, fixtureGame, fixtureCatalog, fixtureWorker, request, token, NOW } from './helpers.mjs';
import { importCatalog, catalog, getGame } from '../src/store.mjs';
import { syncFavorites, getMe } from '../src/accounts.mjs';
import { removeSourcePost, removeEntry } from '../src/moderation.mjs';
import { repostFlags, likelyRepost } from '../src/duplicates.mjs';
const deps={now:()=>NOW},admin={subject:'owner'};
async function setup(games=[fixtureGame()]){const env=fixtureEnv();await importCatalog(env.DB,fixtureCatalog(games));return env;}
test('batch favorites union with existing saves, resolve aliases, and keep accounts isolated',async()=>{
  const env=await setup([fixtureGame(),fixtureGame('other1'),fixtureGame('hidden')]);
  env.DB.sql.prepare("UPDATE games SET status='hidden' WHERE id='g_hidden'").run();
  env.DB.sql.prepare("INSERT INTO game_aliases VALUES('g_hidden','g_abc12','repost',?)").run(new Date(NOW).toISOString());
  const apply=(user,changes)=>syncFavorites(env.DB,env,user,request('/me/favorites',{method:'PUT'}),{changes},deps);
  await apply('user_a',[{gameId:'g_other1',saved:true}]);
  const result=await apply('user_a',[{gameId:'g_hidden',saved:true},{gameId:'g_gone12',saved:true}]);
  assert.deepEqual(new Set(result.follows),new Set(['g_abc12','g_other1']));
  await apply('user_b',[{gameId:'g_abc12',saved:true}]);await apply('user_a',[{gameId:'g_hidden',saved:false}]);
  assert.deepEqual((await getMe(env.DB,'user_a')).follows,['g_other1']);assert.deepEqual((await getMe(env.DB,'user_b')).follows,['g_abc12']);
  await assert.rejects(apply('user_a',[{gameId:'g_abc12',saved:'true'}]));env.DB.close();
});
test('favorites sync and moderation routes require their correct authentication',async()=>{
  const env=await setup(),worker=fixtureWorker();
  env.CLERK_SECRET_KEY=`sk_test_${'a'.repeat(40)}`;
  for(const path of ['/me/favorites','/admin/games/g_abc12/delete','/admin/games/g_abc12/posts/abc12/remove']){
    const result=await worker.fetch(request(path,{method:path==='/me/favorites'?'PUT':'POST',body:{}}),env);assert.equal(result.status,401,path);
  }
  const response=await worker.fetch(request('/me/favorites',{method:'PUT',body:{changes:[{gameId:'g_abc12',saved:true}]},auth:await token()}),env);
  assert.equal(response.status,200);assert.deepEqual((await response.json()).follows,['g_abc12']);env.DB.close();
});
test('a full 200-change favorites sync fits the bounded authenticated request body',async()=>{
  const env=await setup(),worker=fixtureWorker();
  const changes=Array.from({length:200},(_,i)=>({gameId:'g_'+i.toString(36).padStart(12,'x'),saved:true}));
  assert.ok(JSON.stringify({changes}).length>8192);
  const response=await worker.fetch(request('/me/favorites',{method:'PUT',body:{changes},auth:await token()}),env);
  assert.equal(response.status,200);assert.deepEqual((await response.json()).follows,[]);env.DB.close();
});
test('source removal updates history, keeps contributions and cannot be resurrected by an import',async()=>{
  const game=fixtureGame();game.posts.push({...game.posts[0],id:'newer1',url:'https://www.reddit.com/r/aigamedev/comments/newer1/',createdAt:'2026-10-10T10:00:00.000Z'});game.updatedAt=game.posts[1].createdAt;
  const env=await setup([game]);env.DB.sql.prepare('INSERT INTO follows VALUES(?,?,?)').run('reader',game.id,new Date(NOW).toISOString());
  await removeSourcePost(env.DB,game.id,'newer1',{confirm:'newer1',reason:'Corrected repost'},admin,deps);
  const current=await getGame(env.DB,game.id);assert.equal(current.posts.length,1);assert.equal(current.updatedAt,current.firstSeenAt);
  assert.equal(env.DB.sql.prepare("SELECT status FROM source_posts WHERE id='newer1'").get().status,'rejected');
  assert.equal((await getMe(env.DB,'reader')).follows.length,1);await assert.rejects(importCatalog(env.DB,fixtureCatalog([game])),/excluded/);env.DB.close();
});
test('required preview and only-source removals are rejected without losing history',async()=>{
  const game=fixtureGame(),env=await setup([game]);
  await assert.rejects(removeSourcePost(env.DB,game.id,'abc12',{confirm:'abc12',reason:'Duplicate'},admin,deps),/only source/);
  game.posts.push({...game.posts[0],id:'other1',url:'https://www.reddit.com/r/aigamedev/comments/other1/'});await importCatalog(env.DB,fixtureCatalog([game]));
  await assert.rejects(removeSourcePost(env.DB,game.id,'abc12',{confirm:'abc12',reason:'Duplicate'},admin,deps),/preview/);
  assert.equal((await getGame(env.DB,game.id)).posts.length,2);env.DB.close();
});
test('admin entry removal requires an explicit ID and leaves an attributed tombstone',async()=>{
  const env=await setup();await assert.rejects(removeEntry(env.DB,env,'g_abc12',{confirm:'wrong',reason:'Duplicate'},admin,deps));
  await removeEntry(env.DB,env,'g_abc12',{confirm:'g_abc12',reason:'Duplicate'},admin,deps);
  assert.equal((await catalog(env.DB)).games.length,0);
  assert.equal(env.DB.sql.prepare("SELECT removed_by FROM removals WHERE game_id='g_abc12'").get().removed_by,'owner');
  await importCatalog(env.DB,fixtureCatalog());assert.equal((await catalog(env.DB)).games.length,0);env.DB.close();
});
test('nearby different games are flagged for review without qualifying for automatic consolidation',()=>{
  const a=fixtureGame(),b=fixtureGame('other1');b.title=b.posts[0].title='A completely different racing game';b.projectUrl='https://maker.itch.io/racing';
  b.posts[0].createdAt=new Date(Date.parse(a.posts[0].createdAt)+3600000).toISOString();
  const flags=repostFlags([a,b]);assert.equal(flags.length,1);assert.equal(flags[0].automaticMatch,false);assert.equal(likelyRepost(a,b),false);
  b.author.name='AnotherMaker';assert.equal(repostFlags([a,b]).length,0);
});
