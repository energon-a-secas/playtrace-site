const day=86400000;
export const mentionDimensions=new Set(['styles','formats','models','engines','techniques','resources']);
export const missingLabel={category:'Other / unclassified',stage:'Unspecified',distribution:'No project link',styles:'No recognized style mention',formats:'No recognized format mention',models:'No recognized model mention',engines:'No recognized engine mention',techniques:'No recognized technique mention',resources:'No recognized tool / asset mention'};
export function periodKey(at,grain='month') { const d=new Date(at);return grain==='quarter'?`${d.getUTCFullYear()}-Q${Math.floor(d.getUTCMonth()/3)+1}`:d.toISOString().slice(0,7); }
export function valuesFor(game,dimension,observations=game.observations) {
  if(mentionDimensions.has(dimension))return [...new Set(observations.flatMap(post=>post[dimension]||[]))];
  const value=game[dimension];return !value||['other','unknown','No project link'].includes(value)?[]:[value];
}
export function trend(games,{dimension='category',value='',grain='month',from='',to=''}={}) {
  const buckets=new Map();
  const ensure=key=>{if(!buckets.has(key))buckets.set(key,{period:key,ids:new Set(),matched:new Set(),known:new Set(),full:new Set(),posts:new Set()});return buckets.get(key);};
  const inRange=at=>(!from||at.slice(0,10)>=from)&&(!to||at.slice(0,10)<=to);
  for(const game of games){
    if(mentionDimensions.has(dimension)){
      for(const post of game.observations){if(!inRange(post.at))continue;const row=ensure(periodKey(post.at,grain));row.ids.add(game.id);row.posts.add(post.id);if(post.coverage==='full-text')row.full.add(game.id);const labels=valuesFor(game,dimension,[post]);if(labels.length)row.known.add(game.id);if(labels.includes(value))row.matched.add(game.id);}
    }else if(inRange(game.firstSeenAt)){const row=ensure(periodKey(game.firstSeenAt,grain));row.ids.add(game.id);const labels=valuesFor(game,dimension);if(labels.length)row.known.add(game.id);if(labels.includes(value))row.matched.add(game.id);if(game.observations.some(p=>p.coverage==='full-text'))row.full.add(game.id);}
  }
  const result=[...buckets.values()].sort((a,b)=>a.period.localeCompare(b.period)).map(row=>({period:row.period,total:row.ids.size,count:value?row.matched.size:row.ids.size,known:row.known.size,unknown:row.ids.size-row.known.size,full:row.full.size}));
  // Fill empty periods; zero observed projects does not establish archive completeness.
  if(result.length){let d=new Date(result[0].period.includes('Q')?`${result[0].period.slice(0,4)}-${String((Number(result[0].period.at(-1))-1)*3+1).padStart(2,'0')}-01`:result[0].period+'-01');const end=result.at(-1).period,byKey=new Map(result.map(row=>[row.period,row]));const filled=[];while(periodKey(d,grain)<=end&&filled.length<240){const key=periodKey(d,grain);filled.push(byKey.get(key)||{period:key,total:0,count:0,known:0,unknown:0,full:0});d.setUTCMonth(d.getUTCMonth()+(grain==='quarter'?3:1));}return filled;}
  return result;
}
export function breakdown(games,dimension) {
  const counts=new Map();for(const game of games){const labels=valuesFor(game,dimension);for(const label of labels.length?labels:[missingLabel[dimension]||'Unspecified'])counts.set(label,(counts.get(label)||0)+1);}
  return [...counts].map(([label,count])=>({label,count})).sort((a,b)=>b.count-a.count||a.label.localeCompare(b.label));
}
export function compareRelease(games,release,{dimension='styles',value,days=28,observedThrough=Date.now()}={}) {
  const launch=Date.parse(release.date+'T00:00:00Z'),window=days*day;
  const collect=(start,end)=>{
    const active=[];let posts=0,full=0,known=0,matched=0,model=0,coMention=0;
    for(const game of games){const observations=game.observations.filter(p=>Date.parse(p.at)>=start&&Date.parse(p.at)<end);if(!observations.length)continue;active.push(game.id);posts+=observations.length;const labels=valuesFor(game,dimension,observations),hit=labels.includes(value),modelHit=observations.some(p=>p.models.some(m=>release.mentions.includes(m)));if(labels.length)known++;if(hit)matched++;if(modelHit)model++;if(hit&&modelHit)coMention++;if(observations.some(p=>p.coverage==='full-text'))full++;}
    return {start:new Date(start).toISOString().slice(0,10),end:new Date(end-day).toISOString().slice(0,10),total:active.length,posts,known,unknown:active.length-known,matched,model,coMention,full,share:active.length?matched/active.length:null};
  };
  const before=collect(launch-window,launch),after=collect(launch,launch+window);
  return {before,after,delta:before.share!==null&&after.share!==null?(after.share-before.share)*100:null,
    smallSample:before.total<20||after.total<20,incompleteAfter:launch+window>Number(observedThrough)};
}
export function csv(rows) {return rows.map(row=>row.map(value=>{let s=String(value??'');if(/^[=+\-@\t\r]/.test(s))s="'"+s;return '"'+s.replace(/"/g,'""')+'"';}).join(',')).join('\r\n');}
