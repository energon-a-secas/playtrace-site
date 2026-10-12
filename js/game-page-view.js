import { escHtml as e } from './utils.js';
import { categoryLabel, dateLabel, label, sourceHeadline, sourceOnlySummary, money } from './collection.js';
import { icon, playLink, relatedSteamLink } from './icons.js';
import { verifiedSteamDemo } from './steam-demo.js';
import { projectPath } from './project-url.js';
import { linkCheckMarkup } from './link-check-view.js';

export const previewUrl = game => game.preview.posterUrl || (game.preview.kind === 'image' ? game.preview.url : null);
export function gameDescription(game) {
  const description = !sourceOnlySummary(game) && game.summary?.trim();
  return (description || `${game.title}, shared by u/${game.author.name}. Explore its screenshots, development history and player feedback on Playtrace.`).replace(/\s+/g,' ').slice(0,170);
}
export function gameStructuredData(game,catalog) {
  const url=`https://playtrace.neorgon.com${projectPath(game)}`,image=previewUrl(game);
  return {'@context':'https://schema.org','@graph':[
    {'@type':'WebPage','@id':url,url,name:`${game.title} | Playtrace`,description:gameDescription(game),mainEntity:{'@id':url+'#game'},breadcrumb:{'@id':url+'#breadcrumbs'}},
    {'@type':'VideoGame','@id':url+'#game',name:game.title,url,description:gameDescription(game),...(image?{image}:{}),
      ...(game.category!=='other'?{genre:categoryLabel(game.category,catalog)}:{}),...(game.platforms.length?{operatingSystem:game.platforms}:{}),
      ...(game.projectUrl?{sameAs:[game.projectUrl]}:{}),subjectOf:game.posts.map(post=>({'@type':'SocialMediaPosting',url:post.url,headline:post.title,datePublished:post.createdAt,author:{'@type':'Person',name:`u/${game.author.name}`,url:game.author.url}}))},
    {'@type':'BreadcrumbList','@id':url+'#breadcrumbs',itemListElement:[{'@type':'ListItem',position:1,name:'Playtrace',item:'https://playtrace.neorgon.com/'},{'@type':'ListItem',position:2,name:'Games',item:'https://playtrace.neorgon.com/games/'},{'@type':'ListItem',position:3,name:game.title,item:url}]}
  ]};
}
function storeFacts(game,catalog) {
  const steam=game.steam,itch=game.availability?.provider==='itch'&&game.availability.metadataVersion===2?game.availability:null;
  const facts=[['Genre',game.category==='other'?(steam?.genres||itch?.genres||[]).join(', '):categoryLabel(game.category,catalog)],['Runs on',game.platforms.join(', ')]];
  if(steam){
    facts.push(['Build',steam.type==='demo'?'Demo':steam.releaseKind==='early-access'?'Early Access':steam.state==='coming-soon'?verifiedSteamDemo(steam)?'Demo available · full game coming soon':'Coming soon':'Full game']);
    if(steam.type!=='demo'&&Date.now()-Date.parse(steam.checkedAt)<36*3600000&&steam.priceCents!==null)facts.push(['US store price',steam.isFree?'Free to play':`${money(steam.priceCents)} USD`]);
    if(steam.releaseDateLabel)facts.push([steam.state==='coming-soon'?'Expected release':'Store release',steam.releaseDateLabel]);
    facts.push(['Store checked',dateLabel(steam.checkedAt)]);
  }
  if(itch){
    for(const [name,key]of [['Made with','engines'],['Inputs','inputs'],['Languages','languages'],['AI disclosure','aiDisclosure']])facts.push([name,itch[key]?.join(', ')]);
    facts.push(['Creator status',itch.releaseStatus],['Listing checked',dateLabel(itch.storeCheckedAt)]);
  }
  return `<dl class="game-page-facts">${facts.filter(([,value])=>value).map(([name,value])=>`<div><dt>${e(name)}</dt><dd>${e(value)}</dd></div>`).join('')}</dl>${relatedSteamLink(steam)}`;
}
export function gamePageContent(game,catalog) {
  const image=previewUrl(game),latest=[...game.posts].sort((a,b)=>b.createdAt.localeCompare(a.createdAt))[0],headline=sourceHeadline(game);
  const assets=[...(game.steam?.screenshots||[]).map(url=>({url,source:game.steam.url,label:'Steam store'})),...(game.availability?.screenshots||[]).map(url=>({url,source:game.availability.sourceUrl,label:'itch.io listing'})),...game.posts.flatMap(post=>(post.assets||[]).filter(asset=>asset.kind==='image').map(asset=>({url:asset.url,source:post.url,label:'Original post'})))];
  const seen=new Set(),shots=assets.filter(asset=>asset.url!==image&&!seen.has(asset.url)&&seen.add(asset.url)).slice(0,8);
  return `<nav class="game-breadcrumb" aria-label="Breadcrumb"><a href="/browse.html">Browse games</a><span aria-hidden="true">/</span><span>${e(game.title)}</span></nav>
    <article class="game-page-record" aria-labelledby="gameTitle">
      ${image?`<div class="game-page-art"><img src="${e(image)}" alt="${e(game.preview.alt||game.title)}" width="1280" height="720" fetchpriority="high" decoding="async" referrerpolicy="no-referrer"></div>`:''}
      <div class="game-page-copy"><div class="game-page-meta"><a class="genre-chip" href="/browse.html?cat=${encodeURIComponent(game.category)}">${e(categoryLabel(game.category,catalog))}</a><span>${e(label(game.stage))}</span><nav class="game-page-shortcuts" aria-label="Project actions"><button class="project-icon favorite-star" id="pageFavorite" type="button" aria-pressed="false" aria-label="Save to favorites" title="Save to favorites">${icon('star')}</button><a class="project-icon brand-action" data-brand="reddit" href="${e(latest.url)}" target="_blank" rel="noopener noreferrer" aria-label="Latest Reddit post" title="Latest Reddit post">${icon('reddit')}</a><button class="project-icon" id="pageShare" type="button" title="Copy project link" aria-label="Copy project link"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="m10 14 4-4M8 16l-1 1a4 4 0 0 1-6-6l5-5a4 4 0 0 1 6 0m4 2 1-1a4 4 0 0 1 6 6l-5 5a4 4 0 0 1-6 0"/></svg></button><a class="project-icon" href="/browse.html?game=${game.id}&change=1" aria-label="Request a change" title="Request a change"><svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="9"/><path d="M12 7v6m0 3v.01"/></svg></a><a id="pageEdit" class="project-icon" href="/browse.html?game=${game.id}&edit=1" aria-label="Edit entry" title="Edit entry" hidden>${icon('edit')}</a></nav></div>
      <div class="game-page-heading"><div><h1 id="gameTitle">${e(game.title)}</h1>${headline?`<p class="project-headline">${e(headline)}</p>`:''}<p class="game-page-credit">Shared by <a href="/browse.html?author=${encodeURIComponent(game.author.name)}">u/${e(game.author.name)}</a> · <time datetime="${game.updatedAt}">${e(dateLabel(game.updatedAt))}</time></p></div><aside class="project-actions" aria-label="Game links and rating">${playLink(game)}<div id="ratingControl" class="rating-control"></div></aside></div>
      <p id="gameActionMessage" class="field__hint" role="status"></p>
      ${game.summary&&!sourceOnlySummary(game)?`<p class="game-page-description">${e(game.summary)}</p>`:''}
      ${game.availability?.status==='broken'?'<p class="link-health-note">The project link needs attention. Its source history is still available below.</p>':''}
      ${storeFacts(game,catalog)}
      <div id="pageLinkChecks">${linkCheckMarkup(game)}</div>
      ${game.repositoryUrl?`<p><a class="text-link" href="${e(game.repositoryUrl)}" target="_blank" rel="noopener noreferrer">${icon('github')} Source code ↗</a></p>`:''}
      ${shots.length?`<details class="game-page-gallery"><summary>Screenshots <span>${shots.length}</span></summary><ul class="media-gallery">${shots.map(shot=>`<li><a href="${e(shot.url)}" target="_blank" rel="noopener noreferrer"><img src="${e(shot.url)}" alt="Screenshot of ${e(game.title)}" loading="lazy" decoding="async" width="640" height="360" referrerpolicy="no-referrer"></a><a class="text-link" href="${e(shot.source)}" target="_blank" rel="noopener noreferrer">${e(shot.label)} ↗</a></li>`).join('')}</ul></details>`:''}
      <section class="game-page-history" aria-labelledby="gameHistoryTitle"><div class="feedback-heading"><h2 id="gameHistoryTitle">Project history</h2><span>${game.posts.length} source ${game.posts.length===1?'post':'posts'}</span></div><ol class="timeline">${game.posts.map(post=>`<li><div class="timeline__date"><time datetime="${post.createdAt}">${e(dateLabel(post.createdAt))}</time><span>${e(label(post.kind))}</span></div><h3><a href="${e(post.url)}" target="_blank" rel="noopener noreferrer">${e(post.title)} ↗</a></h3>${post.excerpt?`<p>${e(post.excerpt)}</p>`:''}</li>`).join('')}</ol></section>
      <section id="pageReview" class="published-review" hidden></section>
      <p class="game-page-provenance">A community listing with links to its sources. ${game.reviewStatus==='reviewed'?'Editorially reviewed.':'Source-described; details may need review.'} <a href="/about.html">About the index</a></p></div></article>`;
}
