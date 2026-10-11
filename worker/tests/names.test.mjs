import test from 'node:test';
import assert from 'node:assert/strict';
import { inferName, nameForGame } from '../src/names.mjs';
import { projectLinks } from '../src/project-links.mjs';
import { normalizePost, sourceGame } from '../src/archive.mjs';
import { normalizeSteam } from '../src/steam.mjs';
import { fixtureEnv, fixtureGame, fixtureCatalog, rawPost, NOW } from './helpers.mjs';
import { catalog, importCatalog } from '../src/store.mjs';
import { detailsOf, editDetails } from '../src/details.mjs';
import { pageName, reviewNames, reviewSql } from '../../scripts/review-game-names.mjs';

test('new showcases lead with game names and retain the original Reddit title',()=>{
  const title='12 year game dev, and this is my first AI game';
  const game=sourceGame(normalizePost(rawPost('new12',{title,url:'https://motawe3.itch.io/underbloom'}),NOW));
  assert.equal(game.title,'Underbloom');assert.equal(game.posts[0].title,title);
  assert.equal(inferName({title:'My kingdom game has a demo',projectUrl:'https://store.steampowered.com/app/4610750/Wayward_Crown_Demo'}).title,'Wayward Crown Demo');
  assert.equal(inferName({title:'My kingdom game has a demo',projectUrl:'https://store.steampowered.com/app/4610750/',steamTitle:'Wayward Crown Demo'}).title,'Wayward Crown Demo');
  assert.equal(inferName({title:'My puzzle game',projectUrl:'https://demos.tahazsh.com/shapeleon/',pageTitle:'Shapeleon'}).title,'Shapeleon');
  assert.equal(inferName({title:'I built this game',projectUrl:'https://moon-garden.example/',pageTitle:'Moon Garden'}).title,'Moon Garden');
  assert.equal(inferName({title:'Feral Meadow — a creature collecting game'}).title,'Feral Meadow');
});
test('uncertain URLs, opaque IDs, tools, error pages and generic headlines never become fabricated names',()=>{
  for(const url of ['https://example.com/play/','https://example.com/123456/','https://claude.ai/artifacts/12345','https://github.com/maker/unity-mcp','https://wiki.wikipedia.org/wiki/Dungeon_Keeper']) {
    assert.equal(inferName({title:'I built a game',projectUrl:url,pageTitle:'Just a moment...'}),null,url);
  }
  assert.equal(inferName({title:'My first game: a browser adventure'}),null);
  assert.equal(inferName({title:'I made a game',body:'Play https://random-host-id.vercel.app/',projectUrl:'https://random-host-id.vercel.app/'}),null,'URL text cannot corroborate its own hosting identifier');
  assert.equal(inferName({title:'Meet Orin — the protagonist of my game'}),null);
  assert.equal(inferName({title:'I made my boat game',body:'I love boats!',projectUrl:'https://boat.example.com/'}),null);
  assert.equal(inferName({title:'A game prototype',projectUrl:'https://example.com/guess/',pageTitle:'Unrelated Product'}),null);
  const reviewed={...fixtureGame(),reviewStatus:'reviewed'};assert.equal(nameForGame(reviewed,{steamTitle:'Another title'}),null);
});
test('playable GitHub Pages links win over code repositories in either source order',()=>{
  const playable='https://goldsziggy.github.io/z-ark-digivice/play',repo='https://github.com/goldsziggy/z-ark-digivice';
  for(const selftext of [`Source code: ${repo}\nPlayable browser preview: ${playable}/`, `Play: ${playable}/\nGitHub: ${repo}`]) {
    assert.deepEqual(projectLinks({url:repo,selftext}),{projectUrl:playable,repositoryUrl:repo});
  }
  assert.equal(projectLinks({url:repo,selftext:'My open source game'}).projectUrl,repo);
  assert.equal(projectLinks({selftext:'Play my game: https://maker.github.io/moon/**'}).projectUrl,'https://maker.github.io/moon');
  assert.equal(projectLinks({selftext:'Music generation: I stumbled upon https://github.com/vitling/acid-banger'}).repositoryUrl,null);
});
test('Steam demos provide verified names without masquerading as full releases; explicit admin names always win',async()=>{
  const data={steam_appid:4610750,type:'demo',name:'Wayward Crown Demo',is_free:true,release_date:{coming_soon:false}};
  const steam=normalizeSteam({'4610750':{success:true,data}},'4610750',NOW);
  assert.equal(steam.type,'demo');assert.equal(steam.priceCents,0);
  const env=fixtureEnv(), game={...fixtureGame(),projectUrl:steam.url,reviewStatus:'source-described'};await importCatalog(env.DB,fixtureCatalog([game]));
  env.DB.sql.prepare('INSERT INTO steam_cache VALUES(?,?,?,?)').run(steam.appId,JSON.stringify(steam),steam.checkedAt,NOW+100000);
  assert.equal((await catalog(env.DB)).games[0].title,steam.title);
  await editDetails(env.DB,game.id,{mode:'edit',revision:0,details:detailsOf(game)},{subject:'admin'},{now:()=>NOW});
  assert.equal((await catalog(env.DB)).games[0].title,game.title,'even a manual choice identical to the source headline wins');env.DB.close();
});
test('catalogue repair preserves timelines and newer field edits and is safe to run twice',async()=>{
  const env=fixtureEnv(), game={...fixtureGame(),reviewStatus:'source-described',title:'My small puzzle game'};
  game.projectUrl='https://maker.itch.io/underbloom';await importCatalog(env.DB,fixtureCatalog([game]));
  const raw=[{id:'abc12',author:'MakerName',title:game.title,selftext:'Play my game!',url:game.projectUrl}];
  const report=reviewNames([game],raw,{}),sql=reviewSql(report);
  env.DB.sql.exec(sql);env.DB.sql.exec(sql);
  const stored=JSON.parse(env.DB.sql.prepare('SELECT payload_json FROM games').get().payload_json);
  assert.equal(stored.title,'Underbloom');assert.deepEqual(stored.posts,game.posts);
  env.DB.sql.prepare("UPDATE games SET payload_json=json_set(payload_json,'$.title','A newer editorial correction')").run();env.DB.sql.exec(sql);
  assert.equal(JSON.parse(env.DB.sql.prepare('SELECT payload_json FROM games').get().payload_json).title,'A newer editorial correction');env.DB.close();
  assert.equal(pageName('<meta content="Underbloom by Motawe3" property="og:title">'),'Underbloom');
});
