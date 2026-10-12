import { query } from './store.mjs';
import { exactKeys, invalid, ApiError, unavailable, strongSecret } from './http.mjs';
import { hmac, take } from './limits.mjs';

export const events=['page_view','game_view','game_outbound','favorite_save','favorite_remove','feedback_save','rating_save','research_start','research_complete','quiz_start','quiz_complete'];
const pages=['home','browse','game','research','quiz','about','directory','insights'];
const projectEvents=new Set(['game_view','game_outbound','favorite_save','favorite_remove','feedback_save','rating_save','research_start','research_complete']);
export async function pruneUsage(db,deps){
  const now=Math.floor(deps.now()/1000);
  await db.batch([query(db,'DELETE FROM usage_receipts WHERE expires_at<=?',now),query(db,'DELETE FROM rate_limits WHERE expires_at<=?',now),query(db,'DELETE FROM usage_daily WHERE day<?',new Date(deps.now()-179*86400000).toISOString().slice(0,10))]);
}
export async function recordUsage(db,env,request,body,deps){
  if(request.headers.get('DNT')==='1'||request.headers.get('Sec-GPC')==='1'||/bot|spider|crawler|HeadlessChrome/i.test(request.headers.get('User-Agent')||''))return {accepted:0};
  exactKeys(body,['events']);
  if(!Array.isArray(body.events)||body.events.length<1||body.events.length>10)throw invalid('Send one to ten events.');
  const ids=new Set();
  for(const event of body.events){
    exactKeys(event,['id','event','page','gameId']);
    if(!/^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/.test(event.id)||ids.has(event.id)||!events.includes(event.event)||!pages.includes(event.page)
      ||(projectEvents.has(event.event)?!/^g_[a-z0-9]{5,12}$/.test(event.gameId||''):event.gameId!==null))throw invalid('Invalid anonymous event.');
    ids.add(event.id);
  }
  if(!strongSecret(env.RATE_LIMIT_SECRET))throw unavailable();
  const ip=request.headers.get('CF-Connecting-IP');if(!ip||ip.length>64||!/^[0-9a-fA-F:.]+$/.test(ip))throw unavailable();
  const now=Math.floor(deps.now()/1000),hour=Math.floor(now/3600),day=new Date(deps.now()).toISOString().slice(0,10);
  const network=await hmac(env.RATE_LIMIT_SECRET,`usage:${hour}:${ip}`);
  if(!await take(db,`usage:${network}:${hour}`,120,(hour+1)*3600,now))throw new ApiError('RATE_LIMITED','Try again later.',429,3600);
  const payload=JSON.stringify(body.events);
  const result=await db.batch([
    query(db,'DELETE FROM usage_receipts WHERE expires_at<=?',now),
    query(db,'DELETE FROM rate_limits WHERE expires_at<=?',now),
    query(db,`INSERT INTO usage_daily(day,event,page,game_id,count)
      SELECT ?,json_extract(j.value,'$.event'),json_extract(j.value,'$.page'),COALESCE(json_extract(j.value,'$.gameId'),''),count(*)
      FROM json_each(?) j WHERE NOT EXISTS(SELECT 1 FROM usage_receipts r WHERE r.id=json_extract(j.value,'$.id'))
      AND (json_extract(j.value,'$.gameId') IS NULL OR EXISTS(SELECT 1 FROM games g WHERE g.id=json_extract(j.value,'$.gameId') AND g.status='published' AND NOT EXISTS(SELECT 1 FROM removals WHERE game_id=g.id)))
      GROUP BY json_extract(j.value,'$.event'),json_extract(j.value,'$.page'),COALESCE(json_extract(j.value,'$.gameId'),'')
      ON CONFLICT(day,event,page,game_id) DO UPDATE SET count=usage_daily.count+excluded.count RETURNING count`,day,payload),
    query(db,"INSERT INTO usage_receipts(id,expires_at) SELECT json_extract(value,'$.id'),? FROM json_each(?) WHERE 1 ON CONFLICT DO NOTHING",now+86400,payload),
    query(db,'DELETE FROM usage_daily WHERE day<?',new Date(deps.now()-179*86400000).toISOString().slice(0,10)),
  ]);
  return {accepted:result[2].results.length};
}
export async function usageMetrics(db,deps){
  const since=new Date(deps.now()-29*86400000).toISOString().slice(0,10);
  const eligible="g.status='published' AND NOT EXISTS(SELECT 1 FROM removals WHERE game_id=g.id)";
  const [daily,projects,feedback,choices,ratings,research]=await db.batch([
    query(db,'SELECT day,event,sum(count) AS count FROM usage_daily WHERE day>=? GROUP BY day,event ORDER BY day,event',since),
    query(db,`SELECT u.game_id,u.event,sum(u.count) AS count FROM usage_daily u JOIN games g ON g.id=u.game_id
      WHERE u.day>=? AND g.status='published' AND NOT EXISTS(SELECT 1 FROM removals WHERE game_id=g.id)
      GROUP BY u.game_id,u.event ORDER BY count DESC LIMIT 200`,since),
    query(db,`SELECT count(*) AS count,count(DISTINCT f.game_id) AS games FROM feedback f JOIN games g ON g.id=f.game_id WHERE f.status='published' AND ${eligible}`),
    query(db,`SELECT j.value AS choice,count(*) AS count FROM feedback f JOIN games g ON g.id=f.game_id,json_each(f.choices_json) j WHERE f.status='published' AND ${eligible} GROUP BY j.value ORDER BY count DESC`),
    query(db,`SELECT count(*) AS count,count(DISTINCT r.game_id) AS games FROM ratings r JOIN games g ON g.id=r.game_id WHERE ${eligible}`),
    query(db,`SELECT count(*) AS count,count(DISTINCT r.game_id) AS games FROM research_responses r JOIN games g ON g.id=r.game_id WHERE ${eligible}`),
  ]);
  return {since,through:new Date(deps.now()).toISOString(),daily:daily.results,projects:projects.results,unit:'Actions, not unique people or verified plays',retentionDays:180,
    community:{feedback:feedback.results[0],choices:choices.results,ratings:ratings.results[0],research:research.results[0]}};
}
