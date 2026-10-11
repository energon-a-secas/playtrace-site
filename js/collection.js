import { updateQuery } from './neorgon-navigation.js';
import { DEFAULT_CATEGORIES, validCategoryId, validateCategories } from './categories.js';

export const categories = DEFAULT_CATEGORIES.map(category=>category.id);
export const categoryChoices = catalog => catalog?.categories || DEFAULT_CATEGORIES;
export const categoryLabel = (id, catalog) => categoryChoices(catalog).find(category=>category.id===id)?.label || id.replaceAll('-', ' ');
export const stages = ['concept', 'prototype', 'playable', 'released', 'unknown'];
// Distribution describes the linked destination, separately from devices and release stage.
export const projectPlatforms = Object.freeze([
  { id: 'itch', label: 'itch.io', kind: 'store' },
  { id: 'steam', label: 'Steam', kind: 'store' },
  { id: 'google-play', label: 'Google Play', kind: 'store' },
  { id: 'app-store', label: 'App Store', kind: 'store' },
  { id: 'testflight', label: 'TestFlight', kind: 'beta' },
  { id: 'game-jolt', label: 'Game Jolt', kind: 'store' },
  { id: 'newgrounds', label: 'Newgrounds', kind: 'portal' },
  { id: 'crazygames', label: 'CrazyGames', kind: 'portal' },
  { id: 'poki', label: 'Poki', kind: 'portal' },
  { id: 'roblox', label: 'Roblox', kind: 'portal' },
  { id: 'github', label: 'GitHub', kind: 'repository' },
  { id: 'gitlab', label: 'GitLab', kind: 'repository' },
  { id: 'codeberg', label: 'Codeberg', kind: 'repository' },
  { id: 'website', label: 'Other websites', kind: 'website' },
  { id: 'unlisted', label: 'No project link', kind: 'unlisted' },
]);
export const defaults = Object.freeze({ query: '', category: 'all', platform: 'all', stage: 'all', author: '', following: false, sort: 'newest', view: 'grid', game: '' });
export const label = value => value === 'rpg' ? 'RPG' : value === 'unknown' ? 'Unspecified' : value.charAt(0).toUpperCase() + value.slice(1);
export const dateLabel = value => new Date(value).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' });
export const money = cents => new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: cents % 100 ? 2 : 0 }).format(cents / 100);

