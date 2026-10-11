import { exactKeys, invalid } from './http.mjs';
import { validateAssets } from './assets.mjs';

export const GAME_ID = /^g_[a-z0-9]{5,12}$/;
export const POST_ID = /^[a-z0-9]{5,12}$/;
export const AUTHOR = /^[A-Za-z0-9_-]{3,32}$/;
const CATEGORIES = ['action', 'adventure', 'puzzle', 'strategy', 'rpg', 'simulation', 'arcade', 'other'];
const STAGES = ['concept', 'prototype', 'playable', 'released', 'unknown'];
export function text(value, max, min = 1) {
  if (typeof value !== 'string' || value.trim().length < min || value.length > max || /[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]/.test(value)) throw invalid();
  return value;
}
export function iso(value, nullable = false) {
  if (nullable && value === null) return value;
  if (typeof value !== 'string' || !/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(?:\.\d{3})?Z$/.test(value) || !Number.isFinite(Date.parse(value))) throw invalid();
  if (new Date(value).toISOString().replace('.000Z', 'Z') !== value.replace('.000Z', 'Z')) throw invalid();
  return value;
}
export function httpsUrl(value, nullable = false) {
  if (nullable && value === null) return null;
  text(value, 2048);
  let url;
  try { url = new URL(value); } catch { throw invalid('A valid HTTPS URL is required.'); }
  if (url.protocol !== 'https:' || url.username || url.password || /[\s\\]/.test(value)) throw invalid('A valid HTTPS URL is required.');
  return value;
}
export const sourceUrl = id => `https://www.reddit.com/r/aigamedev/comments/${id}/`;
export function canonicalProjectUrl(value) {
  try {
    const url = new URL(httpsUrl(value));
    if (/(^|\.)(reddit\.com|redd\.it|youtube\.com|youtu\.be|discord\.gg|discord\.com|imgur\.com|giphy\.com|x\.com|twitter\.com)$/.test(url.hostname)) return null;
    if (/\.(png|jpg|jpeg|gif|webp|mp4|webm|svg)$/i.test(url.pathname)) return null;
    url.hash = '';
    for (const key of [...url.searchParams.keys()]) if (/^(utm_|ref$|source$|fbclid$|gclid$)/i.test(key)) url.searchParams.delete(key);
    url.searchParams.sort();
    if (url.pathname !== '/') url.pathname = url.pathname.replace(/\/+$/, '');
    return url.href;
  } catch { return null; }
}
function stringList(value, maxItems, maxLength) {
  if (!Array.isArray(value) || value.length > maxItems || new Set(value).size !== value.length) throw invalid();
  value.forEach(item => text(item, maxLength));
}
export function validatePost(post, author) {
  exactKeys(post, ['id', 'url', 'title', 'author', 'createdAt', 'kind', 'excerpt', ...(Object.hasOwn(post || {}, 'assets') ? ['assets'] : []), ...(Object.hasOwn(post || {}, 'flair') ? ['flair'] : [])]);
  if (post.flair !== undefined) text(post.flair, 100);
  if (post.assets !== undefined) validateAssets(post.assets);
  if (typeof post.id !== 'string' || typeof post.author !== 'string' || !POST_ID.test(post.id) || !AUTHOR.test(post.author) || post.author.toLowerCase() !== author.toLowerCase()) throw invalid();
  if (post.url !== sourceUrl(post.id)) throw invalid('Source posts must use their canonical Reddit URL.');
  text(post.title, 300); text(post.excerpt, 600, 0); iso(post.createdAt);
  if (!['showcase', 'update', 'release'].includes(post.kind)) throw invalid();
}
export function validateGame(game) {
  const required = ['id', 'title', 'summary', 'author', 'category', 'tags', 'stage', 'platforms', 'projectUrl', 'firstSeenAt', 'updatedAt', 'preview', 'posts'];
  exactKeys(game, Object.hasOwn(game || {}, 'reviewStatus') ? [...required, 'reviewStatus'] : required);
  if (game.reviewStatus !== undefined && !['reviewed', 'source-described'].includes(game.reviewStatus)) throw invalid();
  if (typeof game.id !== 'string' || !GAME_ID.test(game.id)) throw invalid();
  text(game.title, 160); text(game.summary, 600);
  exactKeys(game.author, ['name', 'url']);
  if (typeof game.author.name !== 'string' || !AUTHOR.test(game.author.name) || game.author.name.toLowerCase() === 'automoderator' ||
    game.author.url !== `https://www.reddit.com/user/${game.author.name}/`) throw invalid();
  if (!CATEGORIES.includes(game.category) || !STAGES.includes(game.stage)) throw invalid();
  stringList(game.tags, 12, 40); stringList(game.platforms, 8, 40);
  httpsUrl(game.projectUrl, true); iso(game.firstSeenAt); iso(game.updatedAt);
  if (!Array.isArray(game.posts) || game.posts.length < 1 || game.posts.length > 1000) throw invalid();
  game.posts.forEach(post => validatePost(post, game.author.name));
  const ordered = [...game.posts].sort((a, b) => Date.parse(a.createdAt) - Date.parse(b.createdAt) || a.id.localeCompare(b.id));
  // The source post that first established this ID remains its anchor. Older
  // matching posts can extend the timeline without breaking links or feedback.
  if (!game.posts.some(post => game.id === `g_${post.id}`) || Date.parse(game.firstSeenAt) !== Date.parse(ordered[0].createdAt) ||
    Date.parse(game.updatedAt) !== Date.parse(ordered.at(-1).createdAt)) throw invalid('Game dates and identity must match their source timeline.');
  exactKeys(game.preview, ['kind', 'url', 'posterUrl', 'alt', 'storage', 'rights', 'sourceUrl']);
  const preview = game.preview;
  if (!['image', 'video', 'link'].includes(preview.kind) || !['external', 'r2'].includes(preview.storage) ||
    !['source-linked', 'owner-consent'].includes(preview.rights) ||
    (preview.storage === 'r2' && preview.rights !== 'owner-consent')) throw invalid();
  httpsUrl(preview.url, true); httpsUrl(preview.posterUrl, true); text(preview.alt, 600, 0); httpsUrl(preview.sourceUrl);
  if (!game.posts.some(post => post.url === preview.sourceUrl)) throw invalid('Preview provenance must point to an included source post.');
  if (preview.kind === 'image' && !preview.url) throw invalid();
  return game;
}
export function validateCatalog(catalog) {
  exactKeys(catalog, ['schemaVersion', 'generatedAt', 'source', 'games']);
  if (catalog.schemaVersion !== 1) throw invalid('Unsupported catalogue version.');
  iso(catalog.generatedAt);
  const source = catalog.source;
  exactKeys(source, ['subreddit', 'subredditUrl', 'archiveUrl', 'retrievedAt', 'coverageThrough', 'mode', 'lastSuccessfulIngestAt']);
  if (source.subreddit !== 'aigamedev' || source.subredditUrl !== 'https://www.reddit.com/r/aigamedev/' ||
    !['manual-snapshot', 'scheduled'].includes(source.mode)) throw invalid();
  httpsUrl(source.archiveUrl, true); iso(source.retrievedAt); iso(source.coverageThrough, true); iso(source.lastSuccessfulIngestAt, true);
  if (!Array.isArray(catalog.games) || catalog.games.length > 2000) throw invalid();
  const games = new Set(), posts = new Set();
  for (const game of catalog.games) {
    validateGame(game);
    if (games.has(game.id)) throw invalid('Duplicate game ID.');
    games.add(game.id);
    for (const post of game.posts) {
      if (posts.has(post.id)) throw invalid('Duplicate source post ID.');
      posts.add(post.id);
    }
  }
  return catalog;
}
