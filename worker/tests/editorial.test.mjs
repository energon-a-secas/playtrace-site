import test from 'node:test';
import assert from 'node:assert/strict';
import { fixtureEnv, fixtureWorker, fixtureCatalog, fixtureGame, request, token, NOW } from './helpers.mjs';
import { importCatalog, catalog, removal, query } from '../src/store.mjs';
import { normalizeSteam, refreshSteam, steamAppId } from '../src/steam.mjs';
import { extractAssets, hydrateMedia } from '../src/assets.mjs';
import { acquire, release } from '../src/lease.mjs';
const OWNER = 'luciano.adonis.villarroel@gmail.com';
const CLERK_KEY = `sk_test_${'a'.repeat(40)}`;
const profile = (id='user_a',email=OWNER,verified=true) => ({ id, primary_email_address_id:'email_1', email_addresses:[{id:'email_1',email_address:email,verification:{status:verified?'verified':'unverified'}}], banned:false,locked:false });
const adminEnv = () => fixtureEnv(undefined,{ CLERK_SECRET_KEY:CLERK_KEY, PREVIEW_ALLOWED_HOSTS:'preview.redd.it,i.redd.it,shared.akamai.steamstatic.com' });
const adminWorker = (getProfile=()=>profile()) => fixtureWorker(async (url,options) => {
  assert.match(url,/^https:\/\/api\.clerk\.com\/v1\/users\/user_[a-z]+$/);
  assert.equal(options.redirect,'manual'); assert.equal(options.headers.Authorization,`Bearer ${CLERK_KEY}`);
  return Response.json(getProfile(url));
});
function guest(path,body,key='ab'.repeat(32),ip='192.0.2.1') {
  const req=request(path,{method:'POST',body,ip});req.headers.set('X-Feedback-Key',key);return req;
}
const change={kind:'image',body:'The opening frame is black. Please use a later frame.',suggestedUrl:'https://preview.redd.it/new.jpg'};
const png = Uint8Array.from([137,80,78,71,13,10,26,10,0,0,0,0]);
function bucket(){const objects=new Map();return{objects,async put(k,b){objects.set(k,b);},async get(k){return objects.has(k)?{body:objects.get(k)}:null;},async delete(k){objects.delete(k);}};}
const steamPayload = (overrides={}) => ({'620':{success:true,data:{steam_appid:620,type:'game',name:'A real Steam game',is_free:false,release_date:{coming_soon:false},price_overview:{currency:'USD',final:999,initial:1999},header_image:'https://shared.akamai.steamstatic.com/store_item_assets/steam/apps/620/header.jpg',...overrides}}});

