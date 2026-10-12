import test from 'node:test';import assert from 'node:assert/strict';
import {fixtureEnv,fixtureGame,fixtureCatalog,fixtureWorker,request,NOW} from './helpers.mjs';
import {importCatalog,removal} from '../src/store.mjs';
test('public single-project reads apply editorial overrides and resolve merges without returning private state',async()=>{
 const env=fixtureEnv(),worker=fixtureWorker();await importCatalog(env.DB,fixtureCatalog());
 env.DB.sql.prepare('INSERT INTO project_overrides(game_id,details_json,revision,updated_at,updated_by) VALUES(?,?,1,?,?)').run('g_abc12',JSON.stringify({title:'Approved game name'}),new Date(NOW).toISOString(),'owner');
 env.DB.sql.prepare('INSERT INTO game_aliases VALUES(?,?,?,?)').run('g_old123','g_abc12','repost',new Date(NOW).toISOString());
 const response=await worker.fetch(request('/games/g_old123'),env),value=await response.json();assert.equal(response.status,200);assert.equal(value.games.length,1);assert.equal(value.games[0].id,'g_abc12');assert.equal(value.games[0].title,'Approved game name');
 assert.equal(value.follows,undefined);assert.match(response.headers.get('Cache-Control'),/public/);
 await removal(env.DB,null,'g_abc12','Withdrawn',new Date(NOW).toISOString());assert.equal((await worker.fetch(request('/games/g_abc12'),env)).status,404);env.DB.close();
});
