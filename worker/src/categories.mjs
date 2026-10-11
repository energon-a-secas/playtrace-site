import { exactKeys, invalid } from './http.mjs';
import { validateCategories } from '../../js/categories.js';

export async function listCategories(db) {
  const {results}=await db.prepare('SELECT id,label FROM game_categories ORDER BY label COLLATE NOCASE,id').all();
  return validateCategories(results);
}
export async function createCategory(db, body, admin, deps) {
  exactKeys(body,['label']);
  if (typeof body.label!=='string' || body.label.length>100 || /[\x00-\x1f\x7f<>]/.test(body.label)) throw invalid('Use a category name of 1–48 characters.');
  const label=body.label.normalize('NFKC').trim().replace(/\s+/g,' '), key=label.toLowerCase();
  if (!label || label.length>48) throw invalid('Use a category name of 1–48 characters.');
  const slug=key.normalize('NFKD').replace(/\p{M}/gu,'').replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'');
  const id=slug && /^[a-z]/.test(slug) ? slug.slice(0,48).replace(/-$/,'') : `category-${crypto.randomUUID().slice(0,8)}`;
  if (id==='all') throw invalid('Choose a specific category name; All is reserved for the filter.');
  const row=await db.prepare(`INSERT INTO game_categories(id,label,label_key,created_by,created_at)
    SELECT ?,?,?,?,? WHERE (SELECT count(*) FROM game_categories)<200
    ON CONFLICT DO NOTHING RETURNING id`).bind(id,label,key,admin.subject,new Date(deps.now()).toISOString()).first();
  const category=await db.prepare('SELECT id,label FROM game_categories WHERE id=? OR label_key=? ORDER BY id LIMIT 1').bind(id,key).first();
  if (!category) throw invalid('The shared category list is full.');
  if (row) await db.prepare("UPDATE app_meta SET value_json=json_set(value_json,'$.generatedAt',?) WHERE key='catalog'").bind(new Date(deps.now()).toISOString()).run();
  return {category,created:Boolean(row),categories:await listCategories(db)};
}
