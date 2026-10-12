import { initInsights, loadInsights } from './admin-insights.js';
import { request } from './api.js';
import { NeoAuth } from './neorgon-auth.js';

// An hourly public snapshot avoids re-reading the entire archive per visitor.
// Never use the admin endpoint or cache an authenticated response here.
async function evidenceRequest(path){
  if(path==='/feedback-patterns'||path.startsWith('/feedback-patterns?'))return request(path);
  if(path!=='/insights'&&!path.startsWith('/insights?'))throw new Error('This view only reads public catalogue evidence.');
  if(path==='/insights')try{
    const response=await fetch('data/community-insights.json',{cache:'no-cache'});
    if(!response.ok)throw new Error('No snapshot');
    const data=await response.json(),age=Date.now()-Date.parse(data.observedAt);
    if(data.version!==1||!Array.isArray(data.games)||data.games.length!==data.pagination?.total||data.pagination.nextCursor!==null||!Number.isFinite(age)||age<0||age>86400000)throw new Error('Outdated snapshot');
    return data;
  }catch{/* Fall through to the public, paginated API when a snapshot is absent or stale. */}
  return request(path);
}
initInsights({request:evidenceRequest,publicMode:true});
loadInsights();
NeoAuth.start();
