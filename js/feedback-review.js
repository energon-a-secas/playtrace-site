import { escHtml as e } from './utils.js';
import { safeUrl, dateLabel } from './collection.js';

export function revealReviewSource(root) {
  const hash=globalThis.location?.hash || '';
  const target=/^#review-source-\d+$/.test(hash)?root?.querySelector(hash):hash==='#pageReview'&&root?.id==='pageReview'?root:null;
  if(!target)return;
  const disclosure=target.closest('details');if(disclosure)disclosure.open=true;
  requestAnimationFrame(()=>target.scrollIntoView({block:'center'}));
}

export function reviewMarkup(review, { heading = 'h3', prefix = 'review-source' } = {}) {
  if(!review?.summary || !review.citations?.length)return '';
  const citations=new Map(review.citations.map(citation=>[citation.number,citation]));
  const summary=e(review.summary).replace(/\[(\d+)\]/g,(match,n)=>citations.has(Number(n))?`<a href="#${prefix}-${n}">[${n}]</a>`:match);
  const reddit=review.citations.filter(citation=>citation.source!=='playtrace').length,playtrace=review.citations.length-reddit;
  const coverage=[reddit?`${reddit} cited Reddit ${reddit===1?'comment':'comments'}`:'',playtrace?`${playtrace} cited Playtrace ${playtrace===1?'note':'notes'}`:''].filter(Boolean).join(' · ');
  return `<p class="eyebrow">COMMUNITY FIELD NOTES</p><${heading}>From the conversation</${heading}><p>${summary}</p>
    <p class="field__hint">Reviewed summary · ${e(coverage)} · ${e(dateLabel(review.windowStart))}–${e(dateLabel(review.windowEnd))}${review.sampled?' · Bounded sample':''}. Citations are comments, not unique players.</p>
    <details><summary>Read the ${review.citations.length} cited ${review.citations.length===1?'contribution':'contributions'}</summary><ol>${review.citations.map(citation=>`<li id="${prefix}-${citation.number}"><a href="${e(safeUrl(citation.url))}" target="_blank" rel="noopener noreferrer">[${citation.number}] ${citation.source==='playtrace'?e(citation.author):`u/${e(citation.author)}`} · ${citation.source==='playtrace'?'Playtrace':'Reddit'} ↗</a><blockquote>${e(citation.body)}</blockquote>${citation.experience?`<p class="field__hint">${citation.experience==='played'?'Reported play experience; not independently verified':citation.experience==='preview'?'First-look impression':'Experience not specified'}</p>`:''}</li>`).join('')}</ol></details>`;
}