test('admin role requires a signed session and verified primary email from the pinned backend',async()=>{
  const env=adminEnv(), worker=adminWorker(), jwt=await token();
  assert.equal((await worker.fetch(request('/admin/me'),env)).status,401);
  const response=await worker.fetch(request('/admin/me',{auth:jwt}),env);
  assert.equal(response.status,200);assert.deepEqual(await response.json(),{email:OWNER,role:'owner',integrations:{jev:false,itch:false}});
  assert.equal(env.DB.sql.prepare('SELECT subject FROM admins WHERE email=?').get(OWNER).subject,'user_a');
  assert.equal((await worker.fetch(request('/admin/me',{auth:await token({sub:'user_b'})}),env)).status,403);
  assert.equal((await worker.fetch(request('/admin/me',{auth:jwt}),{...env,CLERK_SECRET_KEY:undefined})).status,503);
  env.DB.close();
});
test('unverified emails, secondary owner email, mismatched subjects, banned users and JWT email spoofing confer no admin',async()=>{
  for(const data of [profile('user_a',OWNER,false),profile('user_a','visitor@example.com'),{...profile(),id:'user_b'},
    {...profile(),banned:true},{...profile(),locked:true},{...profile('user_a','visitor@example.com'),email_addresses:[...profile('user_a','visitor@example.com').email_addresses,{id:'email_2',email_address:OWNER,verification:{status:'verified'}}]}]){
    const env=adminEnv(), worker=adminWorker(()=>data);
    assert.equal((await worker.fetch(request('/admin/me',{auth:await token({email:OWNER,role:'owner'})}),env)).status,403);
    assert.equal(env.DB.sql.prepare('SELECT subject FROM admins').get().subject,null);env.DB.close();
  }
});
test('Clerk redirects never receive a forwarded server key; email access stays bound to its first subject',async()=>{
  const env=adminEnv();let calls=0;
  const redirected=fixtureWorker(async()=>{calls++;return new Response(null,{status:302,headers:{Location:'https://evil.example/'}});});
  assert.equal((await redirected.fetch(request('/admin/me',{auth:await token()}),env)).status,503);assert.equal(calls,1);
  const worker=adminWorker(url=>profile(url.split('/').at(-1)));
  assert.equal((await worker.fetch(request('/admin/me',{auth:await token()}),env)).status,200);
  assert.equal((await worker.fetch(request('/admin/me',{auth:await token({sub:'user_b'})}),env)).status,403);env.DB.close();
});
test('owner can add and revoke admins; other admins cannot grant access or remove the owner',async()=>{
  const env=adminEnv(), worker=adminWorker(url=>profile(url.endsWith('user_b')?'user_b':'user_a',url.endsWith('user_b')?'editor@example.com':OWNER));
  const owner=await token(), editor=await token({sub:'user_b'});
  let r=await worker.fetch(request('/admin/members',{method:'PUT',auth:owner,body:{email:'Editor@example.com',enabled:true}}),env);assert.equal(r.status,200);
  r=await worker.fetch(request('/admin/me',{auth:editor}),env);assert.equal(r.status,200);assert.equal((await r.json()).role,'admin');
  assert.equal((await worker.fetch(request('/admin/members',{method:'PUT',auth:editor,body:{email:'evil@example.com',enabled:true}}),env)).status,403);
  assert.equal((await worker.fetch(request('/admin/members',{method:'PUT',auth:owner,body:{email:OWNER,enabled:false}}),env)).status,400);
  assert.equal((await worker.fetch(request('/admin/members',{method:'PUT',auth:owner,body:{email:'editor@example.com',enabled:false}}),env)).status,200);
  assert.equal((await worker.fetch(request('/admin/me',{auth:editor}),env)).status,403);env.DB.close();
});
test('anonymous change requests land in a private paginated inbox and are rate limited',async()=>{
  const env=adminEnv(),worker=adminWorker();await importCatalog(env.DB,fixtureCatalog());
  const result=await worker.fetch(guest('/games/g_abc12/change-requests',change),env);assert.equal(result.status,201);
  const {id}=await result.json();const raw=env.DB.sql.prepare('SELECT * FROM change_requests').get();
  assert.equal(raw.body,change.body);assert.ok(!raw.reporter_hash.includes('192.0.2.1'));
  assert.equal((await worker.fetch(request('/admin/requests'),env)).status,401);
  assert.ok(!JSON.stringify(await catalog(env.DB)).includes(change.body));
  let page=await (await worker.fetch(request('/admin/requests',{auth:await token()}),env)).json();assert.equal(page.entries[0].id,id);assert.equal(page.nextCursor,null);
  assert.ok(!JSON.stringify(page).includes('reporter_hash'));
  assert.equal((await worker.fetch(request(`/admin/requests/${id}`,{method:'PUT',auth:await token(),body:{status:'resolved',note:'Image replaced'}}),env)).status,200);
  page=await (await worker.fetch(request('/admin/requests',{auth:await token()}),env)).json();assert.equal(page.entries.length,0);
  for(let i=1;i<5;i++)assert.equal((await worker.fetch(guest('/games/g_abc12/change-requests',change),env)).status,201);
  assert.equal((await worker.fetch(guest('/games/g_abc12/change-requests',change),env)).status,429);
  assert.equal((await worker.fetch(guest('/games/g_abc12/change-requests',{...change,suggestedUrl:'javascript:alert(1)'},'cd'.repeat(32)),env)).status,400);
  env.DB.close();
});
test('removal racing a new change request leaves no private request behind',async()=>{
  const env=adminEnv(),worker=adminWorker();await importCatalog(env.DB,fixtureCatalog());
  const original=env.DB.prepare.bind(env.DB);let triggered=false;
  env.DB.prepare=sql=>{
    if(sql.includes('INSERT INTO change_requests')&&!triggered){triggered=true;env.DB.sql.exec("INSERT INTO removals VALUES('g_abc12','[\"abc12\"]','Requested','2026-10-10T12:00:00.000Z','operator'); UPDATE games SET status='removed' WHERE id='g_abc12'");}
    return original(sql);
  };
  assert.equal((await worker.fetch(guest('/games/g_abc12/change-requests',change),env)).status,404);
  assert.equal(env.DB.sql.prepare('SELECT count(*) AS n FROM change_requests').get().n,0);env.DB.close();
});
test('custom image survives reingestion, is attributed, can be reset, and rejects unknown hosts',async()=>{
  const env=adminEnv(),worker=adminWorker();await importCatalog(env.DB,fixtureCatalog());const auth=await token();
  const body={mode:'external',url:'https://preview.redd.it/clear.jpg',alt:'A bright gameplay scene',sourcePostId:'abc12'};
  let r=await worker.fetch(request('/admin/games/g_abc12/image',{method:'PUT',auth,body}),env);assert.equal(r.status,200);
  await importCatalog(env.DB,fixtureCatalog());assert.equal((await catalog(env.DB)).games[0].preview.url,body.url);
  assert.equal(env.DB.sql.prepare('SELECT approved_by FROM preview_overrides').get().approved_by,'user_a');
  assert.equal((await worker.fetch(request('/admin/games/g_abc12/image',{method:'PUT',auth,body:{...body,url:'https://evil.example/x.png'}}),env)).status,400);
  assert.equal((await worker.fetch(request('/admin/games/g_abc12/image',{method:'PUT',auth,body:{...body,sourcePostId:'wrong'}}),env)).status,400);
  assert.equal((await worker.fetch(request('/admin/games/g_abc12/image',{method:'PUT',auth,body:{mode:'reset'}}),env)).status,200);
  assert.equal((await catalog(env.DB)).games[0].preview.url,fixtureGame().preview.url);env.DB.close();
});
test('admin uploads require permission, reject disguised SVG, serve only the active override and disappear on removal',async()=>{
  const env=adminEnv();env.PREVIEWS=bucket();const worker=adminWorker(),auth=await token();await importCatalog(env.DB,fixtureCatalog());
  const body={mode:'upload',dataUrl:`data:image/png;base64,${Buffer.from(png).toString('base64')}`,alt:'Gameplay frame',sourcePostId:'abc12',permission:true};
  assert.equal((await worker.fetch(request('/admin/games/g_abc12/image',{method:'PUT',auth,body:{...body,permission:false}}),env)).status,400);
  assert.equal((await worker.fetch(request('/admin/games/g_abc12/image',{method:'PUT',auth,body:{...body,dataUrl:`data:image/png;base64,${Buffer.from('<svg/>').toString('base64')}`}}),env)).status,400);
  let r=await worker.fetch(request('/admin/games/g_abc12/image',{method:'PUT',auth,body}),env);assert.equal(r.status,200);const result=await r.json();const path=new URL(result.game.preview.url).pathname.replace('/api/v1','');
  assert.equal((await worker.fetch(request(path),env)).status,200);
  assert.equal((await worker.fetch(request('/admin/games/g_abc12/image',{method:'PUT',auth,body:{mode:'reset'}}),env)).status,200);
  assert.equal((await worker.fetch(request(path),env)).status,404);
  await removal(env.DB,env.PREVIEWS,'g_abc12','Creator request',new Date(NOW).toISOString());assert.equal(env.PREVIEWS.objects.size,0);env.DB.close();
});
test('Steam metadata requires exact app identity, a game type, released state and USD pricing',()=>{
  assert.equal(steamAppId('https://store.steampowered.com/app/620/Portal_2/?utm_source=example'),'620');
  for(const url of ['https://store.steampowered.com.evil/app/620/','https://user@store.steampowered.com/app/620/','http://store.steampowered.com/app/620/','https://store.steampowered.com:9000/app/620/','https://store.steampowered.com/app/620wrong'])assert.equal(steamAppId(url),null);
  const good=normalizeSteam(steamPayload(),'620',NOW);assert.equal(good.priceCents,999);assert.equal(good.currency,'USD');assert.equal(good.state,'released');
  assert.equal(normalizeSteam(steamPayload({steam_appid:621}),'620',NOW),null);
  assert.equal(normalizeSteam(steamPayload({type:'dlc'}),'620',NOW),null);
  assert.equal(normalizeSteam(steamPayload({price_overview:{currency:'CLP',final:999}}),'620',NOW).priceCents,null);
  assert.equal(normalizeSteam(steamPayload({release_date:{coming_soon:true}}),'620',NOW).priceCents,null);
  assert.equal(normalizeSteam(steamPayload({is_free:true}),'620',NOW).priceCents,0);
  assert.equal(normalizeSteam(steamPayload({header_image:'https://evil.example/img.jpg'}),'620',NOW).headerUrl,null);
});
test('Steam cache bounds retries and stale prices retain their original successful check date',async()=>{
  const env=fixtureEnv();let calls=0,now=NOW,fail=false;
  const deps={now:()=>now,fetch:async(url,opts)=>{calls++;assert.match(url,/cc=us/);assert.equal(opts.redirect,'manual');return fail?new Response(null,{status:429}):Response.json(steamPayload());}};
  const a=await refreshSteam(env.DB,'620',deps);await refreshSteam(env.DB,'620',deps);assert.equal(calls,1);
  now+=86400001;fail=true;const b=await refreshSteam(env.DB,'620',deps);assert.equal(b.checkedAt,a.checkedAt);await refreshSteam(env.DB,'620',deps);assert.equal(calls,2);env.DB.close();
});
test('confirmed Steam art is automatic, while an admin image remains the preferred preview',async()=>{
  const env=adminEnv(),game=fixtureGame();game.projectUrl='https://store.steampowered.com/app/620/';await importCatalog(env.DB,fixtureCatalog([game]));
  await refreshSteam(env.DB,'620',{now:()=>NOW,fetch:async()=>Response.json(steamPayload())});
  assert.equal((await catalog(env.DB)).games[0].steam.priceCents,999);assert.match((await catalog(env.DB)).games[0].preview.url,/steamstatic/);
  const worker=adminWorker();assert.equal((await worker.fetch(request('/admin/games/g_abc12/image',{method:'PUT',auth:await token(),body:{mode:'external',url:'https://preview.redd.it/custom.jpg',alt:'Curated gameplay',sourcePostId:'abc12'}}),env)).status,200);
  assert.equal((await catalog(env.DB)).games[0].preview.url,'https://preview.redd.it/custom.jpg');env.DB.close();
});
test('source clips and GIFs use allowed HTTPS hosts, decode entities, and reject spoofed media',()=>{
  const raw={media:{reddit_video:{fallback_url:'https://v.redd.it/clip/DASH_720.mp4?source=fallback&amp;a=1'}},url:'https://i.redd.it/clip.gif'};
  const media=extractAssets(raw);assert.equal(media[0].kind,'video');assert.match(media[0].url,/&a=1/);assert.equal(media[1].kind,'gif');
  assert.deepEqual(extractAssets({media:{reddit_video:{fallback_url:'https://v.redd.it.evil/clip.mp4'}}}),[]);
});
test('existing-post media hydration is bounded, retains provenance and survives reimport without assets',async()=>{
  const env=fixtureEnv();await importCatalog(env.DB,fixtureCatalog());let calls=0;
  const result=await hydrateMedia(env,{now:()=>NOW,fetch:async url=>{calls++;assert.equal(url,'https://arctic-shift.photon-reddit.com/api/posts/ids?ids=abc12');return Response.json({data:[{id:'abc12',author:'MakerName',subreddit:'aigamedev',media:{reddit_video:{fallback_url:'https://v.redd.it/abc/DASH_720.mp4'}}}]});}});
  assert.equal(result.assets,1);assert.equal((await catalog(env.DB)).games[0].posts[0].assets[0].kind,'video');
  await importCatalog(env.DB,fixtureCatalog());assert.equal((await catalog(env.DB)).games[0].posts[0].assets[0].kind,'video');
  const next=await hydrateMedia(env,{now:()=>NOW,fetch:async()=>{throw new Error('Should not fetch twice');}});assert.equal(next.checked,0);assert.equal(calls,1);env.DB.close();
});

