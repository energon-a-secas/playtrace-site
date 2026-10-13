import { query, getGame } from './store.mjs';
import { guestIdentity } from './feedback.mjs';
import { mutationLimit } from './limits.mjs';
import { exactKeys, invalid, notFound, ApiError } from './http.mjs';
import { text, GAME_ID } from './validation.mjs';
import { enrichGames } from './steam.mjs';
import { builtInQuestionnaires, researchCategories, validQuestions, validAnswers } from '../../js/research-schema.js';

export async function ensureResearch(db) {
  await query(db, `INSERT INTO questionnaires(id,title,category,questions_json,updated_at,updated_by)
    SELECT json_extract(value,'$.id'),json_extract(value,'$.title'),json_extract(value,'$.category'),json_extract(value,'$.questions'),'2026-10-11T00:00:00.000Z','system'
    FROM json_each(?) WHERE 1 ON CONFLICT DO NOTHING`, JSON.stringify(builtInQuestionnaires)).run();
}
const form = row => ({ id: row.id, title: row.title, category: row.category, gameId: row.game_id, questions: JSON.parse(row.questions_json), revision: row.revision, active: Boolean(row.active), updatedAt: row.updated_at });
export async function researchList(db, admin = false) {
  await ensureResearch(db);
  const rows = await query(db, `SELECT q.*,count(r.guest_key_hash) AS responses FROM questionnaires q
    LEFT JOIN research_responses r ON r.questionnaire_id=q.id WHERE ${admin ? '1' : 'q.active=1'}
    AND (q.game_id IS NULL OR EXISTS(SELECT 1 FROM games g WHERE g.id=q.game_id AND g.status='published' AND NOT EXISTS(SELECT 1 FROM removals WHERE game_id=g.id)))
    GROUP BY q.id ORDER BY (q.id='playtest') DESC,q.updated_at DESC,q.id LIMIT 200`).all();
  return { questionnaires: rows.results.map(row => ({ ...form(row), ...(admin ? { responses: row.responses } : {}) })), categories: admin ? researchCategories : researchCategories.filter(category => rows.results.some(row => row.category === category)) };
}
export async function getResearch(db, id, gameId, allowClosed = true) {
  if (builtInQuestionnaires.some(item => item.id === id)) await ensureResearch(db);
  const row = await query(db, `SELECT * FROM questionnaires WHERE id=? ${allowClosed?'':'AND active=1'}`, id).first();
  if (!row) throw notFound();
  const questionnaire = form(row), selected = gameId || questionnaire.gameId;
  if (!selected || !GAME_ID.test(selected) || questionnaire.gameId && questionnaire.gameId !== selected) throw invalid('Choose a project for this questionnaire.');
  const [game] = await enrichGames(db, [await getGame(db, selected)]);
  return { questionnaire, game: { id: game.id, title: game.title, author: game.author, projectUrl: game.projectUrl, preview: game.preview } };
}
// Shared questionnaire links follow reviewed project redirects. Response reads
// and mutations still require their explicit canonical project ID; opening an
// old link must not move or combine anyone's private answers.
export async function publicResearch(db, id, gameId) {
  const alias=gameId&&GAME_ID.test(gameId)?await query(db,'SELECT game_id FROM game_aliases WHERE alias_id=?',gameId).first():null;
  return getResearch(db,id,alias?.game_id||gameId);
}
export async function saveResearch(db, id, body, admin, deps) {
  exactKeys(body, ['title','category','gameId','questions','revision','active']);
  if (!/^[a-z][a-z0-9-]{2,59}$/.test(id)) throw invalid('Use a short questionnaire ID.');
  text(body.title, 120); if (!researchCategories.includes(body.category) || !validQuestions(body.questions) || typeof body.active !== 'boolean' || !Number.isInteger(body.revision) || body.revision < 0) throw invalid('Check the questionnaire fields.');
  if (body.gameId !== null) { if (!GAME_ID.test(body.gameId || '')) throw invalid(); await getGame(db, body.gameId); }
  const count = await query(db, 'SELECT count(*) AS n FROM questionnaires').first();
  if (!body.revision && count.n >= 200) throw invalid('The questionnaire limit has been reached.');
  const saved = await query(db, `INSERT INTO questionnaires(id,title,category,game_id,questions_json,revision,active,updated_at,updated_by)
    SELECT ?,?,?,?,?,1,?,?,? WHERE (?=0 OR EXISTS(SELECT 1 FROM questionnaires WHERE id=? AND revision=?))
    ON CONFLICT(id) DO UPDATE SET title=excluded.title,category=excluded.category,game_id=excluded.game_id,
      questions_json=excluded.questions_json,revision=questionnaires.revision+1,active=excluded.active,updated_at=excluded.updated_at,updated_by=excluded.updated_by
    WHERE questionnaires.revision=? AND (questionnaires.game_id IS excluded.game_id OR NOT EXISTS(SELECT 1 FROM research_responses WHERE questionnaire_id=questionnaires.id)) RETURNING *`, id, body.title.trim(), body.category, body.gameId, JSON.stringify(body.questions), Number(body.active), new Date(deps.now()).toISOString(), admin.subject, body.revision, id, body.revision, body.revision).first();
  if (!saved) throw new ApiError('CONFLICT', 'Reload this questionnaire before saving. If it already has responses, create a new study to change its project scope.', 409);
  return { questionnaire: form(saved) };
}
export async function researchResponse(db, env, request, id, gameId, body, deps) {
  const { questionnaire, game } = await getResearch(db, id, gameId || body?.gameId, request.method !== 'PUT');
  const guest = await guestIdentity(request, env);
  if (request.method === 'GET') {
    const row = await query(db, 'SELECT answers_json,revision FROM research_responses WHERE questionnaire_id=? AND game_id=? AND guest_key_hash=?', id, game.id, guest).first();
    return { answers: row ? JSON.parse(row.answers_json) : null, revision: row?.revision || null };
  }
  await mutationLimit(db, env, `guest:${guest}`, request, request.method === 'DELETE' ? 'privacy' : 'price', deps.now());
  if (request.method === 'DELETE') {
    await db.batch([
      query(db, "DELETE FROM editorial_jobs WHERE kind='research' AND game_id=? AND EXISTS(SELECT 1 FROM research_responses WHERE questionnaire_id=? AND game_id=? AND guest_key_hash=?)",game.id,id,game.id,guest),
      query(db, 'DELETE FROM research_responses WHERE questionnaire_id=? AND game_id=? AND guest_key_hash=?', id, game.id, guest),
    ]); return { deleted: true };
  }
  exactKeys(body, ['gameId','revision','answers']);
  if (body.revision !== questionnaire.revision) throw new ApiError('CONFLICT', 'The questions changed. Reload this playtest to continue.', 409);
  if (!validAnswers(questionnaire.questions, body.answers)) throw invalid('Choose from the available answers.');
  if (!Object.values(body.answers).some(value => Array.isArray(value) ? value.length : value !== null && value !== '')) throw invalid('Answer at least one question before sending.');
  const at = new Date(deps.now()).toISOString();
  const saved = await query(db, `INSERT INTO research_responses(questionnaire_id,game_id,guest_key_hash,revision,questions_json,answers_json,created_at,updated_at)
    SELECT ?,g.id,?,?,?,?,?,? FROM games g JOIN questionnaires q ON q.id=?
    WHERE g.id=? AND g.status='published' AND q.active=1 AND q.revision=? AND NOT EXISTS(SELECT 1 FROM removals WHERE game_id=g.id)
    ON CONFLICT(questionnaire_id,game_id,guest_key_hash) DO UPDATE SET revision=excluded.revision,questions_json=excluded.questions_json,
    answers_json=excluded.answers_json,updated_at=excluded.updated_at RETURNING game_id`, id, guest, body.revision, JSON.stringify(questionnaire.questions), JSON.stringify(body.answers), at, at, id, game.id, body.revision).first();
  if (!saved) throw new ApiError('CONFLICT', 'The questionnaire changed. Reload before sending.', 409);
  // Invalidate copied evidence after an edit. An in-flight job can no longer
  // update its deleted row, so it cannot restore a superseded response.
  await query(db,"DELETE FROM editorial_jobs WHERE kind='research' AND game_id=?",game.id).run();
  return { saved: true, updatedAt: at };
}
export async function researchMetrics(db, id) {
  const row = await query(db, 'SELECT * FROM questionnaires WHERE id=?', id).first();
  if (!row) throw notFound();
  // Aggregate in SQL; browser keys and individual free text never leave this route.
  const counts = await query(db, `SELECT game_id,revision,count(*) AS count FROM research_responses WHERE questionnaire_id=? GROUP BY game_id,revision`, id).all();
  const options = await query(db, `SELECT r.revision,q.key AS question,CASE WHEN q.type='array' THEN a.value ELSE q.value END AS option,count(*) AS count
    FROM research_responses r,json_each(r.answers_json) q,json_each(CASE WHEN q.type='array' THEN q.value ELSE json_array(q.value) END) a
    WHERE r.questionnaire_id=? AND (q.type='integer' OR q.type='array') GROUP BY r.revision,q.key,option`, id).all();
  return { questionnaire: form(row), counts: counts.results, options: options.results };
}
