import { escHtml as e } from './utils.js';
import { safeUrl } from './collection.js';
import { projectPath } from './project-url.js';

export function highlightPanels(items, editorPick = null) {
  const selection = items.slice(0, 5).filter(item => item.game && item.game.id !== editorPick?.game?.id);
  if (editorPick?.game) selection.push({ ...editorPick, editorial: true });
  return selection.map(({game, editorial}, index) => {
    const url = safeUrl(game.preview.posterUrl || (game.preview.kind === 'image' ? game.preview.url : null), true);
    return `<li style="--panels:${selection.length}"${editorial ? ' class="showcase-editor"' : ''}><a class="showcase-game" href="${projectPath(game)}"><div class="showcase-art">${url ? `<img src="${e(url)}" alt="" width="720" height="960" decoding="async" ${index === 0 ? 'fetchpriority="high"' : 'loading="lazy"'} referrerpolicy="no-referrer">` : ''}</div><div class="showcase-caption">${editorial ? '<span class="showcase-editor-label">Editor’s pick</span>' : ''}<span class="showcase-maker">u/${e(game.author.name)}</span><h3>${e(game.title)}</h3><span class="showcase-explore">Explore project <span aria-hidden="true">↗</span></span></div></a></li>`;
  }).join('');
}
