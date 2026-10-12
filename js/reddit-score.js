import { escHtml as e } from './utils.js';
import { dateLabel } from './collection.js';

export function redditScoreBadge(game) {
  const value = game.redditScore;
  if (!value) return '';
  const count = new Intl.NumberFormat('en-US').format(value.score);
  const when = value.observedAt ? `Archived ${dateLabel(value.observedAt)}.` : `Archive observation date unavailable; checked ${dateLabel(value.checkedAt)}.`;
  const description = `Highest Reddit post score: ${count}. ${when} Scores available for ${value.coveredPosts} of ${value.totalPosts} source posts. Net score, not a Playtrace rating or a live upvote count.`;
  return `<a class="reddit-score" href="${e(value.url)}" target="_blank" rel="noopener noreferrer" aria-label="${e(description)} Opens Reddit in a new tab."><span aria-hidden="true">↑</span> ${e(count)}<span class="reddit-score__source">Reddit</span><span class="reddit-score__tooltip" aria-hidden="true">${e(description)}</span></a>`;
}

export function bindRedditScoreTooltips(root) {
  root.ownerDocument.addEventListener('keydown', event => {
    if (event.key !== 'Escape') return;
    const visible = [...root.querySelectorAll('.reddit-score:not([data-tooltip-dismissed])')]
      .filter(link => link.matches(':hover, :focus-visible'));
    if (!visible.length) return;
    visible.forEach(link => { link.dataset.tooltipDismissed = ''; });
    event.preventDefault(); event.stopPropagation();
  });
  for (const name of ['pointerout', 'focusout']) root.addEventListener(name, event => {
    const link = event.target.closest('.reddit-score');
    if (link && !link.contains(event.relatedTarget) && !link.matches(':hover, :focus-visible')) delete link.dataset.tooltipDismissed;
  });
}
