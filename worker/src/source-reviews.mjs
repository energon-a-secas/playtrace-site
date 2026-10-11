import reviews from '../../data/current-showcase-review.json' with { type: 'json' };
import { PROJECT_FLAIR } from './source-policy.mjs';
import { sourceUrl } from './validation.mjs';

// These are explicit, dated operator reviews of current public Reddit pages.
// They only supersede the exact older archive observation that was reviewed.
// A new archive observation, deleted prose or changed identity needs review.
export function reviewedSource(raw,now,checks=reviews.currentSourceChecks) {
  const check=checks.find(item=>item.id===raw.id);
  const checked=Date.parse(check?.checkedAt),archived=typeof raw.retrieved_on==='number'?raw.retrieved_on*1000:NaN;
  if(!check||!Number.isFinite(checked)||checked>now||!Number.isFinite(archived)||archived>checked
    ||check.url!==sourceUrl(raw.id)||check.author!==raw.author||check.title!==raw.title
    ||check.flair!==PROJECT_FLAIR||check.availability!=='public'
    ||check.archived?.flair!==raw.link_flair_text||(check.archived?.removedByCategory??null)!==(raw.removed_by_category??null)
    ||raw.removed_by||raw.banned_by||raw.removed===true||/^\[(deleted|removed)\]$/i.test(raw.selftext||''))return {raw,review:null};
  return {raw:{...raw,link_flair_text:check.flair,removed_by_category:null},review:check};
}
