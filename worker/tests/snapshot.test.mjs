import test from 'node:test';
import assert from 'node:assert/strict';
import { buildSnapshot } from '../../scripts/build-snapshot.mjs';
import { reviewFlairs } from '../../scripts/review-source-flairs.mjs';
import { fixtureCatalog, rawPost, NOW } from './helpers.mjs';
const base=()=>fixtureCatalog([]);
const selection={postIds:['new12'],title:'A named game',summary:'A reviewed puzzle game with its own public build.',projectUrl:'https://newmaker.itch.io/my-game',category:'puzzle',stage:'playable',platforms:['Browser'],tags:[]};
const review=entry=>({schemaVersion:1,reviewedAt:new Date(NOW).toISOString(),retrievedAt:new Date(NOW).toISOString(),selections:[entry]});
test('snapshot builder requires individual review evidence for an unlabeled source and preserves missing flair',()=>{
 const raw=rawPost('new12',{link_flair_text:null});
 assert.throws(()=>buildSnapshot(base(),[raw],review(selection)),/Unavailable/);
 assert.throws(()=>buildSnapshot(base(),[raw],review({...selection,inclusion:'reviewed-unlabeled-game'})),/explicit individual review/);
 const entry={...selection,inclusion:'reviewed-unlabeled-game',reason:'Maker describes a specific puzzle game and links its build.'};
 const result=buildSnapshot(base(),[raw],review(entry));
 assert.equal(result.games[0].posts[0].flair,null);assert.equal(result.games[0].posts[0].inclusion,entry.inclusion);
 for(const change of [{link_flair_text:'News'},{link_flair_text:'Discussion'},{removed_by_category:'moderator'},{over_18:true}])
  assert.throws(()=>buildSnapshot(base(),[{...raw,...change}],review(entry)),/Unavailable/);
 assert.throws(()=>buildSnapshot(base(),[raw],review({...entry,projectUrl:'https://invented.example/game'})),/absent from source/);
});
test('snapshot source links ignore sentence punctuation without accepting invented destinations',()=>{
 const raw=rawPost('new12',{url:'https://www.reddit.com/r/aigamedev/comments/new12/',selftext:'Play my game at https://newmaker.itch.io/my-game.'});
 assert.equal(buildSnapshot(base(),[raw],review(selection)).games[0].projectUrl,selection.projectUrl);
});
test('a documented current Reddit review corrects stale flair and removal without weakening normal source checks',()=>{
 const raw=rawPost('new12',{link_flair_text:'Questions & Help',removed_by_category:'reddit'});
 const evidence={id:raw.id,url:'https://www.reddit.com/r/aigamedev/comments/new12/',author:raw.author,title:raw.title,
  checkedAt:new Date(NOW).toISOString(),flair:'Demo | Project | Workflow',availability:'public',
  archived:{flair:'Questions & Help',removedByCategory:'reddit'},reason:'The canonical Reddit page now displays the full post and project flair.'};
 const reviewed={...review(selection),currentSourceChecks:[evidence]};
 assert.throws(()=>buildSnapshot(base(),[raw],review(selection)),/Unavailable/);
 const result=buildSnapshot(base(),[raw],reviewed);
 assert.equal(result.games[0].posts[0].flair,evidence.flair);
 assert.equal(raw.link_flair_text,'Questions & Help');assert.equal(raw.removed_by_category,'reddit');
 assert.equal(reviewFlairs(result,[raw],reviewed.reviewedAt,[evidence]).filtered.games.length,1);
 for(const patch of [{author:'different'},{url:'https://example.com/'},{availability:'removed'},{flair:'News'},{checkedAt:'invalid'}])
  assert.throws(()=>buildSnapshot(base(),[raw],{...reviewed,currentSourceChecks:[{...evidence,...patch}]}),/Invalid current-source/);
 assert.throws(()=>buildSnapshot(base(),[{...raw,link_flair_text:'News'}],reviewed),/Archive evidence changed/);
 for(const patch of [{over_18:true},{selftext:'[deleted]'}]) assert.throws(()=>buildSnapshot(base(),[{...raw,...patch}],reviewed),/Unavailable/);
 assert.throws(()=>buildSnapshot(base(),[{...raw,removed:true}],reviewed),/Unreviewed removal/);
});
