import test from 'node:test';
import assert from 'node:assert/strict';
import { chooseHighlights, highlightWeek, rotateHighlights, getHighlights, saveHighlights } from '../src/highlights.mjs';
import { importCatalog, removal } from '../src/store.mjs';
import { fixtureEnv, fixtureGame, fixtureCatalog, fixtureWorker, request, NOW } from './helpers.mjs';
const admin={subject:'owner'},deps={now:()=>NOW};
const games=()=>Array.from({length:12},(_,i)=>({...fixtureGame('game'+String(i).padStart(2,'0'),'Maker'+i),title:'Game '+i,stage:'playable',projectUrl:`https://maker${i}.itch.io/game`}));
test('weekly period changes at Saturday midnight in Santiago, including both UTC offsets',()=>{
 assert.equal(highlightWeek(Date.parse('2026-10-10T02:59:59Z')),'2026-10-03');
 assert.equal(highlightWeek(Date.parse('2026-10-10T03:00:00Z')),'2026-10-10');
 assert.equal(highlightWeek(Date.parse('2026-07-11T03:59:59Z')),'2026-07-04');
 assert.equal(highlightWeek(Date.parse('2026-07-11T04:00:00Z')),'2026-07-11');
});
test('automatic picks honor pins, exclusions and author variety while preferring builds',()=>{
 const pool=games();pool[1].availability={status:'broken'};pool[2].title='A'.repeat(150);pool[3].author=pool[0].author;
 const chosen=chooseHighlights(pool,{items:[{gameId:pool[0].id,pinned:true}],excluded:[pool[4].id],recent:[pool[5].id]});
 assert.equal(chosen.length,5);assert.equal(chosen[0].gameId,pool[0].id);assert.equal(chosen[0].pinned,true);
 for(const game of [pool[1],pool[2],pool[3],pool[4],pool[5]])assert.ok(!chosen.some(item=>item.gameId===game.id));
});
test('Saturday rotation is idempotent, bounded, retains edits and rotates unpinned games next week',async()=>{
 const env=fixtureEnv();await importCatalog(env.DB,fixtureCatalog(games()));
 const before=env.DB.statementCount;assert.equal((await rotateHighlights(env.DB,deps)).rotated,true);assert.ok(env.DB.statementCount-before<20);
 const first=await getHighlights(env.DB,true);assert.equal(first.items.length,5);assert.equal((await rotateHighlights(env.DB,deps)).rotated,false);
 const items=first.items.map(({gameId},i)=>({gameId,pinned:i===2}));items.reverse();
 const edited=await saveHighlights(env.DB,{revision:first.revision,items,excluded:[]},admin,deps);
 assert.deepEqual(edited.items.map(item=>item.gameId),items.map(item=>item.gameId));
 await assert.rejects(saveHighlights(env.DB,{revision:first.revision,items,excluded:[]},admin,deps),error=>error.status===409);
 assert.equal((await rotateHighlights(env.DB,{now:()=>NOW+7*86400000})).rotated,true);
 const next=await getHighlights(env.DB);assert.equal(next.items[0].gameId,items.find(item=>item.pinned).gameId);
 assert.ok(next.items.slice(1).every(item=>!first.items.some(old=>old.gameId===item.gameId)));assert.ok(!Object.hasOwn(next,'excluded'));
 env.DB.close();
});
test('invalid, duplicate, excluded and removed selections are rejected; reads omit removed games',async()=>{
 const env=fixtureEnv();await importCatalog(env.DB,fixtureCatalog(games()));await rotateHighlights(env.DB,deps);const saved=await getHighlights(env.DB,true);
 const items=saved.items.map(({gameId,pinned})=>({gameId,pinned}));
 for(const body of [{revision:saved.revision,items:items.slice(1),excluded:[]},{revision:saved.revision,items:[items[0],items[0],...items.slice(2)],excluded:[]},{revision:saved.revision,items,excluded:[items[0].gameId]}])await assert.rejects(saveHighlights(env.DB,body,admin,deps));
 await removal(env.DB,null,items[0].gameId,'Creator request',new Date(NOW).toISOString());
 assert.equal((await getHighlights(env.DB)).items.length,4);
 await assert.rejects(saveHighlights(env.DB,{revision:saved.revision,items,excluded:[]},admin,deps));env.DB.close();
});
test('weekly picks are public and editing is authenticated',async()=>{
 const env=fixtureEnv(undefined,{CLERK_SECRET_KEY:'sk_test_'+'a'.repeat(40)});await importCatalog(env.DB,fixtureCatalog(games()));await rotateHighlights(env.DB,deps);const worker=fixtureWorker();
 assert.equal((await worker.fetch(request('/highlights'),env)).status,200);
 assert.equal((await worker.fetch(request('/admin/highlights'),env)).status,401);
 assert.equal((await worker.fetch(request('/admin/highlights',{method:'PUT',body:{}}),env)).status,401);env.DB.close();
});
