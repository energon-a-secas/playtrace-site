import { readFile, writeFile } from 'node:fs/promises';
import { parseArgs } from 'node:util';
import { pathToFileURL } from 'node:url';
import { PROJECT_FLAIR, includedPost } from '../worker/src/source-policy.mjs';
import { validateCatalog } from '../worker/src/validation.mjs';
import { applyCurrentSourceEvidence } from './current-source-evidence.mjs';

// Review first. This script only writes artifacts; applying its SQL is separate.
export function reviewFlairs(catalog, raw, checkedAt, currentSourceChecks = []) {
  const lookup = new Map(applyCurrentSourceEvidence(Array.isArray(raw) ? raw : raw.data, currentSourceChecks, checkedAt).map(post => [post.id, post]));
  const posts = catalog.games.flatMap(game => game.posts);
  if (posts.some(post => !lookup.has(post.id))) throw new Error('Every current source post must be checked before filtering.');
  const evidence = posts.map(post => {
    const flair = lookup.get(post.id).link_flair_text?.trim() || null;
    return { id: post.id, flair, included: includedPost({ ...post, flair }) };
  });
  const reviewed = new Map(evidence.map(post => [post.id, post]));
  const games = [];
  for (const original of catalog.games) {
    const game = structuredClone(original);
    // Derived API fields are not part of an importable catalogue.
    delete game.steam; delete game.distribution;
    game.posts = game.posts.filter(post => reviewed.get(post.id).included)
      .map(post => { const next = { ...post, flair: reviewed.get(post.id).flair }; if (next.flair !== null) delete next.inclusion; return next; })
      .sort((a,b) => a.createdAt.localeCompare(b.createdAt));
    if (!game.posts.length) continue;
    if (!game.posts.some(post => game.id === `g_${post.id}`)) throw new Error(`Review source identity before changing ${game.id}.`);
    if (!game.posts.some(post => post.url === game.preview.sourceUrl)) throw new Error(`Review preview attribution before changing ${game.id}.`);
    game.firstSeenAt = game.posts[0].createdAt; game.updatedAt = game.posts.at(-1).createdAt;
    games.push(game);
  }
  const { pagination, ...head } = catalog;
  const filtered = validateCatalog({ ...head, generatedAt: checkedAt, games });
  const review = { checkedAt, requiredFlair: PROJECT_FLAIR, before: catalog.games.length, after: games.length, posts: evidence, currentSourceChecks };
  const literal = value => `'${value.replaceAll("'", "''")}'`;
  const payload = literal(JSON.stringify(review));
  const sql = `-- Reversible scope review: hide excluded projects; preserve contributions and source evidence.
INSERT INTO app_meta(key,value_json) VALUES('source_flair_review',${payload})
ON CONFLICT(key) DO UPDATE SET value_json=excluded.value_json;
UPDATE games SET status='hidden' WHERE status='published' AND id IN(
 SELECT game_id FROM source_posts WHERE id IN(SELECT json_extract(value,'$.id') FROM json_each(${payload},'$.posts')));
UPDATE source_posts SET
 payload_json=json_set(CASE WHEN (SELECT json_extract(value,'$.flair') FROM json_each(${payload},'$.posts') WHERE json_extract(value,'$.id')=source_posts.id) IS NOT NULL
   THEN json_remove(payload_json,'$.inclusion') ELSE payload_json END,
   '$.flair',(SELECT json_extract(value,'$.flair') FROM json_each(${payload},'$.posts') WHERE json_extract(value,'$.id')=source_posts.id)),
 status=CASE WHEN (SELECT json_extract(value,'$.included') FROM json_each(${payload},'$.posts') WHERE json_extract(value,'$.id')=source_posts.id)=1 THEN 'published' ELSE 'rejected' END
WHERE id IN(SELECT json_extract(value,'$.id') FROM json_each(${payload},'$.posts'));
UPDATE games SET payload_json=json_set(payload_json,'$.posts',json((SELECT json_group_array(json(payload_json)) FROM
 (SELECT payload_json FROM source_posts WHERE game_id=games.id AND status='published' ORDER BY created_at,id))),
 '$.firstSeenAt',(SELECT min(created_at) FROM source_posts WHERE game_id=games.id AND status='published'),
 '$.updatedAt',(SELECT max(created_at) FROM source_posts WHERE game_id=games.id AND status='published')),
 updated_at=(SELECT max(created_at) FROM source_posts WHERE game_id=games.id AND status='published'),status='published'
WHERE id IN(SELECT value FROM json_each(${literal(JSON.stringify(games.map(game => game.id)))}))
 AND status='hidden' AND NOT EXISTS(SELECT 1 FROM removals WHERE game_id=games.id);
UPDATE app_meta SET value_json=json_set(value_json,'$.generatedAt',${literal(checkedAt)}) WHERE key='catalog';
`;
  return { filtered, review, sql };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const { values } = parseArgs({ options: { catalog: { type:'string' }, raw: { type:'string' }, output: { type:'string' }, 'current-review': { type:'string' } } });
  if (!values.catalog || !values.raw || !values.output) throw new Error('Use --catalog file --raw file --output path-prefix.');
  const read = async file => JSON.parse(await readFile(file, 'utf8'));
  const checks = values['current-review'] ? (await read(values['current-review'])).currentSourceChecks : [];
  const result = reviewFlairs(await read(values.catalog), await read(values.raw), new Date().toISOString(), checks);
  for (const [suffix, value] of [['catalog.json',result.filtered],['review.json',result.review]]) {
    await writeFile(`${values.output}-${suffix}`, `${JSON.stringify(value,null,2)}\n`);
  }
  await writeFile(`${values.output}.sql`,result.sql);
  console.log(JSON.stringify({ before:result.review.before, after:result.review.after, posts:result.review.posts.length }));
}
