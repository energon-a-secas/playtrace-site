import { request } from './api.js';
import { NeoAuth } from './neorgon-auth.js';
import { state } from './state.js';
import { $, escHtml as e } from './utils.js';
import { validateCatalog, categoryChoices } from './collection.js';
import { render, renderDetail } from './render.js';

let run = 0, record = null, busy = false;
const fields = { title: 'inlineTitle', summary: 'inlineSummary', projectUrl: 'inlineUrl', repositoryUrl: 'inlineRepository', category: 'inlineCategory', stage: 'inlineStage', platforms: 'inlinePlatforms', tags: 'inlineTags' };
async function adminRequest(path, options = {}) {
  const user = NeoAuth.state.userId;
  if (!state.isAdmin || !NeoAuth.state.signedIn) throw new Error('Sign in with an admin account to edit this project.');
  const token = await NeoAuth.state.clerk?.session?.getToken();
  if (!token || user !== NeoAuth.state.userId) throw new Error('Your session changed. Sign in again.');
  const value = await request(path, { ...options, token });
  if (!state.isAdmin || !NeoAuth.state.signedIn || user !== NeoAuth.state.userId) throw new Error('Your session changed. Sign in again.');
  return value;
}
export function closeInlineEditor() {
  run++; record = null; busy = false;
  $('inlineProjectEditor').hidden = true;
  $('inlineProjectForm').reset(); $('inlineEditorMessage').textContent = '';
}
function categories(selected) {
  $('inlineCategory').innerHTML = categoryChoices({ categories: record.categories }).map(category => `<option value="${e(category.id)}">${e(category.label)}</option>`).join('') + '<option value="__add__">＋ Add a category…</option>';
  $('inlineCategory').value = selected;
}
export async function openInlineEditor() {
  if (!state.isAdmin || !state.detail) return;
  const version = ++run, id = state.detail.id;
  $('quickImagePanel').hidden = true;
  $('inlineProjectEditor').hidden = false;
  $('inlineFields').disabled = true; $('inlineEditorMessage').textContent = 'Loading saved details…';
  $('inlineReload').hidden = true; $('inlineCategoryAdd').hidden = true;
  $('inlineProjectEditor').scrollIntoView({ block: 'start' });
  try {
    const value = await adminRequest(`/admin/games/${id}`);
    if (version !== run || state.detail?.id !== id) return;
    record = value; categories(value.game.category);
    for (const [key, field] of Object.entries(fields)) $(field).value = Array.isArray(value.game[key]) ? value.game[key].join(', ') : value.game[key] || '';
    $('inlineFields').disabled = false; $('inlineEditorMessage').textContent = 'Edits are kept when new source posts arrive.';
    $('inlineTitle').focus({ preventScroll: true });
  } catch (error) { if (version === run) { $('inlineEditorMessage').textContent = error.message; $('inlineReload').hidden = false; } }
}
export function bindInlineEditor() {
  $('editProject').addEventListener('click', openInlineEditor);
  $('inlineCancel').addEventListener('click', () => { closeInlineEditor(); $('editProject').focus(); });
  $('inlineReload').addEventListener('click', openInlineEditor);
  $('inlineCategory').addEventListener('change', () => {
    const add = $('inlineCategory').value === '__add__'; $('inlineCategoryAdd').hidden = !add;
    if (add) $('inlineCategoryName').focus();
  });
  $('inlineAddCategory').addEventListener('click', async () => {
    if (busy || !record) return;
    const version = run; busy = true; $('inlineAddCategory').disabled = true;
    try {
      const value = await adminRequest('/admin/categories', { method: 'POST', body: { label: $('inlineCategoryName').value.trim() } });
      if (version !== run) return;
      record.categories = value.categories; categories(value.category.id); $('inlineCategoryAdd').hidden = true;
      state.catalog.categories = value.categories; $('inlineEditorMessage').textContent = 'Category added to the shared list. Save the project to use it here.';
    } catch (error) { if (version === run) $('inlineEditorMessage').textContent = error.message; }
    finally { busy = false; $('inlineAddCategory').disabled = false; }
  });
  $('inlineProjectForm').addEventListener('submit', async event => {
    event.preventDefault(); if (busy || !record) return;
    const version = run, id = record.game.id;
    if ($('inlineCategory').value === '__add__') { $('inlineEditorMessage').textContent = 'Add your new category or choose an existing one.'; return; }
    busy = true; $('inlineFields').disabled = true; $('inlineEditorMessage').textContent = 'Saving project…';
    try {
      const details = Object.fromEntries(Object.entries(fields).map(([key, field]) => {
        const value = $(field).value.trim();
        return [key, ['tags', 'platforms'].includes(key) ? value.split(',').map(part => part.trim()).filter(Boolean) : ['projectUrl', 'repositoryUrl'].includes(key) ? value || null : value];
      }));
      const value = await adminRequest(`/admin/games/${id}/details`, { method: 'PUT', body: { mode: 'edit', revision: record.detailsRevision, details } });
      if (version !== run || state.detail?.id !== id) return;
      const game = validateCatalog({ ...state.catalog, categories: value.categories, games: [value.game] }).games[0];
      state.catalog.categories = value.categories; state.games = state.games.map(entry => entry.id === id ? game : entry);
      render(); renderDetail(game); closeInlineEditor(); $('editProject').focus();
      const { showToast } = await import('./utils.js'); showToast('Project details saved.');
    } catch (error) { if (version === run) { $('inlineEditorMessage').textContent = error.message; $('inlineReload').hidden = error.status !== 409; } }
    finally { if (version === run) { busy = false; $('inlineFields').disabled = false; } }
  });
}
