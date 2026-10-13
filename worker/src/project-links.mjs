import { canonicalProjectUrl } from './validation.mjs';

export function repositoryUrl(value) {
  try {
    const url = new URL(value);
    return url.protocol === 'https:' && !url.username && !url.password && !url.port
      && ['github.com','gitlab.com','codeberg.org'].includes(url.hostname)
      && /^\/(?!sponsors\/|orgs\/|settings\/)[^/]+\/[^/]+\/?$/.test(url.pathname) ? url.href : null;
  } catch { return null; }
}
export function projectLinks(raw) {
  const body = typeof raw.selftext === 'string' ? raw.selftext.slice(0, 12000) : '';
  const laterGame = /\bthis is my (?:second|third|\d+(?:nd|rd|th)) game\b/i.test(body);
  const links = [raw.url, ...(body.match(/https?:\/\/[^\s<>"\[\]()*`]+/g) || []).slice(0, 30)];
  let repo = null;
  const playable = [];
  for (const [index, link] of links.entries()) {
    const candidate = canonicalProjectUrl(typeof link === 'string' ? link.replace(/^http:/,'https:').replace(/\\([_~])/g,'$1').replace(/&amp;/g,'&').replace(/[.,*`]+$/, '') : null);
    if (!candidate) continue;
    const position = body.indexOf(link), context = position >= 0 ? body.slice(Math.max(0, position - 160), position) : '';
    const paragraph = position >= 0 ? body.slice(Math.max(0, body.lastIndexOf('\n\n',position)),position) : '';
    if (/\b\d+ years? ago\b/i.test(paragraph) && /\b(?:first|old|previous)\b/i.test(paragraph)) continue;
    // A showcase of a later game may also promote the maker's first one.
    // Read the whole paragraph: the promotion can begin well before the URL.
    if (laterGame && /\bmy first(?: (?:upcoming|released))? game\b/i.test(paragraph)
      && !/\b(?:play|try|download) (?:this|the new|my new) (?:game|build|demo)\b/i.test(context.slice(-70))) continue;
    if(/\b(?:similar to my|including my|my (?:previous|other|older) game|my most recently released game)\b/i.test(context)
      && !/\b(?:play|try|download) (?:this|the new|my new) (?:game|build|demo)\b/i.test(context.slice(-70)))continue;
    if (repositoryUrl(candidate)) {
      if (!/\b(?:mcp|skills|prompts|framework|engine|game-kit|superpowers|data-oriented-design)\b/i.test(new URL(candidate).pathname)
        && !/\b(?:stumbled upon|heavy use of|used my|music generation|sponsoring)\b/i.test(context)
        && (index===0 || /\b(?:source|repo|repository|github|code|firmware|project|game)\b/i.test(context))) repo ||= candidate;
      continue;
    }
    const url = new URL(candidate);
    // Store pages can also be asset tools. Keep development references out of
    // the play action, even when they precede the actual game destination.
    if (/^(?:support|docs|developers)\./i.test(url.hostname)
      || /\/(?:making-of|docs|documentation|support)(?:\/|$)/i.test(url.pathname)
      || /\b(?:third.party tools?|assets? used|resources? used)\b/i.test(paragraph)
      || /\b(?:pixel-planet-generator|space-background-generator)\b/i.test(url.pathname)) continue;
    if (/(?:^|\.)(?:google\.com|wikipedia\.org|skool\.com|github\.com|gitlab\.com|codeberg\.org)$/.test(url.hostname) && url.hostname !== 'play.google.com') continue;
    const store = (url.hostname === 'store.steampowered.com' && /^\/app\/\d+(?:\/|$)/.test(url.pathname))
      || (url.hostname.endsWith('.itch.io') && url.pathname.length > 1) || ['play.google.com','apps.apple.com'].includes(url.hostname);
    const pages = url.hostname.endsWith('.github.io') || url.hostname.endsWith('.gitlab.io');
    const localContext = paragraph.slice(-160);
    const after = position >= 0 ? body.slice(position + link.length, position + link.length + 160) : '';
    const playContext = /\b(play|playable|try|demo|download)\b/i.test(context)
      || /\bcheck (?:it|the game) out here\b/i.test(context)
      || /\b(?:runs? in (?:the|your) browser|free to play)\b/i.test(after);
    // An explicit play link is stronger than a store-shaped URL elsewhere in
    // the post: itch.io also hosts assets, tutorials and development tools.
    const latestBuild = /\b(?:latest|current) (?:version|build) (?:of (?:the|my|our) game )?(?:is )?here\b/i.test(localContext);
    const directPlay = /\b(?:play|try|download)\b/i.test(localContext.replace(/\bno downloads?\b/gi,'')) || /\b(?:runs? in (?:the|your) browser|free to play)\b/i.test(after.split(/\n\s*\n/)[0]);
    if (store || pages || playContext || /\bgame\b/i.test(context)) playable.push({url:candidate,score:(latestBuild?80:directPlay?40:0)+(store?30:pages?25:playContext?20:10)-index/100});
  }
  playable.sort((a,b)=>b.score-a.score);
  return {projectUrl:playable[0]?.url || repo, repositoryUrl:repo};
}
