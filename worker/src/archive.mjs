import { AUTHOR, POST_ID, sourceUrl, httpsUrl } from './validation.mjs';
import { classifySource } from './taxonomy.mjs';
import { extractAssets } from './assets.mjs';
import { PROJECT_FLAIR, projectFlair } from './source-policy.mjs';
import { inferName } from './names.mjs';
import { extractReferences } from './references.mjs';
import { projectLinks } from './project-links.mjs';

const unavailableText = value => typeof value === 'string' && /^\[(deleted|removed)\]$/i.test(value.trim());
export function decodeEntities(value) {
  if (typeof value !== 'string') return null;
  return value.replace(/&(amp|quot|apos|lt|gt|#\d+|#x[\da-f]+);/gi, (match, entity) => {
    const named = { amp: '&', quot: '"', apos: "'", lt: '<', gt: '>' };
    if (named[entity.toLowerCase()]) return named[entity.toLowerCase()];
    const num = entity.toLowerCase().startsWith('#x') ? parseInt(entity.slice(2), 16) : Number(entity.slice(1));
    return num > 0 && num <= 0x10ffff && !(num >= 0xd800 && num <= 0xdfff) ? String.fromCodePoint(num) : match;
  });
}
function safeUrl(value) { try { return httpsUrl(decodeEntities(value)); } catch { return null; } }
function previewImage(raw) {
  const image = raw.preview?.images?.[0];
  const resolutions = Array.isArray(image?.resolutions) ? image.resolutions : [];
  const suitable = resolutions.filter(item => item && Number.isInteger(item.width) && item.width > 0 && item.width <= 960)
    .map(item => ({ width: item.width, url: safeUrl(item.url) })).filter(item => item.url)
    .sort((a, b) => Math.abs(a.width - 640) - Math.abs(b.width - 640) || b.width - a.width);
  return suitable[0]?.url || safeUrl(image?.source?.url);
}
export function normalizePost(raw, nowMs, { reviewUnlabeled = false } = {}) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw) || typeof raw.id !== 'string' || !POST_ID.test(raw.id) ||
    !(projectFlair(raw.link_flair_text) || (reviewUnlabeled && raw.link_flair_text == null)) ||
    typeof raw.subreddit !== 'string' || raw.subreddit.toLowerCase() !== 'aigamedev' ||
    typeof raw.author !== 'string' || !AUTHOR.test(raw.author) || raw.author.toLowerCase() === 'automoderator' ||
    raw.over_18 === true || raw.stickied === true || raw.removed_by_category || raw.removed_by ||
    raw.banned_by || raw.removed === true ||
    unavailableText(raw.author) || unavailableText(raw.title) || unavailableText(raw.selftext) ||
    typeof raw.title !== 'string' || !raw.title.trim() || raw.title.length > 300 ||
    /[\x00-\x1f\x7f]/.test(raw.title) || !Number.isFinite(raw.created_utc) || raw.created_utc < 1104537600 ||
    raw.created_utc * 1000 > nowMs + 30000) return null;
  const title = raw.title.trim();
  const body = typeof raw.selftext === 'string' ? raw.selftext.slice(0, 12000) : '';
  const combined = `${title} ${body}`;
  const gameWords = /\b(game|platformer|roguelike|roguelite|rpg|puzzle|shooter|metroidvania|deckbuilder|dungeon crawler|survival horror|visual novel)\b/i;
  const discussion = /\b(tutorial|workflow|game engine|game generator|game maker|game builder|asset generator|editor|tool|looking for|hiring|commission|course|survey|question|advice|help me|how (do|can|to)|which (ai|model|tool)|anyone (know|recommend))\b/i;
  const assetTool = /\btext[ -]+to[ -]+(assets?|buildings?|models?|3d|textures?|sprites?)\b|\b(generate|generates|generating)\b.{0,30}\b(assets?|buildings?|models?|textures?|sprites?)\b/i;
  if (!gameWords.test(combined) || discussion.test(title) || assetTool.test(title)) return null;
  const source = sourceUrl(raw.id);
  const image = previewImage(raw) ||
    (typeof raw.url === 'string' && /\.(png|jpe?g|webp)(\?|$)/i.test(raw.url) ? safeUrl(raw.url) : null);
  const video = Boolean(raw.is_video || raw.media?.reddit_video || raw.secure_media?.reddit_video);
  const preview = { kind: video ? 'video' : image ? 'image' : 'link', url: video ? source : image,
    posterUrl: video ? image : null, alt: title, storage: 'external', rights: 'source-linked', sourceUrl: source };
  const {projectUrl, repositoryUrl} = projectLinks(raw);
  const name = inferName({title, body, projectUrl});
  const firstPerson = /\b(i|i've|i’m|i'm|my|we|we've|we’re|we're|our)\b.{0,100}\b(made|built|building|game|released|working|prototype|develop|created|finished|launch)/i.test(combined) ||
    /\b(made|built|released|created|finished)\b.{0,50}\b(my|our|a game)\b/i.test(title);
  const clear = title.length <= 160 && gameWords.test(title) && firstPerson && Boolean(projectUrl || image || video) && !discussion.test(title);
  const post = { id: raw.id, url: source, title, author: raw.author, flair: projectFlair(raw.link_flair_text) ? PROJECT_FLAIR : null,
    createdAt: new Date(raw.created_utc * 1000).toISOString(),
    kind: /\b(released|launched|available now)\b/i.test(title) ? 'release' : /\b(update|progress|devlog|added|patch)\b/i.test(title) ? 'update' : 'showcase',
    excerpt: `Source post by u/${raw.author}: ${title}`.slice(0, 600) };
  const assets = extractAssets(raw);
  post.assets = assets;
  return { post, references: extractReferences(raw), projectUrl, repositoryUrl, name, preview, clear, requiresReview: post.flair === null, authorKey: raw.author.toLowerCase(), taxonomy: classifySource(title, body) };
}
export function sourceGame(candidate) {
  const { post, projectUrl, preview } = candidate;
  return { id: `g_${post.id}`, title: candidate.name?.title || post.title, summary: post.excerpt,
    author: { name: post.author, url: `https://www.reddit.com/user/${post.author}/` },
    ...candidate.taxonomy, tags: [], projectUrl, repositoryUrl: candidate.repositoryUrl || null,
    firstSeenAt: post.createdAt, updatedAt: post.createdAt, preview, posts: [post], reviewStatus: 'source-described' };
}
