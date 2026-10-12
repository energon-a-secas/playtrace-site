import { escHtml as e } from './utils.js';
import { safeUrl } from './collection.js';
import { projectPath } from './project-url.js';

export function highlightPanels(items) {
  return items.slice(0, 5).map(({game}, index) => {
    const url = safeUrl(game.preview.posterUrl || (game.preview.kind === 'image' ? game.preview.url : null), true);
    return `<li><a class="showcase-game" href="${projectPath(game)}"><div class="showcase-art">${url ? `<img src="${e(url)}" alt="" width="720" height="960" decoding="async" ${index === 0 ? 'fetchpriority="high"' : 'loading="lazy"'} referrerpolicy="no-referrer">` : ''}</div><span class="showcase-number" aria-hidden="true">0${index + 1}</span><div class="showcase-caption"><span class="showcase-maker">u/${e(game.author.name)}</span><h3>${e(game.title)}</h3><span class="showcase-explore">Explore project <span aria-hidden="true">↗</span></span></div></a></li>`;
  }).join('');
}