export function safeUrl(value, optional = false) {
  if (optional && value === null) return null;
  if (typeof value !== 'string' || value.length > 2048) throw new Error('Invalid source URL');
  const url = new URL(value);
  if (url.protocol !== 'https:' || url.username || url.password) throw new Error('Invalid source URL');
  return url.href;
}
export function distributionFor(projectUrl) {
  if (!projectUrl) return null;
  const url = new URL(safeUrl(projectUrl)), host = url.hostname;
  let id = 'website';
  if (!url.port) {
    if (host === 'itch.io' || host.endsWith('.itch.io')) id = 'itch';
    else if (host === 'store.steampowered.com' && /^\/app\/[1-9]\d*(?:\/|$)/.test(url.pathname)) id = 'steam';
    else if (host === 'play.google.com' && url.pathname === '/store/apps/details') id = 'google-play';
    else if (host === 'apps.apple.com') id = 'app-store';
    else if (host === 'testflight.apple.com') id = 'testflight';
    else if (['gamejolt.com', 'www.gamejolt.com'].includes(host)) id = 'game-jolt';
    else if (['newgrounds.com', 'www.newgrounds.com'].includes(host)) id = 'newgrounds';
    else if (['crazygames.com', 'www.crazygames.com'].includes(host)) id = 'crazygames';
    else if (['poki.com', 'www.poki.com'].includes(host)) id = 'poki';
    else if (['roblox.com', 'www.roblox.com'].includes(host)) id = 'roblox';
    else if (['github.com', 'gitlab.com', 'codeberg.org'].includes(host) && /^\/[^/]+\/[^/]+/.test(url.pathname)) {
      id = host === 'codeberg.org' ? 'codeberg' : host.split('.')[0];
    }
  }
  const platform = projectPlatforms.find(entry => entry.id === id);
  return { ...platform, label: id === 'website' ? 'Project website' : platform.label, url: url.href };
}
function text(value, max, empty = false) {
  if (typeof value !== 'string' || value.length > max || (!empty && !value.trim())) throw new Error('Invalid catalogue text');
}
function date(value, nullable = false) {
  if (nullable && value === null) return;
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}T.*Z$/.test(value) || !Number.isFinite(Date.parse(value))) throw new Error('Invalid source date');
}
function redditPost(url, id) {
  const value = new URL(safeUrl(url));
  if (value.hostname !== 'www.reddit.com' || value.port || value.search || value.hash
    || !new RegExp(`^/r/aigamedev/comments/${id}/(?:[^/]+/)?$`, 'i').test(value.pathname)) throw new Error('Invalid Reddit source');
  return value.href;
}
export function validateSteam(steam, projectUrl) {
  if (!steam || !/^[1-9]\d{0,9}$/.test(steam.appId) || steam.url !== `https://store.steampowered.com/app/${steam.appId}/`
    || !['released', 'coming-soon', 'listed'].includes(steam.state) || typeof steam.isFree !== 'boolean') throw new Error('Invalid store details');
  const project = new URL(safeUrl(projectUrl));
  if (project.hostname !== 'store.steampowered.com' || !new RegExp(`^/app/${steam.appId}(?:/|$)`).test(project.pathname)) throw new Error('Mismatched store listing');
  if (steam.type !== undefined && !['game','demo'].includes(steam.type)) throw new Error('Invalid store type');
  text(steam.title, 300); date(steam.checkedAt);
  for (const amount of [steam.priceCents, steam.originalPriceCents]) {
    if (amount !== null && (!Number.isInteger(amount) || amount < 0 || amount > 1000000)) throw new Error('Invalid store price');
  }
  if ((steam.priceCents === null ? steam.currency !== null : steam.currency !== 'USD') || (steam.state !== 'released' && steam.priceCents !== null)) throw new Error('Invalid store price');
  if (steam.headerUrl !== null) {
    const url = new URL(safeUrl(steam.headerUrl));
    if (!['shared.akamai.steamstatic.com', 'shared.fastly.steamstatic.com', 'cdn.akamai.steamstatic.com', 'cdn.cloudflare.steamstatic.com'].includes(url.hostname) || url.port) throw new Error('Invalid store image');
  }
  return steam;
}
export function validateAssets(assets) {
  if (!Array.isArray(assets) || assets.length > 6) throw new Error('Invalid project media');
  for (const asset of assets) {
    if (!['image', 'video', 'gif'].includes(asset?.kind)) throw new Error('Invalid project media');
    const url = new URL(safeUrl(asset.url));
    const hosts = asset.kind === 'video' ? ['v.redd.it', 'preview.redd.it', 'i.redd.it'] : ['i.redd.it', 'preview.redd.it', 'external-preview.redd.it', 'a.thumbs.redditmedia.com', 'b.thumbs.redditmedia.com'];
    if (!hosts.includes(url.hostname) || url.port) throw new Error('Invalid media host');
    if (asset.posterUrl !== null) {
      const poster = new URL(safeUrl(asset.posterUrl));
      if (!['i.redd.it', 'preview.redd.it', 'external-preview.redd.it', 'a.thumbs.redditmedia.com', 'b.thumbs.redditmedia.com'].includes(poster.hostname) || poster.port) throw new Error('Invalid poster host');
    }
  }
}
export function validateCatalog(value) {
  if (value?.schemaVersion !== 1 || !Array.isArray(value.games) || value.source?.subreddit !== 'aigamedev') throw new Error('Invalid catalogue');
  const source = value.source;
  const categoryOptions = validateCategories(value.categories);
  if (safeUrl(source.subredditUrl) !== 'https://www.reddit.com/r/aigamedev/') throw new Error('Invalid source community');
  safeUrl(source.archiveUrl, true);
  date(source.retrievedAt); date(source.coverageThrough, true); date(source.lastSuccessfulIngestAt, true); date(value.generatedAt);
  if (!['manual-snapshot', 'scheduled'].includes(source.mode)) throw new Error('Invalid archive mode');
  const gameIds = new Set(), postIds = new Set();
  const games = value.games.map(game => {
    if (!/^g_[a-z0-9]{5,12}$/.test(game.id) || gameIds.has(game.id)) throw new Error('Duplicate or invalid game');
    gameIds.add(game.id);
    text(game.title, 160); text(game.summary, 600); text(game.author?.name, 80); safeUrl(game.author?.url);
    if (!/^[A-Za-z0-9_-]{3,32}$/.test(game.author.name)
      || game.author.url.toLowerCase() !== `https://www.reddit.com/user/${game.author.name.toLowerCase()}/`) throw new Error('Invalid source author');
    if (!categoryOptions.some(category=>category.id===game.category) || !stages.includes(game.stage)) throw new Error('Invalid game category');
    if (!Array.isArray(game.tags) || game.tags.length > 12 || !Array.isArray(game.platforms) || game.platforms.length > 8) throw new Error('Invalid game tags');
    game.tags.forEach(tag => text(tag, 40)); game.platforms.forEach(platform => text(platform, 80));
    safeUrl(game.projectUrl, true);
    if (game.repositoryUrl != null) { const repo=new URL(safeUrl(game.repositoryUrl)); if(repo.port || !['github.com','gitlab.com','codeberg.org'].includes(repo.hostname) || !/^\/[^/]+\/[^/]+\/?$/.test(repo.pathname)) throw new Error('Invalid repository URL'); } date(game.firstSeenAt); date(game.updatedAt);
    if (game.steam != null) validateSteam(game.steam, game.projectUrl);
    const preview = game.preview;
    if (!preview || !['image', 'video', 'link'].includes(preview.kind) || !['external', 'r2'].includes(preview.storage)
      || !['source-linked', 'owner-consent'].includes(preview.rights)) throw new Error('Invalid preview');
    safeUrl(preview.url, true); safeUrl(preview.posterUrl, true); safeUrl(preview.sourceUrl); text(preview.alt, 600, true);
    if (!Array.isArray(game.posts) || !game.posts.length) throw new Error('Missing provenance');
    game.posts.forEach(post => {
      if (typeof post.id !== 'string' || !/^[a-z0-9]{5,12}$/.test(post.id) || postIds.has(post.id)) throw new Error('Duplicate or invalid source post');
      postIds.add(post.id); redditPost(post.url, post.id); text(post.title, 400); text(post.author, 80); date(post.createdAt); text(post.excerpt, 600, true);
      if (post.author.toLowerCase() !== game.author.name.toLowerCase()) throw new Error('Mismatched source author');
      if (!['showcase', 'update', 'release'].includes(post.kind)) throw new Error('Invalid source kind');
      if (post.assets !== undefined) validateAssets(post.assets);
    });
    const dates = game.posts.map(post => post.createdAt).sort();
    if (Date.parse(game.firstSeenAt) !== Date.parse(dates[0]) || Date.parse(game.updatedAt) !== Date.parse(dates.at(-1))) throw new Error('Mismatched project dates');
    if (!game.posts.some(post => post.url === preview.sourceUrl)) throw new Error('Preview source is outside the project timeline');
    if (game.reviewStatus != null && !['reviewed', 'source-described'].includes(game.reviewStatus)) throw new Error('Invalid review status');
    return { ...game, distribution: distributionFor(game.projectUrl), reviewStatus: game.reviewStatus || 'reviewed', posts: [...game.posts].sort((a, b) => b.createdAt.localeCompare(a.createdAt)) };
  });
  return { ...value, categories: categoryOptions, games };
}
export function readLocation(url, preferredView = 'grid') {
  const p = new URL(url).searchParams;
  return { query: (p.get('q') || '').slice(0, 200), category: validCategoryId(p.get('cat')) ? p.get('cat') : 'all',
    platform: projectPlatforms.some(entry => entry.id === p.get('platform')) ? p.get('platform') : 'all',
    stage: stages.includes(p.get('stage')) ? p.get('stage') : 'all', author: (p.get('author') || '').slice(0, 80),
    following: p.get('following') === '1', sort: ['newest', 'oldest', 'name', 'updates'].includes(p.get('sort')) ? p.get('sort') : 'newest',
    view: ['grid', 'list'].includes(p.get('view')) ? p.get('view') : preferredView,
    game: /^g_[a-z0-9]{5,12}$/.test(p.get('game') || '') ? p.get('game') : '' };
}
export function locationForState(url, state) {
  return updateQuery(url, { q: state.query.trim(), cat: state.category === 'all' ? '' : state.category,
    platform: !state.platform || state.platform === 'all' ? '' : state.platform,
    stage: state.stage === 'all' ? '' : state.stage, author: state.author, following: state.following ? '1' : '',
    sort: state.sort === 'newest' ? '' : state.sort, view: state.view, game: state.game });
}
export function selectGames(games, state) {
  const query = state.query.trim().toLocaleLowerCase();
  const result = games.filter(game => (state.category === 'all' || game.category === state.category)
    && (!state.platform || state.platform === 'all' || (game.distribution?.id || 'unlisted') === state.platform)
    && (state.stage === 'all' || game.stage === state.stage)
    && (!state.author || game.author.name.toLowerCase() === state.author.toLowerCase())
    && (!state.following || state.follows.includes(game.id))
    && [game.title, game.summary, game.author.name, game.category, categoryLabel(game.category, state.catalog), game.distribution?.label || '', ...game.tags, ...game.platforms].join(' ').toLocaleLowerCase().includes(query));
  if (state.sort === 'name') result.sort((a, b) => a.title.localeCompare(b.title));
  else if (state.sort === 'updates') result.sort((a, b) => b.posts.length - a.posts.length || b.updatedAt.localeCompare(a.updatedAt));
  else result.sort((a, b) => state.sort === 'oldest' ? a.firstSeenAt.localeCompare(b.firstSeenAt) : b.updatedAt.localeCompare(a.updatedAt));
  return result;
}
export function collectionPulse(games) {
  return { games: games.length, authors: new Set(games.map(game => game.author.name.toLowerCase())).size,
    playable: games.filter(game => ['playable', 'released'].includes(game.stage)).length,
    posts: games.reduce((sum, game) => sum + game.posts.length, 0) };
}
export function parsePrice(value) {
  if (!/^(?:\d{1,3})(?:\.\d{1,2})?$/.test(String(value).trim())) return null;
  const cents = Math.round(Number(value) * 100);
  return Number.isInteger(cents) && cents >= 0 && cents <= 10000 ? cents : null;
}

export function sourceHeadline(game) {
  const post = game.posts.find(post => `g_${post.id}` === game.id) || game.posts[0];
  return post && post.title.toLocaleLowerCase() !== game.title.toLocaleLowerCase() ? post.title : '';
}
export const sourceOnlySummary = game => game.summary.startsWith(`Source post by u/${game.author.name}: `);
