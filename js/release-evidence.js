// Store-reported release dates are separate from the first community showcase.
// Vague and upcoming dates stay labels; never turn a year/quarter into January 1.
const months=['jan','feb','mar','apr','may','jun','jul','aug','sep','oct','nov','dec'];
export function exactReleaseDate(label){
  if(typeof label!=='string')return null;
  let year,month,day,match;
  const text=label.trim();
  if((match=/^(\d{4})-(\d{2})-(\d{2})$/.exec(text)))[,year,month,day]=match;
  else if((match=/^(\d{1,2})\s+([A-Za-z]{3,9}),?\s+(\d{4})$/.exec(text))){day=match[1];month=months.indexOf(match[2].slice(0,3).toLowerCase())+1;year=match[3];}
  else if((match=/^([A-Za-z]{3,9})\s+(\d{1,2}),?\s+(\d{4})$/.exec(text))){month=months.indexOf(match[1].slice(0,3).toLowerCase())+1;day=match[2];year=match[3];}
  else return null;
  if(+year<1970||+year>2100||+month<1||+month>12||+day<1||+day>31)return null;
  const date=`${year}-${String(month).padStart(2,'0')}-${String(day).padStart(2,'0')}`;
  return new Date(date+'T00:00:00Z').toISOString().slice(0,10)===date?date:null;
}
export function releaseEvidence(steam){
  if(!steam?.releaseDateLabel)return null;
  const parsed=exactReleaseDate(steam.releaseDateLabel),date=steam.state==='released'&&parsed&&parsed<=steam.checkedAt?.slice(0,10)?parsed:null;
  return {provider:'Steam',appId:steam.appId,url:steam.url,label:steam.releaseDateLabel,date,
    precision:date?'day':'unspecified',kind:steam.releaseKind||steam.type,state:steam.state,checkedAt:steam.checkedAt};
}
export function releaseTimeline(games){
  const apps=new Map();
  for(const game of games){const release=game.storeRelease;if(!release?.date||release.state!=='released')continue;
    const key=release.provider+':'+release.appId,old=apps.get(key);
    if(!old||game.firstSeenAt<old.firstSeenAt)apps.set(key,game);
  }
  const entries=[...apps.values()].sort((a,b)=>b.storeRelease.date.localeCompare(a.storeRelease.date)||a.id.localeCompare(b.id)),buckets=new Map();
  for(const game of entries){const release=game.storeRelease,month=release.date.slice(0,7),row=buckets.get(month)||{month,game:0,demo:0,'early-access':0};if(Object.hasOwn(row,release.kind))row[release.kind]++;buckets.set(month,row);}
  return {entries,periods:[...buckets.values()].sort((a,b)=>a.month.localeCompare(b.month))};
}
