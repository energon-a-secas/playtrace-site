// An operator/editor writes the prose and chooses source IDs. Automated theme
// classifications are never treated as evidence that the prose is correct.
import { feedbackTopics } from '../../js/feedback-patterns.js';
export function reviewedFeedback(game, draft, decision, comments, checkedAt) {
  if(decision.gameId!==game.id||typeof decision.summary!=='string'||decision.summary.length<40||decision.summary.length>2000
    ||!Array.isArray(decision.commentIds)||!decision.commentIds.length||decision.commentIds.length>12
    ||new Set(decision.commentIds).size!==decision.commentIds.length)throw new Error('Invalid editorial decision');
  const refs=[...decision.summary.matchAll(/\[(\d+)\]/g)].map(m=>Number(m[1]));
  if(refs.some(n=>n<1||n>decision.commentIds.length)||decision.commentIds.some((_,i)=>!refs.includes(i+1)))throw new Error('Every citation must be used, with no unmatched references');
  if(decision.labels!==undefined&&(!Array.isArray(decision.labels)||decision.labels.length!==decision.commentIds.length
    ||decision.labels.some((label,i)=>!label||label.number!==i+1
      ||label.theme!==null&&!Object.hasOwn(feedbackTopics,label.theme)
      ||label.tone!==null&&!['praise','concern','suggestion','mixed'].includes(label.tone)
      ||!['preview','played','unspecified'].includes(label.experience))))throw new Error('Review every source label and play context');
  const citations=decision.commentIds.map((id,i)=>{
    const evidence=draft.evidence?.find(e=>e.id===id),current=comments.find(c=>c.id===id);
    const postId=String(current?.link_id||'').replace(/^t3_/,'');
    if(!evidence||!current||!game.posts.some(p=>p.id===postId)||typeof current.body!=='string'||current.body.slice(0,1800)!==evidence.body
      ||current.author!==evidence.author||current.author.toLowerCase()===game.author.name.toLowerCase()
      ||/^(?:\[(?:deleted|removed)\]|automoderator)$/i.test(current.author)||/^\[(deleted|removed)\]$/i.test(current.body.trim())
      ||current.removed_by_category||!Number.isFinite(current.created_utc)||current.created_utc*1000!==Date.parse(evidence.createdAt)||current.created_utc*1000<Date.parse(draft.windowStart)||current.created_utc*1000>Date.parse(draft.windowEnd)
      ||evidence.url!==`https://www.reddit.com/r/aigamedev/comments/${postId}/_/${id}/`)throw new Error('Source changed, missing or outside this project: '+id);
    const label=decision.labels?.[i];
    const retrieved=typeof current.retrieved_on==='number'&&current.retrieved_on>=1104537600&&current.retrieved_on*1000<=Date.parse(checkedAt)+30000?new Date(current.retrieved_on*1000).toISOString():null;
    return {number:i+1,url:evidence.url,author:evidence.author,body:evidence.body,createdAt:evidence.createdAt,source:'reddit',...(retrieved?{archiveRetrievedAt:retrieved}:{}),
      theme:label?.theme||null,tone:label?.tone||null,experience:label?.experience||'unspecified'};
  });
  return {version:2,summary:decision.summary,citations,windowStart:draft.windowStart,windowEnd:draft.windowEnd,sampled:draft.sampled,
    model:draft.model,classifiedComments:draft.classifiedComments,reviewedComments:citations.length,editorialReview:{checkedAt,method:'Source-checked editorial selection'}};
}
