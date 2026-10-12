import test from 'node:test';
import assert from 'node:assert/strict';
import { pageMetadata, checkProject } from '../src/enrichment.mjs';
import { catalog, importCatalog } from '../src/store.mjs';
import { detailsOf, editDetails } from '../src/details.mjs';
import { fixtureEnv, fixtureCatalog, fixtureGame } from './helpers.mjs';
import { validateCatalog } from '../../js/collection.js';
import { evidence } from '../../js/admin-campaign.js';

const destination = 'https://maker.itch.io/underbloom';
const row = (name, values) => `<tr><td>${name}</td><td>${values.map(value => `<a href="https://itch.io/games">${value}</a>`).join(', ')}</td></tr>`;
const html = `<title>Underbloom by Maker</title>
<script type="application/ld+json">{"@type":"Product","name":"Underbloom","description":"Explore a &lt;b&gt;living&lt;/b&gt; cave &amp; grow."}</script>
<meta property="og:image" content="https://img.itch.zone/cover.png">
<div class="html_embed_widget base_widget"></div>
<div class="game_info_panel_widget base_widget"><table><tbody>
${row('Platforms', ['HTML5','Windows','macOS','Linux'])}${row('Status',['In development'])}
${row('Genre',['Action','Role Playing'])}${row('Made with',['Unity'])}${row('Inputs',['Keyboard','Mouse'])}
${row('Languages',['English'])}${row('AI Disclosure',['AI Assisted','Code'])}${row('Tags',['Exploration'])}
</tbody></table></div>
<a data-image_lightbox="true" href="https://img.itch.zone/screenshot.jpg"><img class="screenshot"></a>
<a data-image_lightbox="true" href="https://img.itch.zone/screenshot.jpg"></a>
<a data-image_lightbox="true" href="https://evil.example/tracker.jpg"></a>`;
const fetchPage = (markup = html) => async url => url.includes('dns-query')
  ? Response.json({ Answer: [{ type: 1, data: '8.8.8.8' }] })
  : new Response(markup, { headers: { 'Content-Type': 'text/html' } });
async function setup() {
  const env = fixtureEnv(), game = fixtureGame(); game.projectUrl = destination;
  game.reviewStatus = 'source-described'; game.title = game.posts[0].title = 'My first AI game is ready to explore';
  game.summary = `Source post by u/${game.author.name}: ${game.title}`;
  await importCatalog(env.DB, fixtureCatalog([game]));
  return { env, game };
}

