import test from 'node:test';
import assert from 'node:assert/strict';
import { validateCatalog, selectGames, defaults, readLocation, locationForState } from '../js/collection.js';
import { redditScoreBadge } from '../js/reddit-score.js';
import { fixtureGame, fixtureCatalog, NOW } from '../worker/tests/helpers.mjs';

test('score sorting puts observed zero and negatives above unknown, composes filters and shares in URL',()=>{
  const games=[null,0,12,-2].map((score,i)=>{const game=fixtureGame('post'+i);game.redditScore=score===null?null:{score,postId:game.posts[0].id,url:game.posts[0].url,observedAt:null,checkedAt:new Date(NOW).toISOString(),coveredPosts:1,totalPosts:1};return game;});
  const catalog=validateCatalog(fixtureCatalog(games));
  const state={...defaults,sort:'reddit'};
  assert.deepEqual(selectGames(catalog.games,state).map(g=>g.redditScore?.score??null),[12,0,-2,null]);
  assert.equal(readLocation(locationForState('https://playtrace.example/browse.html',state)).sort,'reddit');
  assert.match(redditScoreBadge(games[1]),/> 0</);assert.equal(redditScoreBadge(games[0]),'');
  assert.match(redditScoreBadge(games[1]),/not a Playtrace rating/);
  const bad=structuredClone(catalog);bad.games[1].redditScore.url='https://elsewhere.example/';assert.throws(()=>validateCatalog(bad));
});
