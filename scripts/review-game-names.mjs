// Read-only evidence gathering and review plan. Applying the generated SQL is a
// separate operator action; every field update compares its previous value.
import { readFile, writeFile } from 'node:fs/promises';
import { lookup } from 'node:dns/promises';
import { isIP } from 'node:net';
import { pathToFileURL } from 'node:url';
import { nameForGame, steamAppId } from '../worker/src/names.mjs';
import { normalizeSteam } from '../worker/src/steam.mjs';
import { projectLinks, repositoryUrl } from '../worker/src/project-links.mjs';
import { classifySource } from '../worker/src/taxonomy.mjs';
import { decodeEntities } from '../worker/src/archive.mjs';

const publicIP = ip => !isIP(ip) ? false : ip.includes(':') ? /^(?:2|3)[a-f\d]{3}:/i.test(ip)
  : !/^(?:0|10|127|169\.254|192\.168|172\.(?:1[6-9]|2\d|3[01])|100\.(?:6[4-9]|[7-9]\d|1[01]\d|12[0-7])|192\.0\.0|198\.(?:18|19)|22[4-9]|23\d|24\d|25[0-5])\./.test(ip);
async function publicUrl(value) {
  const url = new URL(value);
  if (url.protocol !== 'https:' || url.username || url.password || url.port || isIP(url.hostname)
    || !url.hostname.includes('.') || /\.(?:local|internal|localhost)$/.test(url.hostname)) throw Error('Unsupported host');
  const ips = await lookup(url.hostname, {all:true});
  if (!ips.length || ips.some(({address})=>!publicIP(address))) throw Error('Non-public host');
  return url;
}
async function readPublic(value) {
  let url = value;
  const signal = AbortSignal.timeout(12000);
  for (let hops=0; hops<4; hops++) {
    const safe = await publicUrl(url);
    const response = await fetch(safe, {redirect:'manual', signal, headers:{'User-Agent':'Playtrace/1.0 catalogue title review',Accept:'text/html,application/json'}});
    if ([301,302,303,307,308].includes(response.status)) { await response.body?.cancel(); url=new URL(response.headers.get('Location'),safe).href; continue; }
    if (!response.ok) { await response.body?.cancel(); throw Error(`HTTP ${response.status}`); }
    const parts=[]; let size=0;
    for await (const chunk of response.body) { size+=chunk.length; if(size>1024*1024) throw Error('Page too large'); parts.push(chunk); }
    return {text:Buffer.concat(parts).toString('utf8'),url:safe.href};
  }
  throw Error('Too many redirects');
}
export function pageName(html) {
  const tags=html.match(/<meta\b[^>]*>/gi)||[];
  const attrs=tag=>Object.fromEntries([...tag.matchAll(/([\w:-]+)\s*=\s*(["'])(.*?)\2/gs)].map(m=>[m[1].toLowerCase(),m[3]]));
  const meta=tags.map(attrs).find(a=>/^(?:og:title|twitter:title)$/i.test(a.property||a.name||''));
  const raw=meta?.content || /<title\b[^>]*>([\s\S]*?)<\/title>/i.exec(html)?.[1];
  return tidyPageName(raw);
}
export function tidyPageName(raw) {
  if (!raw) return null;
  let title=decodeEntities(raw).replace(/&mdash;/gi,'—').replace(/&ndash;/gi,'–').replace(/&nbsp;/gi,' ').replace(/<[^>]*>/g,'').trim();
  if (/\b(framework|game engine|game development|game tools|asset pack)\b/i.test(title)) return null;
  title=title.replace(/ by .+?(?: - itch\.io)?$/i,'').replace(/ on Steam$/i,'')
    .replace(/^(?:Pixelfork\s*\|\s*|Play\s+|🎮\s*)/i,'').replace(/\s+(?:App - App Store|on Unity Play|v\d+(?:\.\d+)* on Spawn|🕹️ Play on CrazyGames)$/i,'');
  const segments=title.split(/\s+(?:\||—|–|·|•)\s+/);
  if(segments.length>1) title=segments[0];
  return title.replace(/\s*-\s*(?:(?:October|November|December|January|February|March|April|May|June|July|August|September)\b.*|Free Online Game.*|a Hugging Face Space.*)$/i,'')
    .replace(/\s+on RUN\.world$/i,'').replace(/^(.+) - \1$/i,'$1').trim();
}
export function reviewNames(games, raw, metadata={}) {
  const sources=new Map(raw.map(post=>[post.id,post])), changes=[], unresolved=[];
  for (const original of games) {
    const source=sources.get(original.id.slice(2));
    if (!source || source.author?.toLowerCase()!==original.author.name.toLowerCase()) throw Error(`Missing source evidence: ${original.id}`);
    const game={...original}, fields={}, evidence=[];
    const links=projectLinks(source);
    if (links.repositoryUrl && game.repositoryUrl!==links.repositoryUrl) fields.repositoryUrl=links.repositoryUrl;
    const discovered = links.projectUrl && !repositoryUrl(links.projectUrl) && game.reviewStatus==='source-described'
      && /(?:\.itch\.io\/|store\.steampowered\.com\/app\/|\.github\.io\/|\.gitlab\.io\/)/.test(links.projectUrl);
    if ((repositoryUrl(game.projectUrl) || (!game.projectUrl && discovered)) && links.projectUrl && links.projectUrl!==game.projectUrl) {
      fields.projectUrl=links.projectUrl; game.projectUrl=links.projectUrl; evidence.push({method:'source-playable-link',url:links.projectUrl});
    }
    const meta=metadata[game.projectUrl]||{};
    const name=nameForGame(game,{body:source.selftext||'',steamTitle:meta.steam?.title,pageTitle:tidyPageName(meta.title)});
    if (name && name.title!==game.title) { fields.title=name.title; evidence.push({...name,url:name.url||original.posts.find(p=>p.id===source.id).url}); }
    if (game.category==='other' && classifySource(source.title,source.selftext||'').category==='clicker') fields.category='clicker';
    if (Object.keys(fields).length) changes.push({id:game.id,before:Object.fromEntries(Object.keys(fields).map(key=>[key,original[key]??null])),after:fields,evidence});
    if (!name && game.reviewStatus==='source-described' && original.title===source.title) unresolved.push({id:game.id,title:game.title,url:game.projectUrl});
  }
  return {checkedAt:new Date().toISOString(),scanned:games.length,changes,unresolved};
}
export function reviewSql(report) {
  const quote=value=>`'${String(value).replace(/'/g,"''")}'`;
  const literal=value=>value===null?'NULL':quote(value);
  return report.changes.flatMap(change=>Object.entries(change.after).map(([field,value])=>{
    if(!['title','category','projectUrl','repositoryUrl'].includes(field)) throw Error('Unsupported field');
    return `UPDATE games SET payload_json=json_set(payload_json,'$.${field}',${literal(value)})${field==='projectUrl'?`,project_url=${literal(value)}`:''} WHERE id=${quote(change.id)} AND status='published' AND json_extract(payload_json,'$.${field}') IS ${literal(change.before[field])} AND NOT EXISTS(SELECT 1 FROM removals WHERE game_id=games.id);`;
  })).join('\n')+`\nUPDATE app_meta SET value_json=json_set(value_json,'$.generatedAt',${quote(report.checkedAt)}) WHERE key='catalog';\n`;
}
async function main() {
  const args=Object.fromEntries(process.argv.slice(2).reduce((out,arg,i,all)=>arg.startsWith('--')?[...out,[arg.slice(2),all[i+1]]]:out,[]));
  if(!args.games||!args.raw||!args.out||!args.metadata) throw Error('Use --games games.json --raw posts.json --metadata cache.json --out report-prefix [--fetch yes]');
  const games=JSON.parse(await readFile(args.games)),raw=JSON.parse(await readFile(args.raw));
  let metadata={}; try { metadata=JSON.parse(await readFile(args.metadata)); } catch {}
  if(args.fetch==='yes') {
    const preliminary=reviewNames(games,raw,metadata), patches=new Map(preliminary.changes.map(c=>[c.id,c.after]));
    const urls=[...new Set(games.filter(g=>g.reviewStatus==='source-described').map(g=>patches.get(g.id)?.projectUrl||g.projectUrl).filter(url=>url&&!repositoryUrl(url)))].filter(url=>!metadata[url]);
    let next=0,done=0;
    await Promise.all(Array.from({length:4},async()=>{
      while(next<urls.length) {
        const url=urls[next++], appId=steamAppId(url);
        try {
          const result=await readPublic(appId?`https://store.steampowered.com/api/appdetails?appids=${appId}&cc=us&l=english&filters=basic,price_overview,release_date`:url);
          metadata[url]=appId?{steam:normalizeSteam(JSON.parse(result.text),appId,Date.now()),checkedAt:new Date().toISOString()}:{title:pageName(result.text),finalUrl:result.url,checkedAt:new Date().toISOString()};
        } catch(error) { metadata[url]={error:error.message,checkedAt:new Date().toISOString()}; }
        done++; if(done%20===0){await writeFile(args.metadata,JSON.stringify(metadata,null,2)+'\n'); console.log(`Metadata checked ${done}/${urls.length}`);}
      }
    }));
    await writeFile(args.metadata,JSON.stringify(metadata,null,2)+'\n');
  }
  const report=reviewNames(games,raw,metadata);
  await writeFile(`${args.out}.json`,JSON.stringify(report,null,2)+'\n');
  await writeFile(`${args.out}.sql`,reviewSql(report));
  console.log(JSON.stringify({scanned:report.scanned,changed:report.changes.length,renamed:report.changes.filter(c=>c.after.title).length,unresolved:report.unresolved.length}));
}
if(process.argv[1] && import.meta.url===pathToFileURL(process.argv[1]).href) await main();
