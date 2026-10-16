import { readBytes } from './http.mjs';

export function redditConfigured(env={}) {
  return env.REDDIT_API_APPROVED==='true'&&Boolean(env.REDDIT_CLIENT_ID&&env.REDDIT_CLIENT_SECRET&&env.REDDIT_USER_AGENT);
}
async function redditJson(url,options,deps){
  const response=await deps.fetch(url,{...options,redirect:'manual',signal:AbortSignal.timeout(20000)});
  if(!response.ok){
    const retry=response.headers.get('Retry-After'),seconds=Number(retry),date=Date.parse(retry);
    await response.body?.cancel();const error=new Error(`Reddit HTTP ${response.status}`);
    if(response.status===429)error.retryAt=deps.now()+Math.max(60000,Number.isFinite(seconds)?seconds*1000:Number.isFinite(date)?date-deps.now():3600000);
    throw error;
  }
  const body=JSON.parse(new TextDecoder().decode(await readBytes(response.body,2*1024*1024)));
  const remaining=response.headers.get('x-ratelimit-remaining'),reset=Number(response.headers.get('x-ratelimit-reset'));
  if(remaining!==null&&Number(remaining)<1)body.rateLimitUntil=deps.now()+Math.max(60000,Number.isFinite(reset)?reset*1000:60000);
  return body;
}
// App-only OAuth reads approved public data; no user password or posting scope.
export async function redditToken(env,deps){
  if(!redditConfigured(env))throw new Error('Reddit approved API access is not configured.');
  const body=await redditJson('https://www.reddit.com/api/v1/access_token',{method:'POST',headers:{Authorization:`Basic ${btoa(env.REDDIT_CLIENT_ID+':'+env.REDDIT_CLIENT_SECRET)}`,'User-Agent':env.REDDIT_USER_AGENT,'Content-Type':'application/x-www-form-urlencoded'},body:'grant_type=client_credentials'},deps);
  if(body.rateLimitUntil){const error=new Error('Reddit request budget is exhausted.');error.retryAt=body.rateLimitUntil;throw error;}
  if(typeof body.access_token!=='string'||!body.access_token.length||body.access_token.length>4096||body.token_type?.toLowerCase()!=='bearer')throw new Error('Reddit returned no usable access token.');
  return body.access_token;
}
export async function redditPosts(ids,token,env,deps){
  if(ids.length<1||ids.length>100||ids.some(id=>!/^[a-z0-9]{5,12}$/.test(id)))throw new Error('Invalid Reddit ID batch.');
  const body=await redditJson('https://oauth.reddit.com/api/info?id='+ids.map(id=>'t3_'+id).join(',')+'&raw_json=1', {headers:{Authorization:`Bearer ${token}`,'User-Agent':env.REDDIT_USER_AGENT}},deps);
  if(!Array.isArray(body.data?.children))throw new Error('Reddit returned an invalid listing.');
  const rows=body.data.children.filter(item=>item.kind==='t3').map(item=>item.data);
  if(body.rateLimitUntil)rows.rateLimitUntil=body.rateLimitUntil;
  return rows;
}