test('private request pagination handles tied timestamps without exposing removed games',async()=>{
  const env=adminEnv(),worker=adminWorker();await importCatalog(env.DB,fixtureCatalog());
  const at=new Date(NOW).toISOString();
  for(let i=0;i<54;i++)await query(env.DB,'INSERT INTO change_requests(id,game_id,kind,body,reporter_hash,created_at) VALUES(?,?,?,?,?,?)',crypto.randomUUID(),'g_abc12','image',`Clearer preview request ${i}`,'fixture-hash',at).run();
  const auth=await token(),first=await(await worker.fetch(request('/admin/requests',{auth}),env)).json();assert.equal(first.entries.length,50);
  const second=await(await worker.fetch(request(`/admin/requests?cursor=${first.nextCursor}`,{auth}),env)).json();assert.equal(second.entries.length,4);assert.equal(new Set([...first.entries,...second.entries].map(x=>x.id)).size,54);
  await query(env.DB,"UPDATE games SET status='removed' WHERE id='g_abc12'").run();assert.equal((await(await worker.fetch(request('/admin/requests',{auth}),env)).json()).entries.length,0);env.DB.close();
});
test('upload cannot retain an override when removal wins during R2 storage',async()=>{
  const env=adminEnv();env.PREVIEWS=bucket();await importCatalog(env.DB,fixtureCatalog());const worker=adminWorker();
  const put=env.PREVIEWS.put;env.PREVIEWS.put=async(key,bytes)=>{await put(key,bytes);await query(env.DB,"UPDATE games SET status='removed' WHERE id='g_abc12'").run();};
  const body={mode:'upload',dataUrl:`data:image/png;base64,${Buffer.from(png).toString('base64')}`,alt:'Captured frame',sourcePostId:'abc12',permission:true};
  assert.equal((await worker.fetch(request('/admin/games/g_abc12/image',{method:'PUT',auth:await token(),body}),env)).status,404);
  assert.equal(env.PREVIEWS.objects.size,0);assert.equal(env.DB.sql.prepare('SELECT count(*) AS n FROM preview_overrides').get().n,0);assert.equal(env.DB.sql.prepare('SELECT count(*) AS n FROM media_assets').get().n,0);env.DB.close();
});
test('media hydration stops on throttling and never marks unreceived media as checked',async()=>{
  const env=fixtureEnv();await importCatalog(env.DB,fixtureCatalog());let calls=0;
  await assert.rejects(hydrateMedia(env,{now:()=>NOW,fetch:async()=>{calls++;return new Response(null,{status:429,headers:{'Retry-After':'60'}});}}));
  assert.equal(calls,1);assert.equal(env.DB.sql.prepare('SELECT media_checked_at FROM source_posts').get().media_checked_at,null);
  assert.equal(env.DB.sql.prepare("SELECT count(*) AS n FROM app_meta WHERE key='ingestion_lock'").get().n,0);env.DB.close();
});

