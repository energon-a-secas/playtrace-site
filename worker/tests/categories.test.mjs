import test from 'node:test';
import assert from 'node:assert/strict';
import { fixtureEnv, fixtureWorker, fixtureCatalog, request, token } from './helpers.mjs';
import { catalog, importCatalog } from '../src/store.mjs';
import { detailsOf } from '../src/details.mjs';
import { validateCatalog, readLocation, selectGames, defaults } from '../../js/collection.js';

const worker = fixtureWorker(async()=>Response.json({id:'user_a',primary_email_address_id:'e1',email_addresses:[{id:'e1',email_address:'luciano.adonis.villarroel@gmail.com',verification:{status:'verified'}}]}));
const create=(env,auth,label)=>worker.fetch(request('/admin/categories',{method:'POST',auth,body:{label}}),env);
test('admins create reusable categories, apply them, and retain them across imports and shared public views',async()=>{
  const env=fixtureEnv(undefined,{CLERK_SECRET_KEY:`sk_test_${'a'.repeat(40)}`}),seed=fixtureCatalog(),auth=await token();
  await importCatalog(env.DB,seed);
  assert.equal((await create(env,undefined,'Idle RPG')).status,401);
  const created=await (await create(env,auth,'  Idle   RPG  ')).json();
  assert.equal(created.created,true);assert.deepEqual(created.category,{id:'idle-rpg',label:'Idle RPG'});
  const details={...detailsOf(seed.games[0]),category:created.category.id};
  assert.equal((await worker.fetch(request('/admin/games/g_abc12/details',{method:'PUT',auth,body:{mode:'edit',revision:0,details}}),env)).status,200);
  await importCatalog(env.DB,seed);
  const visible=validateCatalog(await catalog(env.DB));
  assert.equal(visible.games[0].category,'idle-rpg');assert.ok(visible.categories.some(c=>c.id==='clicker'));
  const state={...defaults,...readLocation('https://playtrace.example/?cat=idle-rpg'),catalog:visible};
  assert.equal(state.category,'idle-rpg');assert.equal(selectGames(visible.games,state).length,1);
  assert.equal(selectGames(visible.games,{...defaults,query:'Idle RPG',catalog:visible}).length,1);
  const editor=await (await worker.fetch(request('/admin/games/g_abc12',{auth}),env)).json();
  assert.ok(editor.categories.some(c=>c.id==='idle-rpg'));
  env.DB.close();
});
test('duplicate categories are reused and invalid names or unknown project categories fail without writes',async()=>{
  const env=fixtureEnv(undefined,{CLERK_SECRET_KEY:`sk_test_${'a'.repeat(40)}`}),auth=await token();await importCatalog(env.DB,fixtureCatalog());
  assert.equal((await (await create(env,auth,'clicker')).json()).created,false);
  for(const value of ['', 'all', '<img src=x>', 'x'.repeat(49), 'Bad\nname']) assert.equal((await create(env,auth,value)).status,400,value);
  const first=await (await create(env,auth,'Cozy Games')).json();
  const repeat=await (await create(env,auth,'COZY GAMES')).json();assert.equal(repeat.created,false);assert.deepEqual(repeat.category,first.category);
  const bad=fixtureCatalog();bad.games[0].category='unregistered';await assert.rejects(importCatalog(env.DB,bad));
  assert.equal(env.DB.sql.prepare('SELECT count(*) n FROM game_categories').get().n,10);env.DB.close();
});
