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
  const links = [raw.url, ...(body.match(/https:\/\/[^\s<>"\[\]()]+/g) || []).slice(0, 30)];
  let repo = null;
  const playable = [];
  for (const [index, link] of links.entries()) {
    const candidate = canonicalProjectUrl(typeof link === 'string' ? link.replace(/&amp;/g,'&').replace(/[.,*`]+$/, '') : null);
    if (!candidate) continue;
    const position = body.indexOf(link), context = position >= 0 ? body.slice(Math.max(0, position - 160), position) : '';
    if(/\b(?:similar to my|including my|my (?:previous|other|older) game|my most recently released game)\b/i.test(context)
      && !/\b(?:play|try|download) (?:this|the new|my new) (?:game|build|demo)\b/i.test(context.slice(-70)))continue;
    if (repositoryUrl(candidate)) {
      if (!/\b(?:mcp|skills|prompts|framework|engine|game-kit|superpowers|data-oriented-design)\b/i.test(new URL(candidate).pathname)
        && !/\b(?:stumbled upon|heavy use of|used my|music generation|sponsoring)\b/i.test(context)
        && (index===0 || /\b(?:source|repo|repository|github|code|firmware|project|game)\b/i.test(context))) repo ||= candidate;
      continue;
    }
    const url = new URL(candidate);
    if (/(?:^|\.)(?:google\.com|wikipedia\.org|skool\.com|github\.com|gitlab\.com|codeberg\.org)$/.test(url.hostname) && url.hostname !== 'play.google.com') continue;
    const store = (url.hostname === 'store.steampowered.com' && /^\/app\/\d+(?:\/|$)/.test(url.pathname))
      || (url.hostname.endsWith('.itch.io') && url.pathname.length > 1) || ['play.google.com','apps.apple.com'].includes(url.hostname);
    const pages = url.hostname.endsWith('.github.io') || url.hostname.endsWith('.gitlab.io');
    const playContext = /\b(play|playable|try|demo|download)\b/i.test(context);
    if (store || pages || playContext || /\bgame\b/i.test(context)) playable.push({url:candidate,score:(store?30:pages?25:playContext?20:10)-index/100});
  }
  playable.sort((a,b)=>b.score-a.score);
  return {projectUrl:playable[0]?.url || repo, repositoryUrl:repo};
}
