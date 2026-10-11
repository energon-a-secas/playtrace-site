// Evidence-based names. Unknown titles stay as source headlines for review.
const generic = /^(?:index|home|play|demo|game|games|app|test|about|download|downloads|untitled|prototype|my game|new game|update|devlog|gameplay|introduction|welcome|click here|read more|localhost|examples?|mods|assets|log|timeline|title|me|experiment)$/i;
const sentence = /\b(?:i|i'm|i’m|i've|i’ve|my|our|we|we're|we’re|built|made|making|created|creating|working|using|used|feedback|vibecoded|vibe.coded|first|released|launched|check out|looking for|what do you|how to)\b/i;
const fold = value => value.toLowerCase().replace(/[^\p{L}\p{N}]/gu, '');
const sourceText = value => value.replace(/https?:\/\/\S+/g, '');
const inSource = (name, prose) => new RegExp(`(?:^|[^\\p{L}\\p{N}])${fold(name).split('').join('[\\s_-]*')}(?:$|[^\\p{L}\\p{N}])`, 'iu').test(prose);
export function cleanName(value) {
  if (typeof value !== 'string') return null;
  const title = value.replace(/[*`]/g, '').replace(/\s+/g, ' ').replace(/^["“”\s]+|["“”\s]+$/g, '').trim();
  if (title.length < 2 || title.length > 100 || title.split(' ').length > 12 || /[<>\x00-\x1f\x7f]|https?:\/\//i.test(title)
    || generic.test(title) || /^(?:404|403|500|access denied|just a moment|sign in|login|page not found|error|attention required)\b/i.test(title)) return null;
  return title;
}
export function steamAppId(value) {
  try {
    const url = new URL(value);
    return url.protocol === 'https:' && url.hostname === 'store.steampowered.com' && !url.port && !url.username && !url.password
      ? /^\/app\/([1-9]\d{0,9})(?:\/|$)/.exec(url.pathname)?.[1] || null : null;
  } catch { return null; }
}
export function explicitName(title, body = '') {
  const candidates = [
    /\b(?:game (?:is )?(?:called|named)|game['’]s name is)\s+["“']([^"”'\n]{2,100})["”']/i.exec(`${title}\n${body}`)?.[1],
    /\b(?:my|our) (?:\w+ ){0,3}game\s+["“]([^"”\n]{2,100})["”]/i.exec(`${title}\n${body}`)?.[1],
    /^(?:introducing)\s+(.+?)(?:\s+[—–-]\s+|:|,|!|$)/i.exec(title)?.[1],
    /^(?:I|We) (?:made|built|created)\s+([A-Z][^.!?\n]{1,80}?)(?:\s+[—–-]\s+|,\s+(?:a|an|the)\b)/.exec(title)?.[1],
    /^(.{2,80}?)(?:\s+[—–-]\s+|:\s+|,\s+(?:a|an|the)\s+)/.exec(title)?.[1],
    /^(.{2,80}?)\s*\((?:my|our|a|an|free|demo|wip|early)\b/i.exec(title)?.[1],
  ];
  for (const value of candidates) {
    const name = cleanName(value);
    if (name && !sentence.test(name) && !/\b(?:hours?|days?|weeks?|months?|years?|devlog|progress|workflow|prompt|update|prototype|sandbox|inspired|embedding|testing|optimization|playtesters|needed|deterministic|mechanics|generation|style|opus|creative|iteration|beta testing|this is|trailer|postmortem|launch|gameplay|finished|meet|AI tools?)\b/i.test(name)
      && !/\s-\s[A-Z]\s-\s/.test(title)) return name;
  }
  return null;
}
function slugName(value) {
  let slug; try { slug = decodeURIComponent(value).replace(/\.html?$/i, ''); } catch { return null; }
  if (/^[\da-f]{8,}$/i.test(slug) || /^[\da-f]{8}-[\da-f-]{20,}$/i.test(slug) || !/[a-z]/i.test(slug) || /\d{5}|-[\da-f]{8,}$/i.test(slug) || /\.(?!html?$)/i.test(slug)) return null;
  const title = slug.replace(/([a-z])([A-Z])/g, '$1 $2').replace(/[_-]+/g, ' ');
  if (sentence.test(title)) return null;
  return cleanName(title.replace(/\b[a-z]/g, c => c.toUpperCase()));
}
export function urlName(value) {
  let url; try { url = new URL(value); } catch { return null; }
  if (url.protocol !== 'https:' || url.username || url.password || url.port) return null;
  const host = url.hostname, parts = url.pathname.split('/').filter(Boolean);
  let slug, method;
  if (steamAppId(value)) { slug = parts[2]; method = 'steam-url'; }
  else if (host.endsWith('.itch.io') && parts.length === 1) { slug = parts[0]; method = 'itch-url'; }
  else if (/^(?:www\.)?(?:github\.com|gitlab\.com|codeberg\.org|wikipedia\.org|google\.com|youtube\.com|reddit\.com)$/.test(host)
    || /(?:^|\.)(?:google\.com|wikipedia\.org|rosebud\.ai|pixelfork\.ai|claude\.ai|chatgpt\.com|skool\.com|glitch\.fun|huggingface\.co)$/.test(host)) return null;
  else if (host === 'apps.apple.com') { slug = parts[parts.indexOf('app') + 1]; method = 'store-url'; }
  else if (parts.length && parts.length <= 3 && !parts.some(p => /^(?:blog|posts?|articles?|devlog|docs|\d{4})$/i.test(p))) {
    slug = [...parts].reverse().find(p => !generic.test(p) && !/^(?:en|us|en-us)$/i.test(p)); method = 'project-path';
    // A path ending in an opaque identifier is not a name.
    if (!slugName(slug || '')) return null;
  } else if (parts.length) return null;
  if (!slug) {
    const hosted = /\.(?:github\.io|gitlab\.io|pages\.dev|vercel\.app|netlify\.app|onrender\.com|fly\.dev|itch\.io)$/.exec(host);
    slug = hosted ? host.slice(0, hosted.index) : host.replace(/^(?:www|play|game|demo|demos)\./, '').split('.')[0];
    method = 'project-domain';
  }
  const title = slugName(slug || '');
  return title ? {title, method, url: url.href} : null;
}
export function inferName({title, body = '', projectUrl, steamTitle, pageTitle}) {
  const steam = steamAppId(projectUrl) && cleanName(steamTitle);
  if (steam) return {title: steam, method: 'steam-metadata', url: projectUrl};
  const explicit = explicitName(title, body), linked = urlName(projectUrl);
  const metadata = cleanName(pageTitle);
  const prose = sourceText(`${title} ${body}`);
  // Website metadata must agree with its URL or an explicit name in the post.
  const matches = name => name && fold(name).length >= 4 && (fold(metadata || '').includes(fold(name)) || fold(name).includes(fold(metadata || '')));
  const platform = /^(?:pixelfork|colyseus|legends ?of ?learning|cartridge\.cafe|wingedsheep|bash|react app|vite app|workshop)$/i;
  if (metadata && !sentence.test(metadata) && !platform.test(metadata) && !/\b(framework|game engine|game development|game tools|asset pack)\b/i.test(metadata)
    && !/example browser/i.test(metadata) && (matches(linked?.title) || matches(explicit))) return {title: metadata, method: 'page-metadata', url: projectUrl};
  if (explicit) return {title: explicit, method: 'source-name', url: null};
  if (linked && ['steam-url','itch-url','store-url'].includes(linked.method)) return linked;
  // Generic hosted paths/domains need corroboration in the source text.
  if (linked && fold(linked.title).length>=6 && !platform.test(linked.title) && inSource(linked.title, prose)
    && !/\?\s*$/.test(title) && !(title.length<40 && fold(title).startsWith(fold(linked.title)))
    && !/\bnot the creator of\b/i.test(body)) return linked;
  return null;
}
export function nameForGame(game, evidence = {}) {
  if (game.reviewStatus !== 'source-described') return null;
  const source = game.posts.find(post => `g_${post.id}` === game.id) || game.posts[0];
  const previous = inferName({title: source.title, projectUrl: game.projectUrl});
  if (game.title !== source.title && game.title !== previous?.title) return null;
  return inferName({title: source.title, projectUrl: game.projectUrl, ...evidence});
}
