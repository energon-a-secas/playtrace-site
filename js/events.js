import { bindInlineEditor, openInlineEditor, closeInlineEditor } from './inline-editor.js';
import { projectPath } from './project-url.js';
import { request } from './api.js';
import { bindMaker } from './maker-combobox.js';
import { bindExtras, loadExtras, closeExtras } from './project-extras.js';
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
  navigation.push(() => { state.query = ''; state.category = 'all'; state.platform = 'all'; state.stage = 'all'; state.author = ''; state.following = document.body.dataset.page === 'profile'; });
  render(); $('searchInput').focus();
}
function applyFilter(key, value) { navigation.push(() => { state[key] = value; }); render(); }

let resolvingGame = '';
export function syncDetail() {
  if (!state.loaded) return;
  const game = state.games.find(entry => entry.id === state.game);
  if (!state.game) { if ($('itemDialog').open) $('itemDialog').close(); return; }
  if (!game) {
    if (state.catalogPartial || state.status === 'loading') return;
    if (resolvingGame !== state.game) {
      const missing = state.game; resolvingGame = missing;
      request(`/games/${missing}/resolve`).then(result => {
        if (state.game !== missing) return;
        if (result.redirected && state.games.some(entry => entry.id === result.gameId)) { state.game = result.gameId; navigation.replace(); syncDetail(); }
        else { state.game = ''; navigation.replace(); showToast('This project is no longer in the collection.'); }
      }).catch(() => { if(state.game===missing){ state.game=''; navigation.replace(); showToast('This project is no longer in the collection.'); } });
      return;
    }
    return;
  }
  if (state.detail?.id === game.id && $('itemDialog').open) {
    if (state.detail !== game && JSON.stringify(state.detail) !== JSON.stringify(game)) {
      renderDetail(game); prepareProject(game); loadExtras(game); resetFeedback(game.id); loadFeedback(game.id);
    }
    return;
  }
  renderDetail(game); prepareProject(game); loadExtras(game); resetFeedback(game.id); openDialog($('itemDialog'), $('searchInput')); loadFeedback(game.id); document.dispatchEvent(new CustomEvent('game-viewed',{detail:{gameId:game.id}}));
  const intent=new URL(location.href).searchParams;
  if(intent.get('change')==='1')$('requestChange').click();
  if(intent.get('edit')==='1'&&state.isAdmin)openInlineEditor();
}

export function catalogueReady() { render(); syncDetail(); }

export function bindEvents() {
  document.addEventListener('playtrace:admin-ready',()=>{if(new URL(location.href).searchParams.get('edit')==='1'&&state.detail)openInlineEditor();});
  bindInlineEditor(); bindFeedback(); bindProject(); bindExtras(); bindMaker(value => applyFilter('author', value));
  const dialog = $('itemDialog');
  bindDialog(dialog, $('searchInput')); bindDialog($('infoDialog'), $('searchInput'));
  dialog.addEventListener('close', () => {
    closeInlineEditor(); clearChallenge(); clearSignals(); clearFeedback(); closeProject(); closeExtras(); state.detail = null;
    if (state.game) { state.game = ''; navigation.replace(); }
  });
  $('infoDialog').addEventListener('close', () => { $('deleteConfirm').hidden = true; });
  $('collectionFilters').addEventListener('submit', event => { event.preventDefault(); navigation.replace(); });
  $('searchInput').addEventListener('input', event => { state.query = event.target.value; render(); navigation.schedule(); });
  for (const [id, key] of [['categorySelect', 'category'], ['platformSelect', 'platform'], ['sortSelect', 'sort']]) {
    $(id).addEventListener('change', event => applyFilter(key, event.target.value));
  }
  document.addEventListener('click', async event => {
    const favorite = event.target.closest('[data-favorite]');
    if (favorite) { followGame(favorite, favorite.dataset.favorite); return; }
    const edit = event.target.closest('[data-edit-project]');
    if (edit) { navigation.push(() => { state.game = edit.dataset.editProject; }); syncDetail(); openInlineEditor(); return; }
    const genre = event.target.closest('button[data-category]');
    if (genre) {
      applyFilter('category', genre.dataset.category);
      $('categorySelect').focus({ preventScroll: true }); $('discover').scrollIntoView({ block: 'start' }); return;
    }
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
      navigation.push(() => { state.author = author.dataset.author; state.game = ''; state.query = ''; state.following = document.body.dataset.page === 'profile'; });
      if (dialog.open) dialog.close(); render();
      requestAnimationFrame(() => $('authorSelect').focus());
      $('discover').scrollIntoView({ block: 'start', behavior: 'instant' }); return;
    }
    const item = event.target.closest('[data-item]');
    if (item) {
      if (event.ctrlKey || event.metaKey || event.shiftKey || event.altKey || event.button) return;
      event.preventDefault();
      const game = state.games.find(entry => entry.id === item.dataset.item);
      if (!game) return;
      navigation.push(() => { state.game = game.id; });
      renderDetail(game); prepareProject(game); loadExtras(game); resetFeedback(game.id); openDialog(dialog, item); loadFeedback(game.id); document.dispatchEvent(new CustomEvent('game-viewed',{detail:{gameId:game.id}})); return;
    }
    if (event.target.closest('[data-open-info]')) { openDialog($('infoDialog'), event.target.closest('button')); return; }
    if (event.target.closest('#shareGame')) {
      const projectLink = new URL(projectPath(state.game), location.origin); const copied = await copyText(projectLink.href);
      showToast(copied ? 'Project link copied.' : 'Could not copy. Copy the address from your browser.');
    }
  });
  for (const id of ['clearFilters', 'emptyReset']) $(id).addEventListener('click', clearFilters);
  for (const id of ['retryCollection']) $(id).addEventListener('click', () => {
    $('searchInput').focus(); loadCatalog(catalogueReady); loadService(() => { render(); renderFeedback(); });
  });
  $('followingFilter').addEventListener('click', async event => {
    if (document.body.dataset.page === 'profile') return;
    if (state.following) { applyFilter('following', false); return; }
    if (await prepareFollowing(event.currentTarget)) applyFilter('following', true);
  });
  $('profileSignIn')?.addEventListener('click', async event => { await prepareFollowing(event.currentTarget); render(); });
  $('followGame').addEventListener('click', event => followGame(event.currentTarget));
  $('showMoreGames').addEventListener('click', () => {
    const previous = $('itemList').children.length;
    state.visibleLimit = (state.visibleLimit || 60) + 60; render();
    $('itemList').children[previous]?.querySelector('.card-open')?.focus({ preventScroll: true });
  });
  $('deleteMyData').addEventListener('click', event => deleteMyData(event.currentTarget));
  $('confirmDelete').addEventListener('click', confirmDelete);
  $('cancelDelete').addEventListener('click', () => { $('deleteConfirm').hidden = true; $('deleteMyData').focus(); });
  document.addEventListener('error', event => {
    if (event.target.tagName === 'IMG') event.target.closest('.game-image')?.classList.add('game-image--missing');
  }, true);
  navigation.listen(() => { restoreLocation(); render(); syncDetail(); });
}