function maintenanceFixture() {
  return fixtureCatalog(Array.from({length:16},(_,i)=>({...fixtureGame(`sched${String(i).padStart(2,'0')}`),
    ...(i<6?{projectUrl:`https://store.steampowered.com/app/${620+i}/`}:{})})));
}
function maintenanceUpstream(calls) {
  return async url=>{
    calls.push(url);const u=new URL(url);
    if(u.hostname==='store.steampowered.com'){
      const id=u.searchParams.get('appids');const data=steamPayload()['620'].data;
      return Response.json({[id]:{success:true,data:{...data,steam_appid:Number(id)}}});
    }
    if(u.pathname==='/api/posts/ids')return Response.json({data:u.searchParams.get('ids').split(',').map(id=>({id,author:'MakerName',subreddit:'aigamedev',media:{reddit_video:{fallback_url:`https://v.redd.it/${id}/DASH_720.mp4`}}}))});
    return Response.json({data:[]});
  };
}
test('full scheduled handlers stay below 50 D1 statements with cold Steam caches and ten unchecked media posts',async()=>{
  const env=fixtureEnv(),calls=[],worker=fixtureWorker(maintenanceUpstream(calls));await importCatalog(env.DB,maintenanceFixture());
  env.DB.statementCount=0;
  await worker.scheduled({cron:'35 * * * *'},env);
  assert.ok(env.DB.statementCount<50,`Archive handler used ${env.DB.statementCount} D1 statements`);
  assert.equal(calls.length,2);assert.ok(calls.every(url=>new URL(url).pathname==='/api/posts/search'));
  env.DB.statementCount=0;calls.length=0;
  await worker.scheduled({cron:'5 * * * *'},env);
  assert.ok(env.DB.statementCount<50,`Maintenance handler used ${env.DB.statementCount} D1 statements`);
  assert.equal(calls.filter(url=>new URL(url).hostname==='store.steampowered.com').length,6);
  assert.equal(calls.filter(url=>new URL(url).pathname==='/api/posts/ids').length,1);
  assert.equal(env.DB.sql.prepare('SELECT count(*) AS n FROM source_posts WHERE media_checked_at IS NOT NULL').get().n,10);
  env.DB.close();
});
test('maintenance refreshes Steam independently but defers media when either archive checkpoint is incomplete',async()=>{
  for(const [recent,history] of [['partial','ok'],['ok','partial'],['error','ok']]){
    const env=fixtureEnv(),calls=[],worker=fixtureWorker(maintenanceUpstream(calls));await importCatalog(env.DB,maintenanceFixture());
    await query(env.DB,'INSERT INTO app_meta(key,value_json) VALUES(?,?)','ingestion',JSON.stringify({state:recent})).run();
    await query(env.DB,'INSERT INTO app_meta(key,value_json) VALUES(?,?)','history',JSON.stringify({state:history})).run();
    env.DB.statementCount=0;
    await worker.scheduled({cron:'5 * * * *'},env);
    assert.ok(env.DB.statementCount<50);assert.equal(calls.length,6);assert.ok(calls.every(url=>new URL(url).hostname==='store.steampowered.com'));
    assert.equal(env.DB.sql.prepare('SELECT count(*) AS n FROM source_posts WHERE media_checked_at IS NOT NULL').get().n,0);env.DB.close();
  }
});
test('complete operator enrich route stays below 50 D1 statements for six cold apps plus media hydration',async()=>{
  const env=fixtureEnv(),calls=[],worker=fixtureWorker(maintenanceUpstream(calls));await importCatalog(env.DB,maintenanceFixture());
  env.DB.statementCount=0;
  const response=await worker.fetch(request('/admin/enrich',{method:'POST',auth:env.OPERATOR_TOKEN,body:{}}),env);
  assert.equal(response.status,200);const result=await response.json();assert.equal(result.steam.checked,6);assert.equal(result.media.checked,10);
  assert.ok(env.DB.statementCount<50,`Operator enrich used ${env.DB.statementCount} D1 statements`);env.DB.close();
});

test('disabling ingestion stops scheduled archive hydration even with completed checkpoints',async()=>{
  const env=fixtureEnv(undefined,{INGESTION_ENABLED:'false'}),calls=[],worker=fixtureWorker(maintenanceUpstream(calls));
  await importCatalog(env.DB,maintenanceFixture());
  for(const key of ['ingestion','history'])await query(env.DB,'INSERT INTO app_meta(key,value_json) VALUES(?,?)',key,JSON.stringify({state:'ok'})).run();
  await worker.scheduled({cron:'5 * * * *'},env);
  assert.equal(calls.length,6);assert.ok(calls.every(url=>new URL(url).hostname==='store.steampowered.com'));
  assert.equal(env.DB.sql.prepare('SELECT count(*) AS n FROM source_posts WHERE media_checked_at IS NOT NULL').get().n,0);
  env.DB.close();
});
