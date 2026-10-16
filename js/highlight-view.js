import { escHtml as e } from './utils.js';
import { safeUrl, distributionFor } from './collection.js';
import { projectPath } from './project-url.js';
import { icon } from './icons.js';
import { demoPlayUrl } from './steam-demo.js';

function selectionFor(items, editorPick) {
  const selection = items.slice(0, 5).filter(item => item.game && item.game.id !== editorPick?.game?.id);
  if (editorPick?.game) selection.push({ ...editorPick, editorial: true });
  return selection;
}
const artwork = game => safeUrl(game.preview.posterUrl || (game.preview.kind === 'image' ? game.preview.url : null), true);

// All panels are above the fold on desktop; on phones only preload the first.
export function highlightImageHints(items, editorPick = null) {
  const seen = new Set();
  return selectionFor(items, editorPick).map(({game}, index) => {
    const url = artwork(game);
    if (!url || seen.has(url)) return '';
    seen.add(url);
    return `<link rel="preload" as="image" href="${e(url)}" referrerpolicy="no-referrer"${index ? ' media="(min-width: 901px)"' : ' fetchpriority="high"'}>`;
  }).join('\n');
}

export function highlightPanels(items, editorPick = null) {
  const selection = selectionFor(items, editorPick);
  return selection.map(({game, editorial}, index) => {
    const url = artwork(game);
    const destination = distributionFor(game.projectUrl);
    const demoUrl=demoPlayUrl(game),playText=demoUrl?'Play demo':'Play';
    const playable = destination && destination.kind !== 'repository' && game.availability?.status !== 'broken'
      && (destination.id !== 'steam' || game.steam?.state === 'released' || demoUrl);
    const signature = JSON.stringify([game.title, game.author.name, url, destination?.url, Boolean(playable), demoUrl, Boolean(editorial)]);
    return `<li data-highlight-id="${e(game.id)}" data-highlight-signature="${e(signature)}" style="--panels:${selection.length}"${editorial ? ' class="showcase-editor"' : ''}>
      <article class="showcase-game" aria-labelledby="highlight-${e(game.id)}">
        <div class="showcase-art">${url ? `<img src="${e(url)}" alt="" width="720" height="960" decoding="async" ${index === 0 ? 'loading="eager" fetchpriority="high"' : 'loading="lazy"'} referrerpolicy="no-referrer">` : ''}</div>
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

// Keep loaded artwork and keyboard focus when the live selection is unchanged.
export function updateHighlightPanels(wall, items, editorPick = null) {
  const template = document.createElement('template');
  template.innerHTML = highlightPanels(items, editorPick);
  const existing = new Map([...wall.children].map(panel => [panel.dataset.highlightId, panel]));
  const next = [...template.content.children].map(panel => {
    const previous = existing.get(panel.dataset.highlightId);
    return previous?.dataset.highlightSignature === panel.dataset.highlightSignature ? previous : panel;
  });
  for (const panel of [...wall.children]) if (!next.includes(panel)) panel.remove();
  next.forEach((panel, index) => {
    panel.style.setProperty('--panels', next.length);
    if (wall.children[index] !== panel) wall.insertBefore(panel, wall.children[index] || null);
  });
}
