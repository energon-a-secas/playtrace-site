import { readFile, writeFile } from 'node:fs/promises';
import { parseArgs } from 'node:util';
import { pathToFileURL } from 'node:url';
import { extractReferences } from '../worker/src/references.mjs';

// Produce reviewable, field-scoped SQL. Source membership is resolved at apply
// time, so repost aliases and operator exclusions remain authoritative.
export function referenceBackfill(raw, linked = []) {
  const posts = Array.isArray(raw) ? raw : raw.data;
  if (!Array.isArray(posts)) throw new Error('Provide archived post records.');
  const titles = new Map([...posts, ...linked].filter(post => typeof post.title === 'string' && !/^\[(removed|deleted)\]$/i.test(post.title)).map(post => [post.id, post.title.slice(0,300)]));
  const references = posts.filter(post => /^[a-z0-9]{5,12}$/.test(post.id) && !/^\[(removed|deleted)\]$/i.test(post.selftext || ''))
    .sort((a,b) => a.created_utc - b.created_utc).flatMap(post => extractReferences(post).map(ref => ({ ...ref, author: post.author?.toLowerCase(), title: titles.get(ref.postId) || ref.title })));
  const missingTitles = [...new Set(references.filter(ref => ref.postId && !titles.has(ref.postId)).map(ref => ref.postId))];
  const literal = value => `'${JSON.stringify(value).replaceAll("'", "''")}'`;
  const statements = [];
  for(let i=0;i<posts.length;i+=50)statements.push(`DELETE FROM project_references WHERE source_post_id IN(
SELECT s.id FROM source_posts s JOIN json_each(${literal(posts.slice(i,i+50).map(post=>({id:post.id,author:post.author?.toLowerCase()})))}) r
ON s.id=json_extract(r.value,'$.id') AND s.author_key=json_extract(r.value,'$.author'));`);
  for (let i=0;i<references.length;i+=50) statements.push(`INSERT INTO project_references(game_id,url,title,source_post_id)
SELECT s.game_id,json_extract(r.value,'$.url'),json_extract(r.value,'$.title'),s.id
FROM json_each(${literal(references.slice(i,i+50))}) r
JOIN source_posts s ON s.id=json_extract(r.value,'$.sourcePostId') AND s.author_key=json_extract(r.value,'$.author')
JOIN games g ON g.id=s.game_id
WHERE s.status='published' AND g.status='published' AND NOT EXISTS(SELECT 1 FROM removals WHERE game_id=g.id)
ON CONFLICT(game_id,url) DO UPDATE SET title=excluded.title,source_post_id=excluded.source_post_id;`);
  return { references, missingTitles, sql: statements.join('\n')+'\n' };
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const {values}=parseArgs({options:{raw:{type:'string'},linked:{type:'string'},output:{type:'string'}}});
  if (!values.raw || !values.output) throw new Error('Use --raw archived-posts.json --output path-prefix [--linked linked-posts.json].');
  const read=async file=>JSON.parse(await readFile(file,'utf8'));
  const result=referenceBackfill(await read(values.raw), values.linked ? await read(values.linked) : []);
  await writeFile(values.output+'.sql',result.sql);
  await writeFile(values.output+'.json',JSON.stringify({references:result.references,missingTitles:result.missingTitles},null,2)+'\n');
  console.log(JSON.stringify({references:result.references.length,missingTitles:result.missingTitles.length}));
}
