import test from 'node:test';
import assert from 'node:assert/strict';
import { splitSource } from '../src/source-split.mjs';
import { catalog, importCatalog } from '../src/store.mjs';
import { refreshSourceRecords } from '../src/source-evidence.mjs';
import { fixtureEnv, fixtureGame, fixtureCatalog, rawPost, NOW } from './helpers.mjs';

test('identity repair moves source evidence and its score without moving the old preview or project identity',async()=>{
 const env=fixtureEnv(),game=fixtureGame(),second=fixtureGame('later');game.posts.push(second.posts[0]);await importCatalog(env.DB,fixtureCatalog([game]));
 const raw=rawPost('later',{author:game.author.name,title:'STARBATTLE',selftext:'I made another game, unrelated to my previous puzzle.',score:12});
 await refreshSourceRecords(env.DB,[raw],{now:()=>NOW});
 const originalPreview=(await catalog(env.DB)).games[0].preview;
 const result=await splitSource(env.DB,game.id,raw,'Explicitly different project','test-operator',NOW);
 assert.equal(result.to,'g_later');const rows=(await catalog(env.DB)).games;
 assert.equal(rows.length,2);assert.equal(rows.find(g=>g.id===game.id).posts.length,1);
 assert.equal(rows.find(g=>g.id==='g_later').redditScore.score,12);assert.equal(rows.find(g=>g.id===game.id).redditScore,null);
 assert.deepEqual(rows.find(g=>g.id===game.id).preview,originalPreview);
 await assert.rejects(splitSource(env.DB,game.id,raw,'Again','test-operator',NOW));env.DB.close();
});
