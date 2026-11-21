-- Read-only owner audit. Returns aggregates; no account IDs, guest keys, or text.
-- Run once via the operator CLI, never on a public page request.
SELECT 'contributions' AS section,
  (SELECT count(*) FROM feedback f JOIN games g ON g.id=f.game_id WHERE g.status='published' AND f.status='published') AS public_feedback,
  (SELECT count(DISTINCT f.game_id) FROM feedback f JOIN games g ON g.id=f.game_id WHERE g.status='published' AND f.status='published') AS projects_with_feedback,
  (SELECT count(*) FROM feedback f JOIN games g ON g.id=f.game_id WHERE g.status='published' AND f.status='published' AND ideal_price_cents IS NOT NULL) AS public_price_suggestions,
  (SELECT count(*) FROM feedback f JOIN games g ON g.id=f.game_id WHERE g.status='published' AND f.status='published' AND json_array_length(choices_json)>0) AS quick_choice_responses,
  (SELECT count(*) FROM ratings r JOIN games g ON g.id=r.game_id WHERE g.status='published') AS rating_contributions,
  (SELECT count(DISTINCT r.game_id) FROM ratings r JOIN games g ON g.id=r.game_id WHERE g.status='published') AS rated_projects,
  (SELECT count(*) FROM research_responses r JOIN games g ON g.id=r.game_id WHERE g.status='published') AS research_responses,
  (SELECT count(*) FROM questionnaires WHERE active=1) AS active_questionnaires,
  (SELECT count(*) FROM follows f JOIN games g ON g.id=f.game_id WHERE g.status='published') AS private_favorites,
  (SELECT count(*) FROM price_signals p JOIN games g ON g.id=p.game_id WHERE g.status='published') AS private_legacy_price_signals;

SELECT 'feedback_choices' AS section, j.value AS choice, count(*) AS responses
FROM feedback f JOIN games g ON g.id=f.game_id, json_each(f.choices_json) j
WHERE f.status='published' AND g.status='published' GROUP BY j.value;

SELECT 'quiz_rounds' AS section,pool_version,count(*) AS retained_starts,
 count(completed_at) AS completed_rounds, min(created_at) AS earliest_retained_start,
 max(created_at) AS latest_retained_start FROM quiz_rounds GROUP BY pool_version;

SELECT 'quiz_answers' AS section,COALESCE(skipped_reason,'answered') AS outcome,
 count(*) AS answers,sum(correct) AS correct FROM quiz_answers GROUP BY skipped_reason;

SELECT 'research_versions' AS section,questionnaire_id,revision,count(*) AS responses,
 min(created_at) AS earliest_response,max(updated_at) AS latest_response
FROM research_responses GROUP BY questionnaire_id,revision;

SELECT 'editorial_queue' AS section,kind,status,count(*) AS jobs FROM editorial_jobs GROUP BY kind,status;

SELECT 'feedback_review_coverage' AS section,count(*) AS projects,
 sum(CASE WHEN length(COALESCE(json_extract(payload_json,'$.summary'),''))>0 THEN 1 ELSE 0 END) AS cited_drafts,
 sum(COALESCE(json_extract(payload_json,'$.classifiedComments'),0)) AS classified_comments,
 sum(CASE WHEN json_extract(payload_json,'$.classifiedComments')=0 THEN 1 ELSE 0 END) AS without_eligible_comments,
 sum(CASE WHEN json_extract(payload_json,'$.classifiedComments')>0 AND length(COALESCE(json_extract(payload_json,'$.summary'),''))=0 THEN 1 ELSE 0 END) AS manual_review_needed,
 sum(CASE WHEN json_extract(payload_json,'$.sampled')=1 THEN 1 ELSE 0 END) AS capped_samples,
 min(json_extract(payload_json,'$.windowStart')) AS window_start,
 max(json_extract(payload_json,'$.windowEnd')) AS window_end
FROM editorial_jobs WHERE kind='feedback' AND status IN('ready','published');

SELECT 'machine_feedback_labels' AS section,json_extract(e.value,'$.theme.value') AS theme,
 json_extract(e.value,'$.tone.value') AS tone,count(*) AS comments,
 count(DISTINCT j.game_id) AS projects,
 sum(CASE WHEN json_extract(e.value,'$.theme.probability')>=0.7 AND json_extract(e.value,'$.tone.probability')>=0.7 THEN 1 ELSE 0 END) AS threshold_pass
FROM editorial_jobs j,json_each(j.payload_json,'$.evidence') e
WHERE j.kind='feedback' AND j.status IN('ready','published')
GROUP BY theme,tone;

SELECT 'editorial_assets' AS section,
 (SELECT count(*) FROM feedback_reviews) AS published_reviews,
 (SELECT count(*) FROM project_references) AS source_references,
 (SELECT count(DISTINCT game_id) FROM project_references) AS projects_with_references,
 (SELECT count(*) FROM game_aliases) AS merged_aliases,
 (SELECT count(*) FROM change_requests WHERE status='open') AS open_change_requests;

SELECT 'catalogue_status' AS section,status,count(*) AS entries FROM games GROUP BY status;
