// Provider labels describe the public URL, never inferred server infrastructure.
const providers = [
  ['itch','itch.io',['itch.io']], ['steam','Steam',['store.steampowered.com']],
  ['github-pages','GitHub Pages',['github.io']], ['netlify','Netlify',['netlify.app']],
  ['vercel','Vercel',['vercel.app']], ['cloudflare-pages','Cloudflare Pages',['pages.dev']],
  ['firebase','Firebase Hosting',['web.app','firebaseapp.com']], ['replit','Replit',['replit.app','repl.co']],
  ['github','GitHub repository',['github.com']], ['gitlab-pages','GitLab Pages',['gitlab.io']], ['gitlab','GitLab repository',['gitlab.com']],
  ['google-play','Google Play',['play.google.com']], ['app-store','App Store',['apps.apple.com']],
  ['newgrounds','Newgrounds',['newgrounds.com']], ['gx-games','GX.games',['gx.games']],
  ['neocities','Neocities',['neocities.org']], ['render','Render',['onrender.com']],
  ['crazygames','CrazyGames',['crazygames.com']], ['swisstransfer','SwissTransfer',['swisstransfer.com']],
];
export function destinationHost(value) {
  try {
    const url=new URL(value);
    if(url.protocol!=='https:'||url.username||url.password)return null;
    const host=url.hostname.toLowerCase().replace(/^www\./,'');
    const known=providers.find(([, ,hosts])=>hosts.some(name=>host===name||host.endsWith('.'+name)));
    return {host,provider:known?.[0]||'custom',label:known?.[1]||'Custom / other domain',
      kind:known?.[0]==='swisstransfer'?'file-transfer':['github','gitlab'].includes(known?.[0])?'repository':['itch','steam','google-play','app-store'].includes(known?.[0])?'store':'site'};
  }catch{return null;}
}
export const linkStates=Object.freeze({reachable:'Reachable',broken:'Reported missing',blocked:'Check restricted',unverified:'Unverified','not-checked':'Not checked'});
export const linkReasons=Object.freeze({missing:'HTTP 404 or 410',restricted:'Access or rate limit',server:'Server error',timeout:'Check timed out',dns:'DNS could not be verified',redirect:'Redirect could not be followed',policy:'Destination failed the public-URL check',network:'Network check failed','store-api':'Store metadata unavailable'});
export function linkEvidence(game) {
  const url=game.projectUrl,raw=game.availability;
  const current=raw&&raw.projectUrl===url?raw:null;
  return {destination:destinationHost(url),finalDestination:current?.finalUrl?destinationHost(current.finalUrl):null,
    status:current&&Object.hasOwn(linkStates,current.status)?current.status:'not-checked',
    checkedAt:current?.checkedAt||null,httpStatus:Number.isInteger(current?.httpStatus)&&current.httpStatus>=100&&current.httpStatus<=599?current.httpStatus:null,reason:current?.failureReason||null,
    redirects:Number.isInteger(current?.redirectCount)?current.redirectCount:null,
    recoveredAt:current?.recoveredAt||null,failureSince:current?.failureSince||null,
    checkMethod:current?.checkMethod||null,evidenceCheckedAt:current?.evidenceCheckedAt||current?.checkedAt||null};
}
export function hostingReport(games,{provider='',status=''}={}) {
  const listed=games.filter(g=>g.projectUrl),selected=listed.filter(g=>(!provider||g.link?.destination?.provider===provider)&&(!status||g.link?.status===status));
  const groups=new Map();
  for(const g of selected){const host=g.link?.destination||destinationHost(g.projectUrl),key=host?.provider||'custom';
    if(!groups.has(key))groups.set(key,{id:key,label:host?.label||'Custom / other domain',projects:0,states:Object.fromEntries(Object.keys(linkStates).map(k=>[k,0])),redirected:0});
    const row=groups.get(key);row.projects++;row.states[g.link?.status||'not-checked']++;
    if(g.link?.finalDestination?.host&&g.link.finalDestination.host!==host?.host)row.redirected++;
  }
  return {listed:listed.length,unlisted:games.length-listed.length,selected,groups:[...groups.values()].sort((a,b)=>b.projects-a.projects||a.label.localeCompare(b.label))};
}
