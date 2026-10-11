export const DEFAULT_CATEGORIES = Object.freeze([
  ['action','Action'], ['adventure','Adventure'], ['puzzle','Puzzle'], ['strategy','Strategy'],
  ['rpg','RPG'], ['simulation','Simulation'], ['arcade','Arcade'], ['clicker','Clicker'], ['other','Other'],
].map(([id,label])=>Object.freeze({id,label})));
export const validCategoryId = value => typeof value === 'string' && /^[a-z][a-z0-9-]{0,47}$/.test(value) && value !== 'all';
export function validateCategories(value = DEFAULT_CATEGORIES) {
  if (!Array.isArray(value) || value.length > 200) throw new Error('Invalid category list.');
  const ids = new Set(), names = new Set();
  for (const item of value) {
    if (!item || Object.keys(item).sort().join(',') !== 'id,label' || !validCategoryId(item.id)
      || typeof item.label !== 'string' || !item.label.trim() || item.label.length > 48
      || /[\x00-\x1f\x7f]/.test(item.label) || ids.has(item.id) || names.has(item.label.toLowerCase())) throw new Error('Invalid category list.');
    ids.add(item.id); names.add(item.label.toLowerCase());
  }
  if (DEFAULT_CATEGORIES.some(core=>!value.some(item=>item.id===core.id && item.label===core.label))) throw new Error('Missing standard categories.');
  return value;
}
