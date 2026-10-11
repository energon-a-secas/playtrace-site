import test from 'node:test';
import assert from 'node:assert/strict';
import { ingest } from '../src/ingestion.mjs';
import { catalog, importCatalog, removal } from '../src/store.mjs';
import { refreshSourceRecords, refreshSourceBatch, plainExcerpt } from '../src/source-evidence.mjs';
import { fixtureEnv, fixtureCatalog, fixtureGame, fixtureWorker, rawPost, NOW } from './helpers.mjs';
import { detailsOf, editDetails } from '../src/details.mjs';
import { REVIEWED_UNLABELED } from '../src/source-policy.mjs';
import { reviewedSource } from '../src/source-reviews.mjs';

const deps=(rows,now=NOW)=>({now:()=>now,sleep:async()=>{},fetch:async()=>Response.json({data:rows})});
test('ingestion retains bounded source prose and refreshes a known edit without changing identity or history dates',async()=>{
  const env=fixtureEnv(),original=rawPost('first',{selftext:'A puzzle game about patterns.\n\nPlay in your browser.'});
  await ingest(env,deps([original]));
  let game=(await catalog(env.DB)).games[0];
  assert.equal(game.summary,'A puzzle game about patterns. Play in your browser.');
  const initial=env.DB.sql.prepare('SELECT * FROM source_evidence').get();
  assert.equal(JSON.parse(initial.payload_json).body,original.selftext);
  assert.equal(JSON.stringify(game).includes('content_hash'),false);
  const edited={...original,selftext:'My game is called "Pattern Garden". It now has twelve puzzle rooms.',edited:NOW/1000+60,retrieved_on:NOW/1000+120,private_archive_field:'not retained'};
  await ingest(env,deps([edited],NOW+180000));
  game=(await catalog(env.DB)).games[0];
  assert.equal(game.title,'Pattern Garden');assert.match(game.summary,/twelve puzzle rooms/);
  assert.equal(game.id,'g_first');assert.equal(game.posts.length,1);assert.equal(game.updatedAt,new Date(original.created_utc*1000).toISOString());
  const changed=env.DB.sql.prepare('SELECT * FROM source_evidence').get();
  assert.notEqual(changed.content_hash,initial.content_hash);assert.notEqual(changed.changed_at,initial.changed_at);
  assert.equal(JSON.parse(changed.payload_json).sourceEditedAt,new Date(edited.edited*1000).toISOString());
  assert.equal(changed.payload_json.includes('not retained'),false);
  await ingest(env,deps([edited],NOW+240000));
  const repeated=env.DB.sql.prepare('SELECT * FROM source_evidence').get();
  assert.equal(repeated.content_hash,changed.content_hash);assert.equal(repeated.changed_at,changed.changed_at);assert.notEqual(repeated.checked_at,changed.checked_at);
  await refreshSourceRecords(env.DB,[{...original,retrieved_on:NOW/1000}],deps([],NOW+300000));
  assert.equal((await catalog(env.DB)).games[0].title,'Pattern Garden');
  assert.equal(env.DB.sql.prepare('SELECT content_hash FROM source_evidence').get().content_hash,changed.content_hash);
  env.DB.close();
});
test('manual details and an approved preview remain authoritative after source refresh',async()=>{
  const env=fixtureEnv(),raw=rawPost();await ingest(env,deps([raw]));
  const original=(await catalog(env.DB)).games[0];
  await editDetails(env.DB,original.id,{mode:'edit',revision:0,details:{...detailsOf(original),title:'My chosen title',summary:'My chosen description',platforms:['Linux']}},{subject:'admin'},deps([]));
  const preview={...original.preview,url:'https://api.playtrace.example/api/v1/media/11111111-1111-4111-8111-111111111111',kind:'image',storage:'r2',rights:'owner-consent'};
  env.DB.sql.prepare("UPDATE games SET payload_json=json_set(payload_json,'$.preview',json(?)) WHERE id=?").run(JSON.stringify(preview),original.id);
  await refreshSourceRecords(env.DB,[{...raw,selftext:'My game is called "Changed Name". My game is now playable on Windows.'}],deps([],NOW+60000));
  const game=(await catalog(env.DB)).games[0];
  assert.equal(game.title,'My chosen title');assert.equal(game.summary,'My chosen description');assert.deepEqual(game.platforms,['Linux']);assert.deepEqual(game.preview,preview);
  assert.match(game.posts[0].excerpt,/Changed Name/);env.DB.close();
});
test('excluded flairs, changed authors and unreviewed sources cannot rewrite a published project',async()=>{
  const env=fixtureEnv(),raw=rawPost();await ingest(env,deps([raw]));
  const before=(await catalog(env.DB)).games[0];
  await refreshSourceRecords(env.DB,[{...raw,link_flair_text:'Discussion',selftext:'My game is called "Bad Rewrite".'}],deps([]));
  assert.deepEqual((await catalog(env.DB)).games[0],before);
  assert.equal(JSON.parse(env.DB.sql.prepare('SELECT payload_json FROM source_evidence').get().payload_json).state,'needs-review');
  await refreshSourceRecords(env.DB,[{...raw,author:'DifferentMaker'}],deps([]));
  assert.deepEqual((await catalog(env.DB)).games[0],before);env.DB.close();
});
test('individually reviewed unlabeled sources remain eligible during refresh',async()=>{
  const env=fixtureEnv(),game=fixtureGame();game.posts[0].flair=null;game.posts[0].inclusion=REVIEWED_UNLABELED;
  await importCatalog(env.DB,fixtureCatalog([game]));
  await refreshSourceRecords(env.DB,[rawPost('abc12',{author:game.author.name,link_flair_text:null,selftext:'My puzzle game has a new chapter.'})],deps([]));
  const post=(await catalog(env.DB)).games[0].posts[0];
  assert.equal(post.flair,null);assert.equal(post.inclusion,REVIEWED_UNLABELED);assert.match(post.excerpt,/new chapter/);env.DB.close();
});
test('removed archive prose is scrubbed, and removal cascades evidence and prevents resurrection',async()=>{
  const env=fixtureEnv(),raw=rawPost();await ingest(env,deps([raw]));
  await refreshSourceRecords(env.DB,[{...raw,selftext:'[removed]',removed_by_category:'moderator'}],deps([]));
  const record=JSON.parse(env.DB.sql.prepare('SELECT payload_json FROM source_evidence').get().payload_json);
  assert.equal(record.state,'removed');assert.equal(record.body,'');
  const game=(await catalog(env.DB)).games[0];assert.match(game.posts[0].excerpt,/no longer available/);
  await removal(env.DB,null,game.id,'Creator request',new Date(NOW).toISOString());
  assert.equal(env.DB.sql.prepare('SELECT count(*) AS n FROM source_evidence').get().n,0);
  await ingest(env,deps([raw]));assert.equal((await catalog(env.DB)).games.length,0);env.DB.close();
});
test('a concurrent game change aborts both source and evidence updates for retry',async()=>{
  const env=fixtureEnv(),raw=rawPost();await ingest(env,deps([raw]));
  const before=env.DB.sql.prepare('SELECT content_hash FROM source_evidence').get().content_hash;
  const batch=env.DB.batch.bind(env.DB);let injected=false;
  env.DB.batch=async statements=>{
    if(!injected&&statements.some(statement=>statement.sql.includes('source_refresh_guard'))){injected=true;env.DB.sql.exec("UPDATE games SET payload_json=json_set(payload_json,'$.summary','Concurrent saved description')");}
    return batch(statements);
  };
  await assert.rejects(refreshSourceRecords(env.DB,[{...raw,selftext:'My game is called "Later Edit". New game puzzles.'}],deps([])),error=>error.code==='SERVICE_UNAVAILABLE');
  assert.equal(env.DB.sql.prepare('SELECT content_hash FROM source_evidence').get().content_hash,before);
  assert.equal((await catalog(env.DB)).games[0].summary,'Concurrent saved description');env.DB.close();
});
test('source maintenance checks at most ten posts and missing archive rows do not starve the next batch',async()=>{
  const env=fixtureEnv();await importCatalog(env.DB,fixtureCatalog(Array.from({length:12},(_,i)=>fixtureGame(`post${i.toString().padStart(2,'0')}`))));
  const requests=[],options={...deps([]),fetch:async value=>{requests.push(new URL(value).searchParams.get('ids').split(','));return Response.json({data:[]});}};
  assert.equal((await refreshSourceBatch(env.DB,options)).missing,10);
  assert.equal((await refreshSourceBatch(env.DB,options)).missing,2);
  assert.deepEqual(await refreshSourceBatch(env.DB,options),{checked:0});
  assert.equal(new Set(requests.flat()).size,12);assert.ok(requests.every(ids=>ids.length<=10));env.DB.close();
});
test('excerpt formatting produces bounded plain text without active markup or control characters',()=>{
  assert.equal(plainExcerpt('**Puzzle** [build](https://example.com/) <b>today</b> &#1;'),'Puzzle build today');
  const excerpt=plainExcerpt('A paragraph with words. '.repeat(100));assert.ok(excerpt.length<=600);assert.ok(excerpt.endsWith('…'));
});
test('a dated current-source review supersedes only its exact older archive observation',async()=>{
  const now=Date.parse('2026-10-11T19:00:00Z');
  const raw=rawPost('1wxpc76',{author:'surfing_samurai',title:'The Manor - a text driven adventure with modular expansion looking for validation',
    link_flair_text:'Questions & Help',removed_by_category:'reddit',retrieved_on:1791144792,created_utc:1791144772,selftext:'My game is called "The Manor". A text adventure game.',url:'https://the-manor.onrender.com/'});
  assert.equal(reviewedSource(raw,now).raw.removed_by_category,null);
  assert.equal(reviewedSource(raw,now).raw.link_flair_text,'Demo | Project | Workflow');
  for(const change of [{retrieved_on:now/1000},{selftext:'[deleted]'},{author:'DifferentMaker'},{removed_by_category:'moderator'}])assert.equal(reviewedSource({...raw,...change},now).review,null);
  const env=fixtureEnv(),game=fixtureGame('1wxpc76','surfing_samurai');game.title='The Manor';game.posts[0].title=raw.title;
  await importCatalog(env.DB,fixtureCatalog([game]));
  await refreshSourceRecords(env.DB,[raw],deps([],now));
  assert.equal((await catalog(env.DB)).games[0].title,'The Manor');assert.match((await catalog(env.DB)).games[0].posts[0].excerpt,/text adventure/);
  const evidence=JSON.parse(env.DB.sql.prepare('SELECT payload_json FROM source_evidence').get().payload_json);
  assert.equal(evidence.state,'available');assert.equal(evidence.currentReview.flair,'Demo | Project | Workflow');env.DB.close();
});
test('one cron definition keeps source and Steam maintenance in separate bounded invocations',async()=>{
  for(const minute of [5,45]){
    const env=fixtureEnv(),game=fixtureGame();game.projectUrl='https://store.steampowered.com/app/620/';await importCatalog(env.DB,fixtureCatalog([game]));
    const urls=[],worker=fixtureWorker(async value=>{
      urls.push(value);
      if(new URL(value).hostname==='store.steampowered.com')return Response.json({'620':{success:true,data:{steam_appid:620,type:'game',name:'Puzzle',is_free:true,release_date:{coming_soon:false}}}});
      return Response.json({data:[rawPost('abc12',{author:game.author.name})]});
    });
    const before=env.DB.statementCount;
    await worker.scheduled({cron:'5,45 * * * *',scheduledTime:Date.parse(`2026-10-10T12:${minute.toString().padStart(2,'0')}:00Z`)},env);
    assert.equal(urls.length,1);assert.equal(new URL(urls[0]).hostname,minute===5?'store.steampowered.com':'arctic-shift.photon-reddit.com');
    assert.ok(env.DB.statementCount-before<50);env.DB.close();
  }
});
