import { query } from './store.mjs';
import { invalid } from './http.mjs';
import { feedbackQuestions } from '../../js/feedback-options.js';
import { expectationAggregates } from './expectations.mjs';

// This endpoint deliberately never reads guest hashes or research_responses.
// Public quick answers and already-approved citations are separate measures.
export async function feedbackPatterns(db, deps, cursor = '') {
  if(cursor && !/^g_[a-z0-9]{5,12}$/.test(cursor))throw invalid('Invalid feedback report page.');
  const until = new Date(deps.now()).toISOString(), since = new Date(deps.now()-60*86400000).toISOString();
  const { results: projects } = await query(db, `SELECT g.id FROM games g WHERE g.status='published' AND g.id>?
    AND NOT EXISTS(SELECT 1 FROM removals WHERE game_id=g.id)
    AND (EXISTS(SELECT 1 FROM feedback f WHERE f.game_id=g.id AND f.status='published' AND f.updated_at>=? AND f.updated_at<=?)
      OR EXISTS(SELECT 1 FROM feedback_reviews r WHERE r.game_id=g.id AND json_extract(r.payload_json,'$.windowEnd')>=?)
      OR EXISTS(SELECT 1 FROM play_expectations e WHERE e.game_id=g.id AND e.first_at>=? AND e.first_at<=?))
    ORDER BY g.id LIMIT 41`, cursor || '', since, until, since, since, until).all();
  const ids = projects.slice(0,40).map(row=>row.id), selected=JSON.stringify(ids);
  if(!ids.length)return {version:1,windowStart:since,windowEnd:until,games:[],nextCursor:null};
  const [counts,choices,reviews]=await db.batch([
    query(db,`SELECT game_id,experience,count(*) AS count,sum(CASE WHEN length(trim(body))>=8 THEN 1 ELSE 0 END) AS notes
      FROM feedback WHERE game_id IN(SELECT value FROM json_each(?)) AND status='published' AND updated_at>=? AND updated_at<=?
      GROUP BY game_id,experience`, selected,since,until),
    query(db,`SELECT f.game_id,f.experience,j.value AS choice,count(*) AS count FROM feedback f,json_each(f.choices_json) j
      WHERE f.game_id IN(SELECT value FROM json_each(?)) AND f.status='published' AND f.updated_at>=? AND f.updated_at<=?
      GROUP BY f.game_id,f.experience,j.value`, selected,since,until),
    query(db,`SELECT game_id,payload_json,published_at FROM feedback_reviews WHERE game_id IN(SELECT value FROM json_each(?))`, selected),
  ]);
  const expectations=await expectationAggregates(db,ids,since,until);
  const games=ids.map(id=>{
    const row=reviews.results.find(row=>row.game_id===id),review=row?JSON.parse(row.payload_json):null;
    return {id,expectations:expectations.find(row=>row.id===id),feedback:counts.results.filter(row=>row.game_id===id).map(row=>({experience:row.experience,count:row.count,notes:row.notes,
      choices:feedbackQuestions.flatMap(question=>question.options.map(option=>({id:option.id,group:question.id,
        count:choices.results.find(choice=>choice.game_id===id&&choice.experience===row.experience&&choice.choice===option.id)?.count||0})))})),
    review:review?{summary:review.summary,windowStart:review.windowStart,windowEnd:review.windowEnd,publishedAt:row.published_at,sampled:review.sampled,
      citations:review.citations.filter(citation=>Date.parse(citation.updatedAt||citation.createdAt)>=Date.parse(since)&&Date.parse(citation.updatedAt||citation.createdAt)<=deps.now()).map(citation=>({
        number:citation.number,url:citation.url,source:citation.source==='playtrace'?'playtrace':'reddit',
        experience:citation.experience||'unspecified',theme:citation.theme||null,tone:citation.tone||null,
        createdAt:citation.createdAt,updatedAt:citation.updatedAt||null,
      }))}:null};
  });
  return {version:1,windowStart:since,windowEnd:until,games,nextCursor:projects.length>40?ids.at(-1):null};
}