test('itch facts use structured naming and the listing table, with field provenance', () => {
  const value = pageMetadata(html, destination);
  assert.equal(value.title, 'Underbloom'); assert.equal(value.description, 'Explore a living cave & grow.');
  assert.deepEqual(value.platforms, ['Browser','Windows','macOS','Linux']);
  assert.deepEqual(value.genres, ['Action','Role Playing']); assert.deepEqual(value.engines, ['Unity']);
  assert.deepEqual(value.aiDisclosure, ['AI Assisted','Code']); assert.equal(value.releaseStatus, 'In development');
  assert.equal(value.playable, true); assert.equal(value.browser, true); assert.equal(value.downloadable, false);
  assert.deepEqual(value.screenshots, ['https://img.itch.zone/screenshot.jpg']);
  assert.equal(value.provenance.title, 'JSON-LD name'); assert.equal(value.provenance.engines, 'More information: made with');
});
test('purchase offers, published labels and HTML5 platform tags alone do not prove access', () => {
  for (const markup of ['<a class="buy_btn">Preorder</a>', row('Platforms',['HTML5']), row('Status',['Released']), '<div id="game_drop"></div>']) {
    const value = pageMetadata('<title>Upcoming game</title>'+markup, destination);
    assert.equal(value.playable, false); assert.equal(value.browser, false);
  }
  assert.equal(pageMetadata('<title>Game</title><a class="download_btn">Download</a>', destination).downloadable, true);
});
test('comments, scripts and lookalike domains cannot manufacture store build evidence', () => {
  const fake = '<!-- <div class="html_embed_widget"> --><script>"<a class=\'download_btn\'>"</script><div class="not_html_embed_widget">';
  assert.equal(pageMetadata(fake, destination).playable, false);
  const other = pageMetadata(html, 'https://maker.itch.io.evil.example/underbloom');
  assert.equal(other.provider, 'website'); assert.equal(other.playable, false); assert.deepEqual(other.platforms, []);
});
test('malformed JSON-LD falls back to the actual game heading and bounds optional labels', () => {
  const markup = '<script type="application/ld+json">{bad}</script><h1 class="game_title">Small &amp; Mighty</h1><title>Small &amp; Mighty by Maker</title>';
  assert.equal(pageMetadata(markup, destination).title, 'Small & Mighty');
  const value = pageMetadata(html.replace(row('Tags',['Exploration']), row('Tags', Array.from({length:30},(_,i)=>'Tag '+i))), destination);
  assert.equal(value.tags.length, 12);
});
test('store facts fill automatic gaps and validate, without rewriting taxonomy or source headlines', async () => {
  const {env,game} = await setup(), now = Date.now();
  await checkProject(env.DB, env, game.id, {now:()=>now,fetch:fetchPage()}, true);
  const value = validateCatalog(await catalog(env.DB)).games[0];
  assert.equal(value.title, 'Underbloom'); assert.equal(value.stage, 'playable');
  assert.equal(value.summary, 'Explore a living cave & grow.'); assert.deepEqual(value.platforms,['Browser','Windows','macOS','Linux']);
  assert.equal(value.category, game.category); assert.deepEqual(value.tags, game.tags);
  assert.equal(value.posts[0].title, game.posts[0].title); env.DB.close();
});
test('a store description can replace an automatic source excerpt while the full source stays in history',async()=>{
  const {env,game}=await setup();game.summary=game.posts[0].excerpt;
  await importCatalog(env.DB,fixtureCatalog([game]));
  await checkProject(env.DB,env,game.id,{now:()=>Date.now(),fetch:fetchPage()},true);
  const value=(await catalog(env.DB)).games[0];assert.equal(value.summary,'Explore a living cave & grow.');
  assert.equal(value.posts[0].excerpt,game.summary);env.DB.close();
});
test('curated details and approved R2 artwork remain authoritative after itch enrichment', async () => {
  const {env,game} = await setup(), now = Date.now();
  const details = {...detailsOf(game),title:'An edited title',summary:'A careful editorial summary.',platforms:[],stage:'prototype'};
  await editDetails(env.DB,game.id,{mode:'edit',revision:0,details},{subject:'admin'},{now:()=>now});
  const preview = {...game.preview,storage:'r2',rights:'owner-consent',url:'https://api.example/api/v1/media/11111111-1111-4111-8111-111111111111'};
  env.DB.sql.prepare("UPDATE games SET payload_json=json_set(payload_json,'$.preview',json(?)) WHERE id=?").run(JSON.stringify(preview), game.id);
  await checkProject(env.DB,env,game.id,{now:()=>now,fetch:fetchPage()},true);
  const value = (await catalog(env.DB)).games[0];
  for (const key of ['title','summary','platforms','stage']) assert.deepEqual(value[key], details[key]);
  assert.deepEqual(value.preview,preview); env.DB.close();
});
test('blocked, non-HTML and challenge responses preserve the date and facts of the last successful listing', async () => {
  const {env,game} = await setup(), now = Date.now();
  await checkProject(env.DB,env,game.id,{now:()=>now,fetch:fetchPage()},true);
  for (const response of [()=>new Response('',{status:403}),()=>new Response('binary',{headers:{'Content-Type':'image/png'}}),()=>new Response('<title>Just a moment...</title>',{headers:{'Content-Type':'text/html'}})]) {
    const value=await checkProject(env.DB,env,game.id,{now:()=>now+60000,fetch:async url=>url.includes('dns-query')?Response.json({Answer:[{type:1,data:'8.8.8.8'}]}):response()},true);
    assert.equal(value.storeCheckedAt,new Date(now).toISOString()); assert.equal(value.title,'Underbloom');
    assert.equal(value.checkedAt,new Date(now+60000).toISOString()); assert.deepEqual(value.engines,['Unity']);
  }
  env.DB.close();
});
test('optional authorized API failures do not discard successful public metadata', async () => {
  const {env,game} = await setup();env.ITCHIO_API_TOKEN='fixture-private-token';
  const value=await checkProject(env.DB,env,game.id,{now:()=>Date.now(),fetch:async(url,options)=>{
    if(url==='https://api.itch.io/profile/games'){assert.equal(options.headers.Authorization,'Bearer fixture-private-token');throw new Error('Unavailable');}
    assert.equal(options.headers.Authorization,undefined);return fetchPage()(url);
  }},true);
  assert.equal(value.status,'reachable');assert.equal(value.title,'Underbloom');assert.equal(value.browser,true);env.DB.close();
});
test('authorized listings expose only public title/art and never turn publication into playability', async () => {
  const {env,game} = await setup();env.ITCHIO_API_TOKEN='fixture-private-token';
  const value=await checkProject(env.DB,env,game.id,{now:()=>Date.now(),fetch:async url=>{
    if(url==='https://api.itch.io/profile/games')return Response.json({games:[{published:true,classification:'game',url:destination,title:'Underbloom',type:'html',earnings:[{amount:999}],purchases_count:4,cover_url:'https://img.itch.zone/owned.jpg'}]});
    return fetchPage('<title>Underbloom</title>')(url);
  }},true);
  assert.equal(value.playable,false);assert.equal(value.browser,false);assert.equal(value.image,'https://img.itch.zone/owned.jpg');
  const cache=env.DB.sql.prepare("SELECT value_json FROM app_meta WHERE key='itch_owned_public'").get().value_json;
  assert.equal(/earnings|purchases|fixture-private-token/.test(cache+JSON.stringify(value)),false);env.DB.close();
});
test('frontend rejects a substituted screenshot destination or mismatched evidence', async () => {
  const {env,game}=await setup();await checkProject(env.DB,env,game.id,{now:()=>Date.now(),fetch:fetchPage()},true);
  const value=await catalog(env.DB);value.games[0].availability.screenshots=['javascript:alert(1)'];assert.throws(()=>validateCatalog(value));
  value.games[0].availability.screenshots=[];value.games[0].availability.projectUrl='https://other.itch.io/game';assert.throws(()=>validateCatalog(value));env.DB.close();
});
test('admin queue handles string store evidence and array comment evidence without a rendering failure', () => {
  assert.match(evidence({status:'reachable',evidence:'An embedded build was found.'}),/An embedded build was found/);
  assert.match(evidence({evidence:[{questionnaireId:'study',body:'Useful controls.'}]}),/Useful controls/);
  const value={...pageMetadata(html,destination),checkedAt:new Date().toISOString()};
  const rendered=evidence(value);assert.match(rendered,/store observations/);assert.match(rendered,/More information: made with/);
  assert.equal(rendered.includes('<script>'),false);
});
