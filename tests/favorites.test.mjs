import test from 'node:test';
import assert from 'node:assert/strict';
import { createFavoritesStore } from '../js/favorites.js';

function storage() {
  const values=new Map(); return { values, read:key=>structuredClone(values.get(key)), write:(key,value)=>{values.set(key,structuredClone(value));return true;} };
}
test('anonymous favorites survive a new visit and toggling never needs a service',()=>{
  const saved=storage(),first=createFavoritesStore(saved.read,saved.write);
  first.toggle(null,'g_first1');first.toggle(null,'g_second');first.toggle(null,'g_first1');
  const next=createFavoritesStore(saved.read,saved.write);assert.deepEqual(next.ids(null),['g_second']);
  assert.equal(next.toggle(null,'javascript:alert(1)'),null);
});
test('guest favorites join existing account favorites and have a durable offline handoff',()=>{
  const saved=storage(),store=createFavoritesStore(saved.read,saved.write);
  store.toggle(null,'g_guest1');store.reconcile('user_a',['g_remote']);store.adoptGuest('user_a');
  assert.deepEqual(store.ids('user_a'),['g_remote','g_guest1']);assert.deepEqual(store.ids(null),[]);
  const reloaded=createFavoritesStore(saved.read,saved.write);
  assert.equal(reloaded.pending('user_a')[0].gameId,'g_guest1');assert.deepEqual(reloaded.ids('user_b'),[]);
});
test('a late sync cannot erase a newer toggle or an offline removal',()=>{
  const saved=storage(),store=createFavoritesStore(saved.read,saved.write);
  store.toggle('user_a','g_first1');const sent=store.pending('user_a');
  store.toggle('user_a','g_first1');store.acknowledge('user_a',sent,['g_first1']);
  assert.deepEqual(store.ids('user_a'),[]);assert.equal(store.pending('user_a')[0].saved,false);
  store.reconcile('user_a',['g_first1','g_remote']);assert.deepEqual(store.ids('user_a'),['g_remote']);
  store.acknowledge('user_a',store.pending('user_a'),['g_remote']);assert.deepEqual(store.pending('user_a'),[]);
});
test('a new guest save survives a stale account cache and a remote removal',()=>{
  const saved=storage(),store=createFavoritesStore(saved.read,saved.write);
  store.reconcile('user_a',['g_first1']);
  store.toggle(null,'g_first1');store.adoptGuest('user_a');
  // Another device removed this game after the account was last used here.
  assert.deepEqual(store.reconcile('user_a',[]),['g_first1']);
  assert.equal(store.pending('user_a')[0].saved,true);assert.deepEqual(store.ids(null),[]);
});
test('storage write failures retain this visit and do not resurrect stale persisted favorites',()=>{
  const saved=storage();let canWrite=true;
  const store=createFavoritesStore(saved.read,(key,value)=>canWrite?saved.write(key,value):false);
  store.toggle(null,'g_first1');canWrite=false;
  assert.equal(store.toggle(null,'g_first1').persisted,false);assert.deepEqual(store.ids(null),[]);
  store.toggle(null,'g_second');assert.deepEqual(store.ids(null),['g_second']);
});
test('account deletion clears cached and queued favorites without affecting another account',()=>{
  const saved=storage(),store=createFavoritesStore(saved.read,saved.write);
  store.toggle('user_a','g_first1');store.toggle('user_b','g_second');store.clear('user_a');
  assert.deepEqual(store.ids('user_a'),[]);assert.deepEqual(store.pending('user_a'),[]);assert.deepEqual(store.ids('user_b'),['g_second']);
});
test('corrupt or oversized local data is bounded before use',()=>{
  const store=createFavoritesStore(()=>({ids:[null,'g_valid1','g_valid1','bad'],changes:{bad:{saved:true,revision:'x'}}}),()=>true);
  assert.deepEqual(store.ids(null),['g_valid1']);assert.deepEqual(store.pending(null),[]);
});
test('merged project favorites survive offline, deduplicate and retain the latest removal',()=>{
  const saved=storage(),store=createFavoritesStore(saved.read,saved.write);
  store.toggle(null,'g_older1');store.toggle(null,'g_latest');
  store.setAliases([{id:'g_latest',aliases:['g_older1']}]);
  assert.deepEqual(store.ids(null),['g_latest']);
  assert.equal(store.pending(null).length,1);
  store.toggle(null,'g_older1');assert.deepEqual(store.ids(null),[]);
  assert.equal(store.pending(null)[0].gameId,'g_latest');assert.equal(store.pending(null)[0].saved,false);
  const reload=createFavoritesStore(saved.read,saved.write);assert.deepEqual(reload.ids(null),[]);
  store.adoptGuest('user_a');assert.deepEqual(store.ids('user_a'),[]);
});
test('alias normalization preserves newer canonical intent and in-flight acknowledgements',()=>{
  const saved=storage(),store=createFavoritesStore(saved.read,saved.write);
  saved.values.set('playtrace.favorites.v1:user_a',{ids:['g_older1'],changes:{g_older1:{saved:true,revision:'older',updatedAt:1},g_latest:{saved:false,revision:'newer',updatedAt:2}}});
  store.setAliases([{id:'g_latest',aliases:['g_older1']}]);
  assert.deepEqual(store.reconcile('user_a',['g_older1']),[]);
  store.acknowledge('user_a',[{gameId:'g_older1',revision:'older'}],['g_latest']);assert.deepEqual(store.ids('user_a'),[]);
  assert.equal(store.pending('user_a')[0].revision,'newer');
  assert.deepEqual(store.ids('user_b'),[]);
});
