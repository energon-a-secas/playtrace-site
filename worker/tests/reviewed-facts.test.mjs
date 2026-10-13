import test from 'node:test';
import assert from 'node:assert/strict';
import { fixtureEnv,fixtureCatalog,fixtureGame,fixtureWorker,request,NOW,rawPost } from './helpers.mjs';
import { importCatalog,catalog,removal } from '../src/store.mjs';
import { applyDetails,editDetails,detailsOf } from '../src/details.mjs';
import { enqueueJobs,listJobs } from '../src/jobs.mjs';
import { refreshSourceRecords } from '../src/source-evidence.mjs';
import { publicCacheKey } from '../src/public-cache.mjs';
import { ingest } from '../src/ingestion.mjs';
import { projectLinks } from '../src/project-links.mjs';
import { classifySource, storeCategory } from '../src/taxonomy.mjs';

test('demo announcements stay playable rather than a full release, and mixed store genres stay uncertain',()=>{
  assert.equal(classifySource('I released the demo for my game on Steam').stage,'playable');
  assert.equal(classifySource('I will release the demo next week').stage,'unknown');
  assert.equal(classifySource('I am prototyping a narrative game').stage,'prototype');
  assert.equal(storeCategory(['Indie','Puzzle']),'puzzle');
  assert.equal(storeCategory(['Action','RPG']),null);
  assert.equal(storeCategory(['Indie','Casual']),null);
});
const deps={now:()=>NOW};
function fact(db,field,value,url='https://www.reddit.com/r/aigamedev/comments/abc12/'){db.sql.prepare('INSERT INTO project_facts VALUES(?,?,?,?,?,?)').run('g_abc12',field,JSON.stringify(value),url,'Reviewed public source excerpt',new Date(NOW).toISOString());}
test('reviewed facts survive imports while explicit admin edits remain authoritative',async()=>{
  const {DB:db}=fixtureEnv(),seed=fixtureCatalog();await importCatalog(db,seed);fact(db,'category','adventure');fact(db,'title','Pattern Garden');
  let game=(await catalog(db)).games[0];assert.equal(game.title,'Pattern Garden');assert.equal(game.category,'adventure');
  await enqueueJobs(db,{kind:'references',scope:'game',gameId:game.id},{subject:'operator'},deps);
  assert.equal((await listJobs(db,'all')).jobs[0].title,'Pattern Garden');
  await importCatalog(db,seed);assert.equal((await catalog(db)).games[0].title,'Pattern Garden');
  await editDetails(db,game.id,{mode:'edit',revision:0,details:{...detailsOf(game),title:'Owner title',category:'puzzle'}},{subject:'owner'},deps);
  game=(await catalog(db)).games[0];assert.equal(game.title,'Owner title');assert.equal(game.category,'puzzle');
  assert.equal((await listJobs(db,'all')).jobs[0].title,'Owner title');
  const page=await fixtureWorker().fetch(request('/insights'),{DB:db,ALLOWED_ORIGINS:'https://playtrace.example'});const data=await page.json();assert.equal(data.games[0].fieldEvidence.length,0);db.close();
});
test('explicitly clearing a wrong destination hides its store data and stops its maintenance jobs',async()=>{
  const {DB:db}=fixtureEnv(),seed=fixtureCatalog();await importCatalog(db,seed);fact(db,'projectUrl',null);
  const game=(await applyDetails(db,seed.games))[0];assert.equal(game.projectUrl,null);
  assert.equal((await enqueueJobs(db,{kind:'store',scope:'all',gameId:null},{subject:'operator'},deps)).queued,0);
  assert.equal((await enqueueJobs(db,{kind:'links',scope:'all',gameId:null},{subject:'operator'},deps)).queued,0);db.close();
});
test('public insights expose only public observations and admin metrics remain gated',async()=>{
  const env=fixtureEnv(undefined,{CLERK_SECRET_KEY:'sk_test_'+'a'.repeat(40)}),worker=fixtureWorker();await importCatalog(env.DB,fixtureCatalog());fact(env.DB,'category','adventure');
  env.DB.sql.prepare('INSERT INTO follows VALUES(?,?,?)').run('private_visitor','g_abc12',new Date(NOW).toISOString());
  env.DB.sql.prepare("INSERT INTO app_meta VALUES('history',?)").run(JSON.stringify({privateOperation:'internal checkpoint'}));
  const response=await worker.fetch(request('/insights'),env);assert.equal(response.status,200);assert.match(response.headers.get('Cache-Control'),/public/);
  const data=await response.json();assert.equal(data.games[0].fieldEvidence[0].field,'category');assert.equal(data.history,undefined);assert.ok(!JSON.stringify(data).includes('private_visitor'));assert.equal(data.games[0].body,undefined);
  assert.equal((await worker.fetch(request('/admin/usage'),env)).status,401);assert.equal((await worker.fetch(request('/admin/insights'),env)).status,401);
  const first=publicCacheKey(request('/insights?cursor=one'),'insights'),second=publicCacheKey(request('/insights?cursor=two'),'insights');assert.notEqual(first.url,second.url);
  assert.equal(publicCacheKey(request('/insights',{auth:'private'}),'insights'),null);env.DB.close();
});
test('source withdrawal removes facts derived from its text, and whole-project removal clears all accepted facts',async()=>{
  const env=fixtureEnv(),seed=fixtureCatalog();await importCatalog(env.DB,seed);fact(env.DB,'category','adventure');
  await refreshSourceRecords(env.DB,[rawPost('abc12',{author:seed.games[0].author.name,selftext:'[removed]',removed_by_category:'moderator'})],deps);
  assert.equal(env.DB.sql.prepare('SELECT count(*) AS n FROM project_facts').get().n,0);
  fact(env.DB,'title','A store title','https://maker.itch.io/puzzle');await removal(env.DB,null,'g_abc12','Removal requested',new Date(NOW).toISOString());
  assert.equal(env.DB.sql.prepare('SELECT count(*) AS n FROM project_facts').get().n,0);env.DB.close();
});
test('withdrawing a post also clears its creator-reply facts without touching other evidence or admin edits',async()=>{
  const env=fixtureEnv(),seed=fixtureCatalog();await importCatalog(env.DB,seed);
  fact(env.DB,'category','adventure');
  fact(env.DB,'title','Creator title','https://www.reddit.com/r/aigamedev/comments/abc12/_/reply12/');
  fact(env.DB,'stage','playable','https://www.reddit.com/r/aigamedev/comments/abc123/_/reply34/');
  fact(env.DB,'platforms',['Browser'],'https://www.reddit.com/r/aigamedev/comments/abc12/x/reply56/');
  fact(env.DB,'projectUrl','https://maker.itch.io/puzzle','https://maker.itch.io/puzzle');
  await editDetails(env.DB,'g_abc12',{mode:'edit',revision:0,details:{...detailsOf(seed.games[0]),title:'Owner title'}},{subject:'owner'},deps);
  const edits=env.DB.sql.prepare('SELECT * FROM project_overrides').all();
  await refreshSourceRecords(env.DB,[rawPost('abc12',{author:seed.games[0].author.name,selftext:'[removed]',removed_by_category:'moderator'})],deps);
  assert.deepEqual(env.DB.sql.prepare('SELECT field FROM project_facts ORDER BY field').all().map(r=>r.field),['platforms','projectUrl','stage']);
  assert.deepEqual(env.DB.sql.prepare('SELECT * FROM project_overrides').all(),edits);
  assert.equal((await catalog(env.DB)).games[0].title,'Owner title');env.DB.close();
});
test('future source matching respects a reviewed link removal and does not attach another game to it',async()=>{
  const env=fixtureEnv(),seed=fixtureCatalog();await importCatalog(env.DB,seed);fact(env.DB,'projectUrl',null);
  const raw=rawPost('later1',{author:seed.games[0].author.name,url:seed.games[0].projectUrl});
  await ingest(env,{...deps,sleep:async()=>{},fetch:async()=>Response.json({data:[raw]})});
  const games=(await catalog(env.DB)).games;assert.equal(games.length,2);assert.equal(games.find(g=>g.id==='g_abc12').posts.length,1);env.DB.close();
});
test('comparison links to another game do not become the featured project destination',()=>{
  assert.equal(projectLinks({selftext:'I am making Rogue Shifters, similar to my most recently released game [Cook or Be Cooked](https://store.steampowered.com/app/3360990/).'}).projectUrl,null);
  assert.equal(projectLinks({selftext:'STARBATTLE is new. While working on other projects, including my free Souls-like (https://wbk.itch.io/chapel-knights).'}).projectUrl,null);
  assert.equal(projectLinks({selftext:'I have other projects. Play this game here: https://maker.itch.io/starbattle'}).projectUrl,'https://maker.itch.io/starbattle');
  assert.equal(projectLinks({selftext:'12 years ago I released my first game, still here: https://maker.itch.io/old\n\nMy new game is here: https://maker.itch.io/new'}).projectUrl,'https://maker.itch.io/new');
  assert.equal(projectLinks({selftext:'PS1 art inspired by another game.\nhttps://easy-roads.pages.dev/\nRuns in the browser (free to play).'}).projectUrl,'https://easy-roads.pages.dev/');
});

test('a first-game promotion does not identify a later prototype, even after a long paragraph',()=>{
  const oldUrl='https://store.steampowered.com/app/5073210/BoneHeads/';
  const showcase='This is my second game. A first-person swordfighting and parkour prototype.\n\n';
  const promotion="If you want to check out my first upcoming game, wishlisting would mean a lot. It's basically the same combat system but in 2D. All the work for the sword physics translated really well into 3D, and it would have taken months to build it from scratch.\n"+oldUrl;
  assert.equal(projectLinks({url:oldUrl,selftext:showcase+promotion}).projectUrl,null);
  assert.equal(projectLinks({selftext:showcase+promotion+'\n\nPlay this game here: https://maker.itch.io/parkour'}).projectUrl,'https://maker.itch.io/parkour');
  assert.equal(projectLinks({selftext:showcase+'My first game inspired this one. Play this game here: https://maker.itch.io/parkour'}).projectUrl,'https://maker.itch.io/parkour');
  assert.equal(projectLinks({selftext:"This is my first game. If you want to check out my first upcoming game: "+oldUrl}).projectUrl,oldUrl.replace(/\/$/,''));
});
