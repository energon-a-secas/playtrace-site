import test from 'node:test';
import assert from 'node:assert/strict';
import {createWorker} from '../src/index.mjs';
import {importCatalog} from '../src/store.mjs';
import {fixtureEnv,fixtureCatalog,request,ORIGIN,OPERATOR} from './helpers.mjs';
import {publicCacheKey} from '../src/public-cache.mjs';

function memoryCache(){
  const entries=new Map();
  return {entries,async match(key){return entries.get(key.url)?.clone();},async put(key,response){entries.set(key.url,response.clone());}};
}
test('public discovery cache uses one revision read and reapplies CORS per request',async()=>{
  const env=fixtureEnv(),cache=memoryCache(),worker=createWorker({cache});
  await importCatalog(env.DB,fixtureCatalog());
  let first=await worker.fetch(request('/catalog'),env);assert.equal(first.status,200);
  const payload=await first.json(),reads=env.DB.statementCount;
  assert.ok(reads>0);assert.equal(cache.entries.size,1);
  assert.equal([...cache.entries.values()][0].headers.get('Access-Control-Allow-Origin'),null);
  const second=await worker.fetch(request('/catalog?pageSize=200',{origin:null}),env);
  assert.deepEqual(await second.json(),payload);assert.equal(env.DB.statementCount,reads+1);
  assert.equal(second.headers.get('Access-Control-Allow-Origin'),null);
  assert.equal((await worker.fetch(request('/catalog'),env)).headers.get('Access-Control-Allow-Origin'),ORIGIN);
  assert.equal((await worker.fetch(request('/catalog',{origin:'https://untrusted.example'}),env)).status,403);
  assert.equal(env.DB.statementCount,reads+2);
  const updated=fixtureCatalog();updated.games[0].title='Updated project';
  assert.equal((await worker.fetch(request('/admin/catalog',{method:'POST',body:updated,auth:OPERATOR}),env)).status,200);
  assert.equal((await (await worker.fetch(request('/catalog'),env)).json()).games[0].title,'Updated project');
  env.DB.close();
});
test('cache keys exclude private headers, writes and every non-discovery route',()=>{
  for(const header of ['Authorization','X-Feedback-Key','Cookie']){
    const req=request('/catalog');req.headers.set(header,'private');assert.equal(publicCacheKey(req,'catalog'),null);
  }
  for(const action of ['rating','feedback','research','me','jobs','context'])assert.equal(publicCacheKey(request('/catalog'),action),null);
  assert.equal(publicCacheKey(request('/catalog',{method:'POST',body:{}}),'catalog'),null);
  assert.notEqual(publicCacheKey(request('/catalog?cursor=first'),'catalog').url,publicCacheKey(request('/catalog?cursor=second'),'catalog').url);
});
test('cache errors and unavailable database responses do not poison later discovery',async()=>{
  const env=fixtureEnv(),cache=memoryCache(),worker=createWorker({cache});
  assert.equal((await worker.fetch(request('/catalog'),env)).status,503);assert.equal(cache.entries.size,0);
  await importCatalog(env.DB,fixtureCatalog());
  assert.equal((await worker.fetch(request('/catalog'),env)).status,200);
  const failing=createWorker({cache:{async match(){throw new Error('Cache unavailable');},async put(){throw new Error('Cache unavailable');}}});
  assert.equal((await failing.fetch(request('/catalog'),env)).status,200);
  const reads=env.DB.statementCount;
  assert.equal((await worker.fetch(request('/catalog',{auth:'private-token'}),env)).status,200);
  assert.ok(env.DB.statementCount>reads);
  env.DB.close();
});
