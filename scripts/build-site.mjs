import { readFile, writeFile, mkdir, rm, cp, readdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { createHash } from 'node:crypto';
import { validateCatalog } from '../js/collection.js';
import { escHtml as e } from '../js/utils.js';
import { gamePageContent, gameDescription, gameStructuredData, previewUrl } from '../js/game-page-view.js';
import { projectPath } from '../js/project-url.js';
import { highlightPanels } from '../js/highlight-view.js';
import { collectInsightPages } from '../js/insight-snapshot.js';
import { buildWeeklyBrief, fetchPreviousInsights } from './weekly-brief.mjs';
import { weeklyBriefView } from '../js/weekly-brief-view.js';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const origin='https://playtrace.neorgon.com',api='https://playtrace-api.neorgon.workers.dev/api/v1';
const jsonScript=value=>JSON.stringify(value).replace(/</g,'\\u003c').replace(/\u2028/g,'\\u2028').replace(/\u2029/g,'\\u2029');
async function versionAssets(out){
  const hash=createHash('sha256');
  const files=[];
  for(const dir of ['js','css'])for(const file of (await readdir(path.join(out,dir))).sort()){
    if(!/\.(js|css)$/.test(file))continue;
    const name=path.join(out,dir,file),source=await readFile(name,'utf8');hash.update(dir+'/'+file+'\n'+source);files.push({name,source});
  }
  const version=hash.digest('hex').slice(0,12);
  for(const file of files)if(file.name.endsWith('.js'))await writeFile(file.name,file.source.replace(/((?:from\s*|import\s*)['"])(\.{1,2}\/[^'"?]+\.js)(['"])/g,`$1$2?v=${version}$3`));
  async function stamp(dir){
    for(const entry of await readdir(dir,{withFileTypes:true})){
      const file=path.join(dir,entry.name);
      if(entry.isDirectory())await stamp(file);
      else if(entry.name.endsWith('.html')){
        const html=await readFile(file,'utf8');
        await writeFile(file,html.replace(/\b(src|href)="((?:\/|\.\/)?(?:js|css)\/[^"?]+\.(?:js|css))"/g,`$1="$2?v=${version}"`));
      }
    }
  }
  await stamp(out);return version;
}
export function indexable(game){
  return game.title.length<=120 && game.summary.length>=40 && Boolean(game.reviewStatus==='reviewed'||game.steam||game.availability?.metadataVersion===2||
    (game.projectUrl&&game.title.length<=80&&game.posts.every(post=>post.title.toLowerCase()!==game.title.toLowerCase())));
}
export async function fetchCatalog(fetcher=fetch){
  const pages=[],ids=new Set(),cursors=new Set();let cursor='',revision,total;
  do{
    const response=await fetcher(`${api}/catalog?pageSize=200${cursor?`&cursor=${encodeURIComponent(cursor)}`:''}`,{signal:AbortSignal.timeout(30000),headers:{'User-Agent':'Playtrace static publisher','Accept':'application/json'}});
    if(!response.ok)throw new Error(`Catalogue returned HTTP ${response.status}; keeping the existing deployment.`);
    const value=validateCatalog(await response.json());
    if(revision&&revision!==value.generatedAt)throw new Error('Catalogue changed while publishing. Retry with a consistent snapshot.');
    revision=value.generatedAt;
    if(!value.pagination||!Number.isSafeInteger(value.pagination.total)||value.pagination.total<1||(total!==undefined&&total!==value.pagination.total))throw new Error('Incomplete catalogue snapshot.');
    total=value.pagination.total;
    for(const game of value.games){if(ids.has(game.id))throw new Error('Duplicate project in catalogue pages.');ids.add(game.id);}
    pages.push(value);cursor=value.pagination.nextCursor;
    if(cursor&&(typeof cursor!=='string'||cursors.has(cursor)||!value.games.length))throw new Error('Invalid catalogue pagination.');
    if(cursor)cursors.add(cursor);
    if(pages.length>100||ids.size>total)throw new Error('Catalogue exceeds publication bounds.');
  }while(cursor);
  if(ids.size!==total)throw new Error('Catalogue is missing projects.');
  const {pagination,...head}=pages[0];
  return {...head,games:pages.flatMap(page=>page.games),snapshotAt:new Date().toISOString()};
}
const metadata={
 'index.html':['Playtrace | Discover games made with AI','Discover games shared by the r/aigamedev community. Explore weekly highlights, follow development and help makers with feedback.'],
 'browse.html':['Browse community games | Playtrace','Find community games by genre, platform and maker. Explore demos, browser games and prototypes, save favorites and follow each project’s history.'],
 'about.html':['About Playtrace | Sources, feedback and privacy','How Playtrace collects community game showcases, credits their creators, checks store information and handles feedback and privacy.'],
 'research.html':['Quick game reviews | Playtrace','Share a short review of a community game, one question at a time. Help makers understand the controls, challenge, accessibility and player experience.'],
 'quiz.html':['Name that game | Playtrace','Recognize five community games from their screenshots and discover what to play next.'],
 'insights.html':['Community Insights | Playtrace','Explore game genres, art styles, platforms and AI model mentions through time, with linked sources, store release dates and transparent coverage.'],
};
export function metaPage(html,{title,description,url,image=origin+'/og-preview.jpg',schema=null,noindex=false}){
  html=html.replace(/<title>[\s\S]*?<\/title>/,`<title>${e(title)}</title>`)
    .replace(/<meta (?:name|property)="(?:description|og:title|og:description|og:url|og:image(?::[^" ]+)?|og:site_name|twitter:title|twitter:description|twitter:image|robots)"[^>]*>\s*/g,'')
    .replace(/<link rel="canonical"[^>]*>\s*/g,'').replace(/<script type="application\/ld\+json">[\s\S]*?<\/script>\s*/g,'');
  const tags=`<meta name="description" content="${e(description)}"><link rel="canonical" href="${e(url)}"><meta name="robots" content="${noindex?'noindex, follow':'index, follow'}"><meta property="og:site_name" content="Playtrace"><meta property="og:title" content="${e(title)}"><meta property="og:description" content="${e(description)}"><meta property="og:url" content="${e(url)}"><meta property="og:image" content="${e(image)}"><meta property="og:image:alt" content="${e(title)}"><meta name="twitter:title" content="${e(title)}"><meta name="twitter:description" content="${e(description)}"><meta name="twitter:image" content="${e(image)}">${schema?`<script type="application/ld+json">${jsonScript(schema)}</script>`:''}`;
  return html.replace('</head>',tags+'\n</head>');
}
export async function buildSite({catalog,highlights,insights,savedHistory,priorSnapshot,out=path.join(root,'_site')}={}){
  const checked=validateCatalog(catalog),snapshotAt=catalog.snapshotAt||catalog.generatedAt;
  if(!checked.games.length)throw new Error('Refusing to publish an empty collection.');
  if(insights&&(insights.generatedAt!==checked.generatedAt||insights.games.length!==checked.games.length||new Set(insights.games.map(game=>game.id)).size!==checked.games.length||insights.games.some(game=>!checked.games.some(item=>item.id===game.id))))throw new Error('Catalogue and insights must describe the same complete revision.');
  const weekly=insights?buildWeeklyBrief(insights,savedHistory,priorSnapshot):null;
  out=path.resolve(out);
  if(out===root||out===path.parse(out).root||root.startsWith(out+path.sep))throw new Error('Refusing an unsafe publication directory.');
  // Explicit allowlist: credentials, editorial reports and worker code never enter the artifact.
  await rm(out,{recursive:true,force:true});await mkdir(out,{recursive:true});
  for(const dir of ['css','js','assets'])await cp(path.join(root,dir),path.join(out,dir),{recursive:true,filter:source=>!source.endsWith('.md')});
  for(const file of await readdir(root))if(/\.(html|png|jpe?g|svg|ico|webmanifest)$/.test(file)||file==='robots.txt')await cp(path.join(root,file),path.join(out,file));
  await mkdir(path.join(out,'data'),{recursive:true});
  await writeFile(path.join(out,'data/public-catalog.json'),JSON.stringify({...checked,snapshotAt}));
  if(insights)await writeFile(path.join(out,'data/community-insights.json'),JSON.stringify(insights));
  if(weekly){
    await writeFile(path.join(out,'data/weekly-brief.json'),JSON.stringify(weekly.brief));
    await writeFile(path.join(out,'data/insight-history.json'),JSON.stringify(weekly.history));
    const page=await readFile(path.join(out,'insights.html'),'utf8');
    await writeFile(path.join(out,'insights.html'),page.replace('<!-- weekly-brief -->',weeklyBriefView(weekly.brief)));
  }
  for(const name of ['catalog.json','highlights.json'])await cp(path.join(root,'data',name),path.join(out,'data',name));
  const picks=highlights||JSON.parse(await readFile(path.join(root,'data/highlights.json'),'utf8'));
  const items=(picks.items||[]).map(item=>({...item,game:checked.games.find(game=>game.id===item.game.id)})).filter(item=>item.game);
  const editorGame=checked.games.find(game=>game.id===(picks.editorPick?.gameId||picks.editorPick?.game?.id));
  const editorPick=editorGame?{gameId:editorGame.id,game:editorGame}:null;
  if(items.length){
    const home=await readFile(path.join(out,'index.html'),'utf8');
    await writeFile(path.join(out,'index.html'),home.replace(/(<ol id="weeklyHighlights"[^>]*>)[\s\S]*?<\/ol>/,`$1${highlightPanels(items,editorPick)}</ol>`).replace('aria-busy="true"','aria-busy="false"').replace('>Community highlights</span>',`>Week of ${e(picks.week)}</span>`));
    await writeFile(path.join(out,'data/highlights.json'),JSON.stringify({...picks,items,editorPick}));
  }
  const browse=await readFile(path.join(root,'browse.html'),'utf8');
  const head=browse.slice(0,browse.indexOf('</head>')+7).replace(/\b(href|src)="(?!https?:|\/|#|data:)([^"]+)"/g,(_,attr,url)=>`${attr}="/${url.replace(/^\.\//,'')}"`);
  const header=browse.match(/<header class="header-bar"[\s\S]*?<\/header>/)[0].replace('<h1>Playtrace</h1>','<span class="header-site-name">Playtrace</span>').replace(/href="\.\/"/g,'href="/"').replace(/\b(href|src)="(?!https?:|\/|#|data:)([^"]+)"/g,'$1="/$2"');
  const feedback=browse.slice(browse.indexOf('    <section class="project-feedback"'),browse.indexOf('\n  </div>\n</dialog>',browse.indexOf('    <section class="project-feedback"'))).replace('class="project-feedback"','id="gameFeedback" class="project-feedback"').replace('href="research.html"','href="/research.html"');
  const footer='<footer class="neo-footer" data-footer-mode="minimal"><p class="neo-footer-note">Playtrace · <a href="/about.html">Sources &amp; privacy</a> · <a href="/games/">Game directory</a> · <a href="/admin.html">Admin</a></p></footer>';
  const shell=(main,data='')=>`${head.replace('</head>','<link rel="stylesheet" href="/css/game-page.css"></head>')}<body data-page="game"><a class="skip-link" href="#main">Skip to content</a>${header}<main id="main" class="game-page" tabindex="-1">${main}</main>${footer}<div id="app-toast" class="toast" role="status" aria-live="polite"></div>${data}<script type="module" src="/js/usage.js"></script></body></html>`;
  const urls=[{path:'/'},{path:'/browse.html'},{path:'/about.html'},{path:'/insights.html'}],manifest=[];
  const ordered=[...checked.games].sort((a,b)=>b.updatedAt.localeCompare(a.updatedAt)||a.id.localeCompare(b.id));
  for(const game of ordered){
    const route=projectPath(game),related=ordered.filter(other=>other.id!==game.id&&(other.author.name===game.author.name||(game.category!=='other'&&other.category===game.category))).slice(0,3);
    const relatedHtml=related.length?`<section class="game-page-related"><h2>Keep exploring</h2><ul>${related.map(other=>`<li><a href="${projectPath(other)}">${previewUrl(other)?`<img src="${e(previewUrl(other))}" alt="" width="480" height="270" loading="lazy" decoding="async" referrerpolicy="no-referrer">`:''}<strong>${e(other.title)}</strong><small>u/${e(other.author.name)}</small></a></li>`).join('')}</ul></section>`:'';
    const html=metaPage(shell(`<p id="gameFreshness" class="field__hint" role="status"></p><div id="gameContent">${gamePageContent(game,checked)}</div>${relatedHtml}${feedback}`,
      `<script type="application/json" id="gameData">${jsonScript({...checked,games:[game],snapshotAt})}</script><script type="module" src="/js/game-page.js"></script>`),
      {title:`${game.title} | Playtrace`,description:gameDescription(game),url:origin+route,image:previewUrl(game)||undefined,schema:gameStructuredData(game,checked),noindex:!indexable(game)});
    await mkdir(path.join(out,route),{recursive:true});await writeFile(path.join(out,route,'index.html'),html);
    if(indexable(game))urls.push({path:route});
    manifest.push({id:game.id,path:route,title:game.title,indexable:indexable(game)});
    for(const alias of game.aliases||[]){
      const oldRoute=projectPath(alias);
      const redirect=metaPage(`<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Project moved</title><meta http-equiv="refresh" content="5;url=${route}"><script type="module" src="/js/alias-redirect.js"></script></head><body><main><h1>Project history combined</h1><p>This showcase is part of <a id="canonicalProject" href="${route}">${e(game.title)}</a>. Opening the complete project history…</p></main></body></html>`,{title:`${game.title} | Playtrace`,description:'This showcase is now part of the complete project history.',url:origin+route,noindex:true});
      await mkdir(path.join(out,oldRoute),{recursive:true});await writeFile(path.join(out,oldRoute,'index.html'),redirect);
    }
  }
  const pageSize=75,totalPages=Math.ceil(ordered.length/pageSize);
  for(let page=0;page<totalPages;page++){
    const route=page?`/games/page-${page+1}/`:'/games/';
    const links=ordered.slice(page*pageSize,(page+1)*pageSize).map(game=>`<li><a href="${projectPath(game)}">${e(game.title)}</a><small>u/${e(game.author.name)} · ${e(game.stage)}${game.distribution?` · ${e(game.distribution.label)}`:''}</small></li>`).join('');
    const nav=Array.from({length:totalPages},(_,i)=>`<a href="${i?`/games/page-${i+1}/`:'/games/'}" ${i===page?'aria-current="page"':''}>${i+1}</a>`).join('');
    const html=metaPage(shell(`<h1>Community game directory</h1><p>${ordered.length} source-linked projects. <a href="/browse.html">Browse with filters ↗</a></p><ol class="directory-list">${links}</ol><nav class="directory-pagination" aria-label="Directory pages">${nav}</nav>`).replace('data-page="game"','data-page="directory"'),{title:`Game directory${page?` · Page ${page+1}`:''} | Playtrace`,description:'Explore the community’s games, with links to project pages, creators and original source posts.',url:origin+route});
    await mkdir(path.join(out,route),{recursive:true});await writeFile(path.join(out,route,'index.html'),html);urls.push({path:route});
  }
  for(const [file,[title,description]]of Object.entries(metadata)){
    const source=await readFile(path.join(out,file),'utf8');
    const html=metaPage(source,{title,description,url:origin+(file==='index.html'?'/':'/'+file),noindex:['research.html','quiz.html'].includes(file),schema:file==='index.html'?{'@context':'https://schema.org','@type':'WebSite',name:'Playtrace',url:origin+'/',description}:null});
    await writeFile(path.join(out,file),html);
  }
  const browseOut=await readFile(path.join(out,'browse.html'),'utf8');
  await writeFile(path.join(out,'browse.html'),browseOut.replace('<div class="collection-footer">','<div class="collection-footer"><a class="text-link" href="/games/">Game directory</a>'));
  // lastmod is omitted rather than pretending every fetch changes the content.
  await writeFile(path.join(out,'sitemap.xml'),`<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${urls.map(url=>`<url><loc>${e(origin+url.path)}</loc></url>`).join('')}</urlset>\n`);
  await writeFile(path.join(out,'data/page-manifest.json'),JSON.stringify({generatedAt:snapshotAt,games:manifest}));
  const assetVersion=await versionAssets(out);
  return {games:ordered.length,indexableGames:manifest.filter(game=>game.indexable).length,directoryPages:totalPages,sitemapUrls:urls.length,assetVersion,out};
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
  const arg=process.argv.indexOf('--catalog'),outArg=process.argv.indexOf('--out');
  const catalog=arg>=0?JSON.parse(await readFile(process.argv[arg+1],'utf8')):await fetchCatalog();
  let highlights,insights;
  if(arg<0){const response=await fetch(api+'/highlights',{signal:AbortSignal.timeout(30000)});if(!response.ok)throw new Error('Weekly highlights could not be read. Keeping the previous deployment.');highlights=await response.json();}
  const insightsArg=process.argv.indexOf('--insights');
  if(insightsArg>=0)insights=JSON.parse(await readFile(process.argv[insightsArg+1],'utf8'));
  else if(arg<0)insights=await collectInsightPages(async route=>{const response=await fetch(api+route,{signal:AbortSignal.timeout(30000),headers:{Accept:'application/json','User-Agent':'Playtrace public insights publisher'}});if(!response.ok)throw new Error('Public insights could not be read. Keeping the previous deployment.');return response.json();});
  const history=insights&&arg<0?await fetchPreviousInsights():{};
  console.log(JSON.stringify(await buildSite({catalog,highlights,insights,...history,...(outArg>=0?{out:path.resolve(process.argv[outArg+1])}:{})}),null,2));
}
