import test from 'node:test';
import assert from 'node:assert/strict';
import { buildSnapshot } from '../../scripts/build-snapshot.mjs';
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
