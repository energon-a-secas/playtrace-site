// Cache only anonymous, public discovery reads. Personal and editable data
// always go through their normal authorization and database paths.
export function publicCacheKey(request, action) {
  if (request.method !== 'GET' || !['catalog','status','highlights','game','insights'].includes(action)
    || ['Authorization','X-Feedback-Key','Cookie'].some(header=>request.headers.has(header))) return null;
  const input=new URL(request.url),key=new URL(input.pathname,input.origin);
  if(action==='catalog') {
    key.searchParams.set('pageSize',input.searchParams.get('pageSize')||'200');
    if(input.searchParams.has('cursor'))key.searchParams.set('cursor',input.searchParams.get('cursor'));
  }
  if(action==='insights'&&input.searchParams.has('cursor'))key.searchParams.set('cursor',input.searchParams.get('cursor'));
  return new Request(key);
}
export const REVISION_KEY = 'discovery/revision.json';
export async function versionedPublicKey(env,key) {
  if(!key)return null;
  let revision='0';
  if(env.PREVIEWS) {
    // R2 reads are strongly consistent. A warm edge cache must not depend on
    // D1's daily read quota; a storage failure falls back to a fresh DB read.
    try {
      const record=await env.PREVIEWS.get(REVISION_KEY);
      if(record)revision=(await new Response(record.body).json()).revision;
      if(typeof revision!=='string')return null;
    } catch { return null; }
  } else if(env.DB) {
    const row=await env.DB.prepare("SELECT value_json FROM app_meta WHERE key='public_cache_revision'").first();
    revision=row?.value_json||'0';
  }
  const url=new URL(key.url);url.searchParams.set('__revision',revision);return new Request(url);
}
export async function invalidatePublicCache(env) {
  const revision=crypto.randomUUID();
  if(env.PREVIEWS)await env.PREVIEWS.put(REVISION_KEY,JSON.stringify({revision}),{httpMetadata:{contentType:'application/json'}});
  else if(env.DB)await env.DB.prepare("INSERT INTO app_meta(key,value_json) VALUES('public_cache_revision',?) ON CONFLICT(key) DO UPDATE SET value_json=excluded.value_json").bind(JSON.stringify(revision)).run();
}
export async function readPublicCache(cache,key) {
  if(!cache||!key)return null;
  try { const hit=await cache.match(key); return hit?.status===200?new Response(hit.body,hit):null; }
  catch { return null; }
}
export async function writePublicCache(cache,key,response) {
  if(!cache||!key||response.status!==200||response.headers.has('Set-Cookie')||!response.headers.get('Cache-Control')?.includes('public'))return;
  try { await cache.put(key,response.clone()); } catch { /* Cache failure must not break discovery. */ }
}
