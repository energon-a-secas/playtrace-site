import { ApiError, exactKeys, invalid } from './http.mjs';
import { validateGame } from './validation.mjs';
import { query, getGame } from './store.mjs';

export const DETAIL_FIELDS = ['title', 'summary', 'category', 'stage', 'projectUrl', 'tags', 'platforms'];
export const detailsOf = game => Object.fromEntries(DETAIL_FIELDS.map(key => [key, game[key]]));

export async function applyDetails(db, games) {
  if (!games.length) return games;
  const rows = await query(db, 'SELECT game_id,details_json FROM project_overrides WHERE game_id IN(SELECT value FROM json_each(?))', JSON.stringify(games.map(game => game.id))).all();
  const overrides = new Map(rows.results.map(row => [row.game_id, JSON.parse(row.details_json)]));
  return games.map(game => ({ ...game, ...overrides.get(game.id) }));
}

export async function editDetails(db, id, body, admin, deps) {
  const source = await getGame(db, id);
  if (body?.mode === 'reset') exactKeys(body, ['mode', 'revision']);
  else if (body?.mode === 'edit') exactKeys(body, ['mode', 'revision', 'details']);
  else throw invalid();
  if (!Number.isSafeInteger(body.revision) || body.revision < 0) throw invalid();
  let details = {};
  if (body.mode === 'edit') {
    exactKeys(body.details, DETAIL_FIELDS);
    validateGame({ ...source, ...body.details });
    details = Object.fromEntries(DETAIL_FIELDS.map(key => [key,
      typeof body.details[key] === 'string' ? body.details[key].trim() : body.details[key]]));
    // Reject whitespace-only or duplicate labels after trimming as well.
    for (const key of ['tags', 'platforms']) details[key] = details[key].map(value => value.trim());
    validateGame({ ...source, ...details });
  }
  const now = new Date(deps.now()).toISOString();
  const row = await query(db, `INSERT INTO project_overrides(game_id,details_json,updated_by,updated_at,revision)
    SELECT id,?,?,?,1 FROM games WHERE id=? AND status='published'
      AND NOT EXISTS(SELECT 1 FROM removals WHERE game_id=games.id)
      AND COALESCE((SELECT revision FROM project_overrides WHERE game_id=games.id),0)=?
    ON CONFLICT(game_id) DO UPDATE SET details_json=excluded.details_json,updated_by=excluded.updated_by,
      updated_at=excluded.updated_at,revision=project_overrides.revision+1
      WHERE project_overrides.revision=? RETURNING revision`, JSON.stringify(details), admin.subject, now, id, body.revision, body.revision).first();
  if (!row) {
    await getGame(db, id);
    throw new ApiError('EDIT_CONFLICT', 'This project was edited in another tab. Reload the saved details before saving again.', 409);
  }
  await query(db, "UPDATE app_meta SET value_json=json_set(value_json,'$.generatedAt',?) WHERE key='catalog'", now).run();
}
