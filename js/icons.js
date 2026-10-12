import { escHtml as e } from './utils.js';

const paths = {
  star: '<path d="m12 3 2.8 5.7 6.2.9-4.5 4.4 1.1 6.2-5.6-3-5.6 3 1.1-6.2L3 9.6l6.2-.9Z"/>',
  website: '<circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3c5 5 5 13 0 18-5-5-5-13 0-18Z"/>',
  edit: '<path d="m15 5 4 4M4 20l5-1L21 7a2.8 2.8 0 0 0-4-4L5 15l-1 5ZM13 20h8"/>',
  play: '<path d="m8 4 13 8-13 8Z"/>',
  gamepad: '<path d="M7 7h10a3 3 0 0 1 3 2l2 8a2.4 2.4 0 0 1-4 2l-3-3H9l-3 3a2.4 2.4 0 0 1-4-2l2-8a3 3 0 0 1 3-2Z"/><path d="M7 10v4m-2-2h4m7-1h.01m2 2h.01"/>',
};
export function icon(name) {
  const brand = { steam: 'steam', itch: 'itchdotio', reddit: 'reddit', github: 'github' }[name];
  return brand ? `<span class="brand-icon brand-icon--${brand}" aria-hidden="true"></span>`
    : `<svg class="ui-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${paths[name] || paths.website}</svg>`;
}
export function playLabel(game) {
  if (game.availability?.status === 'broken') return 'View game page';
  const platform = game.distribution?.id;
  if (platform === 'steam') return game.steam?.type === 'demo' && game.steam.state === 'released' ? 'Play demo' : 'View on Steam';
  if (platform === 'itch') return ['released', 'playable'].includes(game.stage) || game.availability?.playable ? 'Play on itch.io' : 'View on itch.io';
  if (game.distribution?.kind === 'repository') return 'Source code';
  return game.platforms.includes('Browser') && (['released', 'playable'].includes(game.stage) || game.availability?.playable) ? 'Play it' : 'View game';
}
export function playLink(game, compact = false) {
  if (!game.projectUrl) return '';
  const brand = game.distribution?.id || 'website', label = playLabel(game);
  return `<a class="${compact ? 'card-shortcut' : 'play-link'} brand-action" data-brand="${e(brand)}" data-game-outbound="${e(game.id)}" href="${e(game.projectUrl)}" target="_blank" rel="noopener noreferrer" aria-label="${e(label)}: ${e(game.title)} (opens in a new tab)" title="${e(label)}">${icon(brand === 'website' ? 'gamepad' : brand)}${compact ? '' : `<span>${e(label)}</span><span aria-hidden="true">↗</span>`}</a>`;
}
