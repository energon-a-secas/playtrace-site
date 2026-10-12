import { query, meta, putMeta } from './store.mjs';
import { enrichGames } from './steam.mjs';
import { acquire, release } from './lease.mjs';
import { ApiError, exactKeys, invalid, unavailable } from './http.mjs';

const KEY = 'weekly_highlights';
export const HIGHLIGHT_ZONE = 'America/Santiago';
// Calendar arithmetic uses the local date, so both Chilean UTC offsets work.
export function highlightWeek(now) {
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone: HIGHLIGHT_ZONE, year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(new Date(now));
  const field = key => parts.find(part => part.type === key).value;
  const date = new Date(`${field('year')}-${field('month')}-${field('day')}T12:00:00Z`);
  date.setUTCDate(date.getUTCDate() - (date.getUTCDay() + 1) % 7);
  return date.toISOString().slice(0, 10);
}
const empty = () => ({ revision: 0, week: null, updatedAt: null, items: [], editorPickId: null, excluded: [], recent: [] });
async function selectedGames(db, ids) {
  if (!ids.length) return [];
  const rows = await query(db, `SELECT payload_json FROM games WHERE id IN(SELECT value FROM json_each(?)) AND status='published'
    AND NOT EXISTS(SELECT 1 FROM removals WHERE game_id=games.id)`, JSON.stringify(ids)).all();
  return enrichGames(db, rows.results.map(row => JSON.parse(row.payload_json)));
}
export function chooseHighlights(games, { items = [], excluded = [], recent = [], editorPickId = null } = {}) {
  const byId = new Map(games.map(game => [game.id, game]));
  const picked = items.filter(item => item.pinned && item.gameId !== editorPickId && byId.has(item.gameId) && !excluded.includes(item.gameId)).slice(0, 5);
  const blocked = new Set([...excluded, editorPickId, ...picked.map(item => item.gameId)]);
  const candidates = games.filter(game => !blocked.has(game.id) && game.projectUrl && game.title.length <= 80
    && (game.preview.posterUrl || (game.preview.kind === 'image' && game.preview.url))
    && game.availability?.status !== 'broken');
  const used = new Set(picked.map(item => byId.get(item.gameId).author.name.toLowerCase()));
  while (picked.length < 5 && candidates.length) {
    candidates.sort((a, b) => Number(used.has(a.author.name.toLowerCase())) - Number(used.has(b.author.name.toLowerCase()))
      || Number(recent.includes(a.id)) - Number(recent.includes(b.id))
      || Number(!['released', 'playable'].includes(a.stage)) - Number(!['released', 'playable'].includes(b.stage))
      || b.updatedAt.localeCompare(a.updatedAt) || a.id.localeCompare(b.id));
    const game = candidates.shift(); picked.push({ gameId: game.id, pinned: false }); used.add(game.author.name.toLowerCase());
  }
  return picked;
}
export async function getHighlights(db, admin = false) {
  const saved = await meta(db, KEY) || empty();
  const games = await selectedGames(db, [...saved.items.map(item => item.gameId), ...(saved.editorPickId ? [saved.editorPickId] : [])]);
  const byId = new Map(games.map(game => [game.id, game]));
  const items = saved.items.filter(item => byId.has(item.gameId) && item.gameId !== saved.editorPickId).map(item => ({ ...item, game: byId.get(item.gameId) }));
  const editorPick = byId.has(saved.editorPickId) ? { gameId: saved.editorPickId, game: byId.get(saved.editorPickId) } : null;
  return { revision: saved.revision, week: saved.week, updatedAt: saved.updatedAt, timezone: HIGHLIGHT_ZONE, items, editorPick,
    ...(admin ? { excluded: saved.excluded || [] } : {}) };
}
export async function saveHighlights(db, body, admin, deps) {
  const editsEditor = body && Object.hasOwn(body, 'editorPickId');
  exactKeys(body, ['revision', 'items', 'excluded', ...(editsEditor ? ['editorPickId'] : [])]);
  if (editsEditor && body.editorPickId !== null && (typeof body.editorPickId !== 'string' || !/^g_[a-z0-9]{5,12}$/.test(body.editorPickId))) throw invalid('Choose a published project for the editor’s pick.');
  if (!Number.isSafeInteger(body.revision) || body.revision < 0 || !Array.isArray(body.items) || body.items.length !== 5
    || !Array.isArray(body.excluded) || body.excluded.length > 100) throw invalid('Choose five different projects for this week.');
  for (const item of body.items) {
    exactKeys(item, ['gameId', 'pinned']);
    if (!/^g_[a-z0-9]{5,12}$/.test(item.gameId) || typeof item.pinned !== 'boolean') throw invalid();
  }
  if (new Set(body.items.map(item => item.gameId)).size !== 5 || new Set(body.excluded).size !== body.excluded.length
    || body.excluded.some(id => !/^g_[a-z0-9]{5,12}$/.test(id) || body.items.some(item => item.gameId === id))) throw invalid('Picks must be unique and cannot also be excluded.');
  const lock = await acquire(db, KEY + '_lock', deps.now(), 60000); if (!lock) throw unavailable();
  try {
    const saved = await meta(db, KEY) || empty();
    if (saved.revision !== body.revision) throw new ApiError('EDIT_CONFLICT', 'The highlights changed in another tab or rotated for the week. Reload before saving.', 409);
    const editorPickId = editsEditor ? body.editorPickId : saved.editorPickId || null;
    if (editorPickId && (body.items.some(item => item.gameId === editorPickId) || body.excluded.includes(editorPickId))) throw invalid('The editor’s pick needs its own project, separate from weekly picks and exclusions.');
    const ids = [...body.items.map(item => item.gameId), ...(editorPickId ? [editorPickId] : [])];
    if ((await selectedGames(db, ids)).length !== ids.length) throw invalid('One of these projects is no longer published. Choose another.');
    await putMeta(db, KEY, { ...saved, ...body, editorPickId, revision: saved.revision + 1, week: highlightWeek(deps.now()), updatedAt: new Date(deps.now()).toISOString(), updatedBy: admin.subject }).run();
    return getHighlights(db, true);
  } finally { await release(db, KEY + '_lock', lock); }
}
export async function rotateHighlights(db, deps) {
  const lock = await acquire(db, KEY + '_lock', deps.now(), 60000); if (!lock) return { busy: true };
  try {
    const saved = await meta(db, KEY) || empty(), week = highlightWeek(deps.now());
    if (saved.week === week) return { rotated: false };
    // The indexed recent window keeps the Saturday job bounded; pinned games are
    // fetched separately so older admin choices are never silently dropped.
    const rows = await query(db, `SELECT payload_json FROM games WHERE status='published' AND NOT EXISTS(SELECT 1 FROM removals WHERE game_id=games.id) ORDER BY updated_at DESC,id DESC LIMIT 200`).all();
    const games = await enrichGames(db, rows.results.map(row => JSON.parse(row.payload_json)));
    const pinned = await selectedGames(db, saved.items.filter(item => item.pinned).map(item => item.gameId));
    const pool = [...new Map([...games, ...pinned].map(game => [game.id, game])).values()];
    const recent = [...new Set([...saved.items.map(item => item.gameId), ...(saved.recent || [])])].slice(0, 20);
    const items = chooseHighlights(pool, { ...saved, recent });
    if (items.length !== 5) return { rotated: false, reason: 'Not enough eligible projects' };
    await putMeta(db, KEY, { ...saved, revision: saved.revision + 1, week, items, recent, updatedAt: new Date(deps.now()).toISOString(), updatedBy: 'scheduled' }).run();
    return { rotated: true, week };
  } finally { await release(db, KEY + '_lock', lock); }
}
