import { escHtml as e } from './utils.js';
import { safeUrl, distributionFor } from './collection.js';
import { projectPath } from './project-url.js';
import { icon } from './icons.js';
import { demoPlayUrl } from './steam-demo.js';

export function highlightPanels(items, editorPick = null) {
  const selection = items.slice(0, 5).filter(item => item.game && item.game.id !== editorPick?.game?.id);
  if (editorPick?.game) selection.push({ ...editorPick, editorial: true });
  return selection.map(({game, editorial}, index) => {
    const url = safeUrl(game.preview.posterUrl || (game.preview.kind === 'image' ? game.preview.url : null), true);
    const destination = distributionFor(game.projectUrl);
    const demoUrl=demoPlayUrl(game),playText=demoUrl?'Play demo':'Play';
    const playable = destination && destination.kind !== 'repository' && game.availability?.status !== 'broken'
      && (destination.id !== 'steam' || game.steam?.state === 'released' || demoUrl);
    return `<li style="--panels:${selection.length}"${editorial ? ' class="showcase-editor"' : ''}>
      <article class="showcase-game" aria-labelledby="highlight-${e(game.id)}">
        <div class="showcase-art">${url ? `<img src="${e(url)}" alt="" width="720" height="960" decoding="async" ${index === 0 ? 'fetchpriority="high"' : 'loading="lazy"'} referrerpolicy="no-referrer">` : ''}</div>
        <div class="showcase-caption">
          ${editorial ? '<span class="showcase-editor-label">Editor’s pick</span>' : ''}
          <span class="showcase-maker">u/${e(game.author.name)}</span>
          <h3 id="highlight-${e(game.id)}">${e(game.title)}</h3>
          <div class="showcase-actions">
            <a class="showcase-project" href="${projectPath(game)}" aria-label="Check Project: ${e(game.title)}"><span class="showcase-action-face">Check Project</span></a>
            ${playable ? `<a class="showcase-play" href="${e(demoUrl||destination.url)}" target="_blank" rel="noopener noreferrer" data-game-outbound="${e(game.id)}" aria-label="${playText}: ${e(game.title)} (opens in a new tab)" title="${playText}: ${e(game.title)} in a new tab"><span class="showcase-action-face">${icon('play')}${playText}</span></a>` : ''}
          </div>
        </div>
      </article>
    </li>`;
  }).join('');
}
