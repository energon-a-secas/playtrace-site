import { readFile, writeFile, rename } from 'node:fs/promises';
import { parseArgs } from 'node:util';
import { pathToFileURL } from 'node:url';
import { decodeEntities } from '../worker/src/archive.mjs';
import { PROJECT_FLAIR, projectFlair } from '../worker/src/source-policy.mjs';
import { AUTHOR, POST_ID, canonicalProjectUrl, httpsUrl, sourceUrl, validateCatalog } from '../worker/src/validation.mjs';

const clean = value => decodeEntities(value || '').replace(/\\([_&])/g, '$1');
const safeImage = value => {
  try {
    const url = httpsUrl(clean(value));
    return /(^|\.)(redd\.it|redditmedia\.com)$/.test(new URL(url).hostname) ? url : null;
  } catch { return null; }
};
function projectLinks(post) {
  const content = clean(`${post.url || ''}\n${post.title}\n${post.selftext || ''}`);
  return new Set((content.match(/https?:\/\/[^\s<>"\[\]()]+/g) || [])
    .map(url => canonicalProjectUrl(url.replace(/^http:/, 'https:'))).filter(Boolean));
}
function preview(post, title) {
  const image = post.preview?.images?.[0];
  const galleryId = post.gallery_data?.items?.[0]?.media_id;
  const gallery = post.media_metadata?.[galleryId] || Object.values(post.media_metadata || {}).find(item => item.status === 'valid');
  const variants = [
    ...(image?.resolutions || []).map(item => ({ width: item.width, url: item.url })),
    ...(gallery?.p || []).map(item => ({ width: item.x, url: item.u })),
    ...(image?.source ? [{ width: image.source.width, url: image.source.url }] : []),
  ].map(item => ({ ...item, url: safeImage(item.url) })).filter(item => item.url && item.width > 0 && item.width <= 960)
    .sort((a, b) => Math.abs(a.width - 640) - Math.abs(b.width - 640));
  const inline = (clean(post.selftext).match(/https:\/\/[^\s<>"\[\]()]+/g) || [])
    .find(url => /\.(png|jpe?g|webp|gif)(\?|$)/i.test(url) && safeImage(url));
  const poster = variants[0]?.url || safeImage(image?.source?.url) || safeImage(gallery?.s?.u)
    || (/\.(png|jpe?g|webp|gif)(\?|$)/i.test(post.url || '') ? safeImage(post.url) : null)
    || safeImage(inline) || safeImage(post.thumbnail);
  const video = Boolean(post.is_video || post.media?.reddit_video || post.secure_media?.reddit_video
    || /https:\/\/(?:www\.)?(?:youtube\.com|youtu\.be)\//.test(post.url || ''));
  return { kind: video ? 'video' : poster ? 'image' : 'link', url: video ? sourceUrl(post.id) : poster,
    posterUrl: poster, alt: `${title}: preview shared by u/${post.author}`,
    storage: 'external', rights: 'source-linked', sourceUrl: sourceUrl(post.id) };
}
function checkedPost(post, reviewedAt) {
  if (!post || !projectFlair(post.link_flair_text) || !POST_ID.test(post.id) || !AUTHOR.test(post.author) || post.author.toLowerCase() === 'automoderator'
    || post.subreddit?.toLowerCase() !== 'aigamedev' || post.over_18 || post.stickied || post.removed
    || post.removed_by_category || post.removed_by || post.banned_by
    || [post.title, post.selftext].some(value => /^\[(deleted|removed)\]$/i.test(value || ''))
    || !Number.isFinite(post.created_utc) || post.created_utc * 1000 > Date.parse(reviewedAt)) {
    throw new Error(`Unavailable or invalid source post: ${post?.id || 'missing'}`);
  }
  return post;
}

// Reviewed selections supply editorial metadata. Source IDs, authors, dates,
// images and links always come from the archive; existing projects stay intact.
export function buildSnapshot(base, archive, review) {
  validateCatalog(base);
  if (base.source.mode !== 'manual-snapshot') throw new Error('Only edit a manual snapshot, never a live export.');
  if (review.schemaVersion !== 1 || !Array.isArray(review.selections) || !Number.isFinite(Date.parse(review.reviewedAt))) {
    throw new Error('Invalid review manifest.');
  }
  const rows = Array.isArray(archive) ? archive : archive.data;
  if (!Array.isArray(rows)) throw new Error('Expected an archive array or {data: [...]} response.');
  const posts = new Map(rows.map(post => [post.id, post]));
  const games = new Map(structuredClone(base.games).map(game => [game.id, game]));
  for (const id of review.preserveGameIds || []) if (!games.has(id)) throw new Error(`Missing original project: ${id}`);
  const originalPosts = new Map(base.games.flatMap(game => game.posts.map(post => [post.id, game.id])));
  const selected = new Set();
  for (const entry of review.selections) {
    if (!Array.isArray(entry.postIds) || !entry.postIds.length) throw new Error('A selection needs source posts.');
    const history = entry.postIds.map(id => {
      if (selected.has(id)) throw new Error(`Source post selected twice: ${id}`);
      selected.add(id);
      return checkedPost(posts.get(id), review.reviewedAt);
    }).sort((a, b) => a.created_utc - b.created_utc || a.id.localeCompare(b.id));
    const author = history[0].author;
    const id = `g_${history[0].id}`;
    if (history.some(post => post.author.toLowerCase() !== author.toLowerCase())) throw new Error(`Mixed authors: ${id}`);
    if (history.some(post => originalPosts.has(post.id) && originalPosts.get(post.id) !== id)) throw new Error(`Source already belongs to another project: ${id}`);
    const project = entry.projectUrl ? canonicalProjectUrl(entry.projectUrl) : null;
    if (entry.projectUrl && !project) throw new Error(`Invalid project link: ${id}`);
    if (project && !history.some(post => projectLinks(post).has(project))) throw new Error(`Project link absent from source: ${id}`);
    if (history.length > 1 && (!project || !history.every(post => projectLinks(post).has(project)))) {
      throw new Error(`Multiple posts require the same author and canonical project link: ${id}`);
    }
    const existing = games.get(id);
    if (existing && (existing.author.name.toLowerCase() !== author.toLowerCase()
      || existing.posts.some(post => !entry.postIds.includes(post.id)))) throw new Error(`Would change existing project identity: ${id}`);
    if ((review.preserveGameIds || []).includes(id)) throw new Error(`Original project is reserved: ${id}`);
    const sameProject = project && [...games.values()].find(game => game.id !== id
      && game.author.name.toLowerCase() === author.toLowerCase() && canonicalProjectUrl(game.projectUrl) === project);
    if (sameProject) throw new Error(`Project already exists as ${sameProject.id}; review its timeline instead.`);
    const timeline = history.map(post => ({ id: post.id, url: sourceUrl(post.id), title: clean(post.title), author: post.author, flair: PROJECT_FLAIR,
      createdAt: new Date(post.created_utc * 1000).toISOString(),
      kind: /\b(update|progress|devlog|added|patch)\b/i.test(post.title) ? 'update'
        : /\b(released|launched|available now)\b/i.test(post.title) ? 'release' : 'showcase',
      excerpt: entry.summary }));
    games.set(id, { id, title: entry.title, summary: entry.summary,
      author: { name: author, url: `https://www.reddit.com/user/${author}/` },
      category: entry.category, stage: entry.stage, platforms: entry.platforms, tags: entry.tags,
      projectUrl: entry.projectUrl, firstSeenAt: timeline[0].createdAt, updatedAt: timeline.at(-1).createdAt,
      preview: preview(history.at(-1), entry.title), posts: timeline, reviewStatus: 'reviewed' });
  }
  const result = { ...base, generatedAt: review.reviewedAt,
    source: { ...base.source, retrievedAt: review.retrievedAt,
      coverageThrough: [...games.values()].map(game => game.updatedAt).sort().at(-1) || null },
    games: [...games.values()] };
  return validateCatalog(result);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const { values } = parseArgs({ options: {
    archive: { type: 'string' }, review: { type: 'string', default: 'data/snapshot-review.json' },
    catalog: { type: 'string', default: 'data/catalog.json' }, out: { type: 'string' },
  } });
  if (!values.archive) throw new Error('Usage: node scripts/build-snapshot.mjs --archive /path/to/posts.json [--out /path/to/catalog.json]');
  const read = async path => JSON.parse(await readFile(path, 'utf8'));
  const result = buildSnapshot(await read(values.catalog), await read(values.archive), await read(values.review));
  const output = values.out || values.catalog;
  const temp = `${output}.${process.pid}.tmp`;
  await writeFile(temp, `${JSON.stringify(result, null, 2)}\n`);
  await rename(temp, output);
  console.log(`${result.games.length} projects, ${result.games.reduce((sum, game) => sum + game.posts.length, 0)} source posts → ${output}`);
}
