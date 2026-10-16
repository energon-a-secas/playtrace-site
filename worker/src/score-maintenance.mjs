import { query, meta, putMeta } from './store.mjs';
import { acquire, release } from './lease.mjs';
import { archiveJson } from './references.mjs';
import { scoreObservation, saveScoreObservations } from './reddit-scores.mjs';
import { rememberArchiveCooldown, providerCooldownStatement } from './archive-cooldown.mjs';
import { redditConfigured, redditToken, redditPosts } from './reddit-access.mjs';

export const scorePolicy = { cron: '50 12 * * SUN', lookbackDays: 35, batchSize: 100, maxRequests: 8 };
export async function scoreMaintenanceStatus(db,env={}) {
  const coverage=await query(db,`SELECT count(*) observations,count(DISTINCT h.post_id) posts,
    sum(h.provider='reddit') liveObservations,sum(h.comment_count IS NOT NULL) withComments,
    count(DISTINCT CASE WHEN julianday(h.observed_at)-julianday(p.created_at) BETWEEN 7 AND 14 THEN p.game_id END) comparableProjects,
    min(h.observed_at) firstObservation,max(h.observed_at) lastObservation
    FROM reddit_observations h JOIN source_posts p ON p.id=h.post_id JOIN games g ON g.id=p.game_id
    WHERE p.status='published' AND g.status='published' AND NOT EXISTS(SELECT 1 FROM removals WHERE game_id=g.id)`).first();
  return {policy:scorePolicy,lastRun:await meta(db,'weekly_scores'),provider:redditConfigured(env)?'reddit':'archive',liveConfigured:redditConfigured(env),coverage};
}

// One Sunday window, eight actual HTTP requests at most. Reserve each batch
// before fetching so interruptions, duplicate cron delivery and failures cannot
// cause unbounded retries. Older entries retain their last archive observation.
export async function refreshWeeklyScores(db, deps, env={}) {
  const now = deps.now(), date = new Date(now);
  if (date.getUTCDay() !== 0) return { updated: 0, skipped: true };
  const owner = await acquire(db, 'weekly_scores_lock', now, 180000);
  if (!owner) return { updated: 0, busy: true };
  try {
    const week = date.toISOString().slice(0, 10), saved = await meta(db, 'weekly_scores');
    const state = saved?.week === week ? saved : { week, windowStart: new Date(now - scorePolicy.lookbackDays * 86400000).toISOString(),
      windowEnd: date.toISOString(), attempts: 0, checked: 0, updated: 0, unchanged: 0, freshnessTracked:true, missing: 0, failedBatches: 0, after: '', status: 'pending',provider:redditConfigured(env)?'reddit':'archive' };
    const live=state.provider==='reddit';
    if (['complete','partial'].includes(state.status) || state.attempts >= scorePolicy.maxRequests) return { updated: 0, limited: state.status !== 'complete' };
    const cooldown = await meta(db, 'editorial_cooldown') || {};
    if ((live?cooldown.reddit:cooldown.archive) > now) {
      await putMeta(db, 'weekly_scores', { ...state, status: 'deferred', retryAt: new Date(live?cooldown.reddit:cooldown.archive).toISOString() }).run();
      return { updated: 0, deferred: true };
    }
    let updated = 0,token=null;
    if(live){
      // Authentication is an HTTP request too, inside the same eight-request cap.
      state.attempts++;await putMeta(db,'weekly_scores',state).run();
      try{token=await redditToken(env,deps);}catch(error){
        state.status='partial';state.failedBatches++;state.finishedAt=new Date(deps.now()).toISOString();
        if(error.retryAt)await providerCooldownStatement(db,'reddit',error.retryAt).run();
        await putMeta(db,'weekly_scores',state).run();return {updated:0,status:'partial'};
      }
    }
    while (state.attempts < scorePolicy.maxRequests) {
      const { results: rows } = await query(db, `SELECT p.id,p.author_key,s.observed_at FROM source_posts p JOIN games g ON g.id=p.game_id LEFT JOIN reddit_scores s ON s.post_id=p.id
        WHERE p.status='published' AND g.status='published' AND NOT EXISTS(SELECT 1 FROM removals WHERE game_id=g.id)
          AND p.created_at>=? AND p.created_at<=? AND p.id>? ORDER BY p.id LIMIT ?`,
      state.windowStart, state.windowEnd, state.after, scorePolicy.batchSize + 1).all();
      if (!rows.length) { state.status = state.failedBatches ? 'partial' : 'complete'; break; }
      const batch = rows.slice(0, scorePolicy.batchSize), ids = batch.map(row => row.id);
      state.attempts++; state.after = ids.at(-1); state.status = 'running'; delete state.retryAt;
      await putMeta(db, 'weekly_scores', state).run();
      try {
        const raw = live?await redditPosts(ids,token,env,deps):await archiveJson(`posts/ids?ids=${ids.join(',')}`, deps, { maxAttempts: 1 });
        const byId = new Map(raw.map(row => [row.id, row])), observations = [];
        for (const row of batch) {
          const post = byId.get(row.id);
          if (!post) { state.missing++; continue; }
          if (post.author?.toLowerCase() !== row.author_key || post.subreddit?.toLowerCase() !== 'aigamedev'
            || post.removed_by_category || /^\[(deleted|removed)\]$/i.test(post.selftext || '')) continue;
          const score = scoreObservation(post, deps.now(),live?'reddit':'archive');
          if(score&&(!row.observed_at||score.observedAt>row.observed_at))observations.push(score);
          else state.unchanged=(state.unchanged||0)+1;
        }
        if(observations.length)await saveScoreObservations(db, observations).run();
        const changed = observations.length;
        updated += changed; state.updated += changed; state.checked += batch.length;
        if(raw.rateLimitUntil){
          await providerCooldownStatement(db,'reddit',raw.rateLimitUntil).run();
          state.status='partial';state.retryAt=new Date(raw.rateLimitUntil).toISOString();break;
        }
      } catch (error) {
        state.failedBatches++; state.status = 'partial';
        if(live&&error.retryAt)await providerCooldownStatement(db,'reddit',error.retryAt).run();
        if (error.queueCooldown === 'archive') {
          await rememberArchiveCooldown(db, error.retryAt);
          state.retryAt = new Date(error.retryAt).toISOString();
        }
        break; // Leave the last good score intact. No automatic retry loop.
      }
      if (rows.length <= scorePolicy.batchSize) { state.status = state.failedBatches ? 'partial' : 'complete'; break; }
      state.status = 'limited';
      if (state.attempts < scorePolicy.maxRequests) await deps.sleep(500);
    }
    state.finishedAt = new Date(deps.now()).toISOString();
    await putMeta(db, 'weekly_scores', state).run();
    return { updated, checked: state.checked, status: state.status };
  } finally { await release(db, 'weekly_scores_lock', owner); }
}
