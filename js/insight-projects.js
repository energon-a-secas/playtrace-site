import { escHtml as e } from './utils.js';
import { projectPath } from './project-url.js';
import { dateLabel } from './collection.js';

export function projectRows(games, { dimension, value } = {}) {
  return games.map(game => {
    const posts = [...(game.observations || [])].sort((a,b)=>b.at.localeCompare(a.at));
    const post = posts.find(p => dimension && (p[dimension] || []).includes(value)) || posts[0];
    const quote = post?.evidence?.find(item => item.kind === dimension && item.label === value);
    return `<li><div><a class="insight-project-title" href="${projectPath(game)}">${e(game.title)}</a><p>${e(game.distribution || 'No linked platform')} · ${e(game.stage || 'Unspecified stage')}${post ? ` · ${e(dateLabel(post.at))}` : ''}</p>${quote ? `<blockquote>“${e(quote.text)}”</blockquote>` : ''}</div><div class="insight-project-actions"><a href="${projectPath(game)}">Check project</a>${post ? `<a href="${e(post.url)}" target="_blank" rel="noopener noreferrer">Read source ↗</a>` : ''}</div></li>`;
  }).join('');
}
export function renderProjectList(root, games, { title = 'Matching projects', dimension, value, focus = false } = {}) {
  let limit = 12;
  const paint = () => {
    root.hidden = false;
    root.innerHTML = `<div class="insight-result-heading"><h4 tabindex="-1">${e(title)}</h4><span>${games.length} ${games.length === 1 ? 'project' : 'projects'}</span></div><ul class="insight-project-list">${projectRows(games.slice(0,limit),{dimension,value}) || '<li>No matching projects. Try another filter.</li>'}</ul>${games.length > limit ? '<button class="btn btn--secondary" type="button" data-projects-more>Show more projects</button>' : ''}`;
  };
  root.onclick = event => { if (event.target.closest('[data-projects-more]')) { limit += 12; paint(); root.querySelector('[data-projects-more]')?.focus({preventScroll:true}); } };
  paint(); if (focus) root.querySelector('h4').focus({preventScroll:true});
}

// One tooltip behavior for pointer, touch selection and keyboard chart controls.
export function bindChart(root, select) {
  if (root.dataset.chartBound) return;
  root.dataset.chartBound = 'true';
  const show = event => {
    const target = event.target.closest?.('[data-chart-value]');
    const tip = root.querySelector('[data-chart-tooltip]');
    if (!target || !tip) return;
    tip.textContent = target.dataset.chartLabel; tip.hidden = false;
  };
  root.addEventListener('pointerover', show); root.addEventListener('focusin', show);
  const hide = () => { const tip=root.querySelector('[data-chart-tooltip]'); if(tip)tip.hidden=true; };
  root.addEventListener('pointerleave', hide); root.addEventListener('focusout', event => { if(!root.contains(event.relatedTarget))hide(); });
  root.addEventListener('keydown', event => {
    if(event.key === 'Escape')hide();
    if(['Enter',' '].includes(event.key) && event.target.matches('[data-chart-value]:not(button)')) { event.preventDefault(); event.target.dispatchEvent(new MouseEvent('click',{bubbles:true})); }
  });
  root.addEventListener('click', event => {
    const target = event.target.closest?.('[data-chart-value]');
    if(target){show(event);select(target.dataset.chartValue,target);}
  });
}
