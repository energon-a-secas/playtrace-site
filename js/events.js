import { state, restoreLocation, saveView, loadCatalog, loadService } from './state.js';
import { locationForState } from './collection.js';
import { render, renderDetail } from './render.js';
import { $, copyText, showToast } from './utils.js';
import { bindDialog, openDialog } from './dialogs.js';
import { createQueryHistory } from './neorgon-navigation.js';
import { prepareFollowing, followGame, deleteMyData, confirmDelete, clearSignals } from './accounts.js';
import { clearChallenge } from './challenge.js';
import { bindFeedback, resetFeedback, loadFeedback, clearFeedback, renderFeedback } from './feedback.js';
import { bindProject, prepareProject, closeProject } from './project.js';

export const navigation = createQueryHistory(href => locationForState(href, state));
function clearFilters() {
  navigation.push(() => { state.query = ''; state.category = 'all'; state.stage = 'all'; state.author = ''; state.following = false; });
  render(); $('searchInput').focus();
}
function applyFilter(key, value) { navigation.push(() => { state[key] = value; }); render(); }

export function syncDetail() {
  if (!state.loaded) return;
  const game = state.games.find(entry => entry.id === state.game);
  if (!state.game) { if ($('itemDialog').open) $('itemDialog').close(); return; }
  if (!game) {
    if (state.catalogPartial || state.status === 'loading') return;
    state.game = ''; state.detail = null; clearSignals(); clearChallenge();
    if ($('itemDialog').open) $('itemDialog').close();
    navigation.replace(); showToast('This project is no longer in the collection.'); return;
  }
  if (state.detail?.id === game.id && $('itemDialog').open) {
    if (state.detail !== game && JSON.stringify(state.detail) !== JSON.stringify(game)) {
      renderDetail(game); prepareProject(game); resetFeedback(game.id); loadFeedback(game.id);
    }
    return;
  }
  renderDetail(game); prepareProject(game); resetFeedback(game.id); openDialog($('itemDialog'), $('searchInput')); loadFeedback(game.id);
}

export function catalogueReady() { render(); syncDetail(); }

export function bindEvents() {
  bindFeedback(); bindProject();
  const dialog = $('itemDialog');
  bindDialog(dialog, $('searchInput')); bindDialog($('infoDialog'), $('searchInput'));
  dialog.addEventListener('close', () => {
    clearChallenge(); clearSignals(); clearFeedback(); closeProject(); state.detail = null;
    if (state.game) { state.game = ''; navigation.replace(); }
  });
  $('infoDialog').addEventListener('close', () => { $('deleteConfirm').hidden = true; });
  $('collectionFilters').addEventListener('submit', event => { event.preventDefault(); navigation.replace(); });
  $('searchInput').addEventListener('input', event => { state.query = event.target.value; render(); navigation.schedule(); });
  for (const [id, key] of [['categorySelect', 'category'], ['sortSelect', 'sort'], ['authorSelect', 'author']]) {
    $(id).addEventListener('change', event => applyFilter(key, event.target.value));
  }
  document.addEventListener('click', async event => {
    const stage = event.target.closest('button[data-stage], button[data-stage-target]');
    if (stage) {
      const value = stage.dataset.stage || stage.dataset.stageTarget;
      applyFilter('stage', value);
      if (stage.dataset.stageTarget) {
        document.querySelector(`.stage-tabs button[data-stage="${value}"]`)?.focus({ preventScroll: true });
        $('discover').scrollIntoView({ block: 'start' });
      }
      return;
    }
    const view = event.target.closest('button[data-view]');
    if (view) { applyFilter('view', view.dataset.view); if (!saveView()) showToast('Layout changed for this visit. Your browser could not save it.'); return; }
    const author = event.target.closest('button[data-author]');
    if (author) {
      navigation.push(() => { state.author = author.dataset.author; state.game = ''; state.query = ''; state.following = false; });
      if (dialog.open) dialog.close(); render();
      requestAnimationFrame(() => $('authorSelect').focus());
      $('discover').scrollIntoView({ block: 'start', behavior: 'instant' }); return;
    }
    const item = event.target.closest('button[data-item]');
    if (item) {
      const game = state.games.find(entry => entry.id === item.dataset.item);
      if (!game) return;
      navigation.push(() => { state.game = game.id; });
      renderDetail(game); prepareProject(game); resetFeedback(game.id); openDialog(dialog, item); loadFeedback(game.id); return;
    }
    if (event.target.closest('[data-open-info]')) { openDialog($('infoDialog'), event.target.closest('button')); return; }
    if (event.target.closest('#shareGame')) {
      navigation.replace(); const copied = await copyText(locationForState(location.href, state).href);
      showToast(copied ? 'Project link copied.' : 'Could not copy. Copy the address from your browser.');
    }
  });
  for (const id of ['clearFilters', 'emptyReset']) $(id).addEventListener('click', clearFilters);
  for (const id of ['refreshCollection', 'retryCollection']) $(id).addEventListener('click', () => {
    $('searchInput').focus(); loadCatalog(catalogueReady); loadService(() => { render(); renderFeedback(); });
  });
  $('shareView').addEventListener('click', async () => {
    navigation.replace(); const copied = await copyText(locationForState(location.href, state).href);
    showToast(copied ? 'Link copied with your filters and layout.' : 'Could not copy. Copy the address from your browser.');
  });
  $('followingFilter').addEventListener('click', async event => {
    if (state.following) { applyFilter('following', false); return; }
    if (await prepareFollowing(event.currentTarget)) applyFilter('following', true);
  });
  $('followGame').addEventListener('click', event => followGame(event.currentTarget));
  $('showMoreGames').addEventListener('click', () => {
    const previous = $('itemList').children.length;
    state.visibleLimit = (state.visibleLimit || 60) + 60; render();
    $('itemList').children[previous]?.querySelector('button')?.focus({ preventScroll: true });
  });
  $('deleteMyData').addEventListener('click', event => deleteMyData(event.currentTarget));
  $('confirmDelete').addEventListener('click', confirmDelete);
  $('cancelDelete').addEventListener('click', () => { $('deleteConfirm').hidden = true; $('deleteMyData').focus(); });
  document.addEventListener('error', event => {
    if (event.target.tagName === 'IMG') event.target.closest('.game-image')?.classList.add('game-image--missing');
  }, true);
  navigation.listen(() => { restoreLocation(); render(); syncDetail(); });
}
