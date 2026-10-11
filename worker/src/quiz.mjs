import { query } from './store.mjs';
import { exactKeys, invalid, notFound, ApiError } from './http.mjs';
import { guestIdentity } from './feedback.mjs';
import { hmac, mutationLimit } from './limits.mjs';
import { quizPool, quizVersion } from './quiz-pool.mjs';

const UUID = /^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/;
const roundFields = 'id,guest_key_hash,pool_version,questions_json,expires_at,answers_json,completed_at';
const shuffled = array => {
  const result = [...array];
  for (let i=result.length-1;i>0;i--) {
    const j=crypto.getRandomValues(new Uint32Array(1))[0] % (i+1);
    [result[i],result[j]]=[result[j],result[i]];
  }
  return result;
};
// A separate HMAC domain prevents joining quiz visitors to public feedback.
const visitor = async (request,env) => hmac(env.RATE_LIMIT_SECRET, `quiz:${await guestIdentity(request,env)}`);
async function availableGames(db) {
  const rows=await query(db, `SELECT original.id FROM games original LEFT JOIN game_aliases a ON a.alias_id=original.id JOIN games current ON current.id=COALESCE(a.game_id,original.id) WHERE current.status='published' AND original.id IN(SELECT value FROM json_each(?))
    AND NOT EXISTS(SELECT 1 FROM removals WHERE game_id=current.id OR game_id=original.id)`,JSON.stringify(quizPool.map(game=>game.id))).all();
  return quizPool.filter(game=>rows.results.some(row=>row.id===game.id));
}
export async function quizInfo(db) {
  const pool=await availableGames(db);
  return { poolSize:pool.length, roundSize:5, available:pool.length>=5 };
}
function checkRound(row,pool,now) {
  if(row.pool_version!==quizVersion || (!row.completed_at && row.expires_at<=now)) throw new ApiError('ROUND_EXPIRED','This round has expired. Start a fresh five.',410);
  const questions=JSON.parse(row.questions_json);
  if(questions.some(q=>!pool.some(game=>game.id===q.gameId) || q.choices.some(id=>!pool.some(game=>game.id===id)))) {
    throw new ApiError('ROUND_EXPIRED','The game selection changed. Start a fresh five.',410);
  }
  return questions;
}
function publicRound(row,pool,now) {
  const questions=checkRound(row,pool,now);
  return { id:row.id, expiresAt:new Date(row.expires_at).toISOString(), poolSize:pool.length,
    questions:questions.map((question,index)=>{
      const game=pool.find(game=>game.id===question.gameId);
      return { index, image:game.image, ...(game.fallbackImage ? {fallbackImage:game.fallbackImage} : {}),
        alt:game.alt, trimTop:game.trimTop || 0, choices:question.choices.map(id=>({id,title:pool.find(game=>game.id===id).title})) };
    }) };
}
export async function startQuiz(db,env,request,body,deps) {
  exactKeys(body,['id']); if(!UUID.test(body.id||'')) throw invalid();
  const key=await visitor(request,env), now=deps.now();
  const [pool,existing]=await Promise.all([availableGames(db),query(db,`SELECT ${roundFields} FROM quiz_rounds WHERE id=?`,body.id).first()]);
  if(existing) {
    if(existing.guest_key_hash!==key) throw notFound();
    if(existing.completed_at) throw new ApiError('ROUND_FINISHED','This round is already complete. Start a fresh five.',409);
    return publicRound(existing,pool,now);
  }
  if(pool.length<5) throw new ApiError('QUIZ_UNAVAILABLE','There aren’t enough available games for a round right now. Try again later.',503);
  await mutationLimit(db,env,`quiz:${key}`,request,'quiz',now);
  const questions=shuffled(pool).slice(0,5).map(game=>({gameId:game.id,
    choices:shuffled([game.id,...shuffled(pool.filter(other=>other.id!==game.id)).slice(0,3).map(other=>other.id)])}));
  await db.batch([
    query(db,'DELETE FROM quiz_rounds WHERE completed_at IS NULL AND expires_at<=?',now),
    query(db,`INSERT INTO quiz_rounds(id,guest_key_hash,pool_version,questions_json,created_at,expires_at)
      VALUES(?,?,?,?,?,?) ON CONFLICT(id) DO NOTHING`,body.id,key,quizVersion,JSON.stringify(questions),new Date(now).toISOString(),now+86400000),
  ]);
  // Concurrent retries of a start receive the same persisted five questions.
  const row=await query(db,`SELECT ${roundFields} FROM quiz_rounds WHERE id=? AND guest_key_hash=?`,body.id,key).first();
  if(!row) throw notFound();
  return publicRound(row,pool,now);
}
export async function finishQuiz(db,env,request,id,body,deps) {
  exactKeys(body,['answers']);
  if(!Array.isArray(body.answers) || body.answers.length!==5) throw invalid('Answer or skip all five screenshots.');
  const key=await visitor(request,env), now=deps.now();
  const [pool,row]=await Promise.all([availableGames(db),query(db,`SELECT ${roundFields} FROM quiz_rounds WHERE id=? AND guest_key_hash=?`,id,key).first()]);
  if(!row) throw notFound();
  const questions=checkRound(row,pool,now);
  const answers=body.answers.map((answer,index)=>{
    exactKeys(answer,['index','choiceId','skippedReason']);
    if(answer.index!==index || (answer.choiceId===null ? !['skip','image-unavailable'].includes(answer.skippedReason)
      : answer.skippedReason!==null || !questions[index].choices.includes(answer.choiceId))) throw invalid('Choose one of the names offered for each screenshot.');
    return {index,gameId:questions[index].gameId,choiceId:answer.choiceId,skippedReason:answer.skippedReason,
      correct:answer.choiceId===questions[index].gameId ? 1 : 0};
  });
  const encoded=JSON.stringify(answers);
  if(row.completed_at && row.answers_json!==encoded) throw new ApiError('ROUND_FINISHED','This round is already saved. Answers can’t be changed after the reveal.',409);
  if(!row.completed_at) {
    await mutationLimit(db,env,`quiz:${key}`,request,'account',now);
    // Atomic, immutable completion. Check the current publication state again
    // inside the write so a concurrent removal cannot acquire new metrics.
    const required=[...new Set(questions.flatMap(q=>[q.gameId,...q.choices]))];
    await db.batch([
      query(db,`UPDATE quiz_rounds SET answers_json=?,completed_at=? WHERE id=? AND guest_key_hash=? AND completed_at IS NULL
        AND expires_at>? AND NOT EXISTS(SELECT 1 FROM json_each(?) required WHERE NOT EXISTS(
          SELECT 1 FROM games original LEFT JOIN game_aliases a ON a.alias_id=original.id JOIN games g ON g.id=COALESCE(a.game_id,original.id) WHERE original.id=required.value AND g.status='published' AND NOT EXISTS(SELECT 1 FROM removals WHERE game_id=g.id OR game_id=original.id)))`,
        encoded,new Date(now).toISOString(),id,key,now,JSON.stringify(required)),
      query(db,`INSERT INTO quiz_answers(round_id,question,game_id,choice_id,skipped_reason,correct)
        SELECT r.id,json_extract(a.value,'$.index'),json_extract(a.value,'$.gameId'),json_extract(a.value,'$.choiceId'),
          json_extract(a.value,'$.skippedReason'),json_extract(a.value,'$.correct')
        FROM quiz_rounds r,json_each(r.answers_json) a WHERE r.id=? AND r.guest_key_hash=? AND r.answers_json=?
        ON CONFLICT(round_id,question) DO NOTHING`,id,key,encoded),
    ]);
    const saved=await query(db,'SELECT answers_json FROM quiz_rounds WHERE id=? AND guest_key_hash=?',id,key).first();
    if(saved?.answers_json!==encoded) throw new ApiError('ROUND_CHANGED','This round changed or a game is no longer available. Start a fresh five.',409);
  }
  const totals=await query(db,`SELECT game_id,count(choice_id) AS attempts,sum(correct) AS correct
    FROM quiz_answers WHERE game_id IN(SELECT value FROM json_each(?)) GROUP BY game_id`,JSON.stringify(answers.map(a=>a.gameId))).all();
  return { id, score:answers.reduce((sum,a)=>sum+a.correct,0), answered:answers.filter(a=>a.choiceId!==null).length, saved:true,
    results:answers.map(answer=>{
      const game=pool.find(game=>game.id===answer.gameId), total=totals.results.find(row=>row.game_id===game.id);
      return { index:answer.index, gameId:game.id, title:game.title, projectUrl:game.projectUrl,
        choice:pool.find(game=>game.id===answer.choiceId)?.title || null, correct:Boolean(answer.correct), skippedReason:answer.skippedReason,
        recognition:{attempts:total?.attempts||0,correct:total?.correct||0} };
    }) };
}
export async function deleteQuizData(db,env,request,deps) {
  const key=await visitor(request,env);
  await mutationLimit(db,env,`quiz:${key}`,request,'privacy',deps.now());
  await query(db,'DELETE FROM quiz_rounds WHERE guest_key_hash=?',key).run();
  return { deleted:true };
}
export async function quizMetrics(db) {
  const pool=await availableGames(db), ids=JSON.stringify(pool.map(game=>game.id));
  const [rounds,answers]=await db.batch([
    query(db,`SELECT count(*) AS started,count(completed_at) AS completed FROM quiz_rounds`),
    query(db,`SELECT game_id,choice_id,skipped_reason,count(*) AS count,sum(correct) AS correct FROM quiz_answers
      WHERE game_id IN(SELECT value FROM json_each(?)) GROUP BY game_id,choice_id,skipped_reason`,ids),
  ]);
  return { rounds:rounds.results[0], games:pool.map(game=>{
    const rows=answers.results.filter(row=>row.game_id===game.id);
    return {gameId:game.id,title:game.title,attempts:rows.filter(row=>row.choice_id).reduce((s,r)=>s+r.count,0),
      correct:rows.reduce((s,r)=>s+r.correct,0),skipped:rows.filter(row=>!row.choice_id).reduce((s,r)=>s+r.count,0),
      choices:rows.filter(row=>row.choice_id && pool.some(game=>game.id===row.choice_id))
        .map(row=>({title:pool.find(game=>game.id===row.choice_id).title,count:row.count,correct:row.game_id===row.choice_id})).sort((a,b)=>b.count-a.count)};
  }) };
}
