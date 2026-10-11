import { createStore } from './neorgon-persist.js';
import { defaults, readLocation, validateCatalog } from './collection.js';
import { apiConfigured, request } from './api.js';
const preferences = createStore({ key: 'playtrace-site:collection', version: 1 });
export const state = { ...defaults, games: [], catalog: null, status: 'loading', loaded: false, error: '', visibleLimit: 60, catalogPartial: false, catalogTotal: null,
  isAdmin: false, service: null, serviceError: '', signedIn: false, userId: null, follows: [], prices: [], accountLoaded: false,
  accountError: '', detail: null, detailSignals: null, detailSignalError: '', accountBusy: false };
export function restoreLocation() {
  Object.assign(state, readLocation(location.href, preferences.load({})?.view === 'list' ? 'list' : 'grid'));
  if (document.body.dataset.page === 'profile') state.following = true;
}
export function saveView() { return preferences.save({ view: state.view }); }
let requestNumber = 0;
let activeRequest;
export async function loadCatalog(render) {
  const number = ++requestNumber;
  activeRequest?.abort(); activeRequest = new AbortController();
  const controller = activeRequest;
  const timer = setTimeout(() => controller.abort(), 60000);
  // First visits render each page immediately. A refresh of a complete archive
  // is replaced atomically so an open project is not mistaken for a removal.
  const progressive = !state.loaded || state.catalogPartial;
  state.status = 'loading'; state.error = ''; render();
  try {
    let value;
    if (apiConfigured) {
      const pages = [], seen = new Set(), gameIds = new Set(), postIds = new Set();
      let cursor = '', revision, total;
      do {
        const page = validateCatalog(await request(`/catalog?pageSize=200${cursor ? `&cursor=${encodeURIComponent(cursor)}` : ''}`, { signal: controller.signal }));
        if (number !== requestNumber) return;
        if (page.pagination !== undefined && (!page.pagination || typeof page.pagination !== 'object'
          || (page.pagination.nextCursor !== null && (typeof page.pagination.nextCursor !== 'string' || !page.pagination.nextCursor)))) throw new Error('The archive page could not be read. Please try again.');
        if (revision && page.generatedAt !== revision) throw new Error('The archive changed while loading. Please refresh for the latest collection.');
        revision = page.generatedAt;
        const count = page.pagination?.total ?? page.games.length;
        if (!Number.isInteger(count) || count < 0 || (total !== undefined && count !== total)) throw new Error('The archive changed while loading. Please refresh for the latest collection.');
        total = count;
        for (const game of page.games) {
          if (gameIds.has(game.id) || game.posts.some(post => postIds.has(post.id))) throw new Error('The archive changed while loading. Please refresh for the latest collection.');
          gameIds.add(game.id); game.posts.forEach(post => postIds.add(post.id));
        }
        pages.push(...page.games);
        value = { ...page, games: [...pages] };
        cursor = page.pagination?.nextCursor ?? '';
        if (cursor && (typeof cursor !== 'string' || cursor.length > 200 || seen.has(cursor))) throw new Error('The next archive page could not be read. Please try again.');
        if (pages.length > total || (cursor && !page.games.length) || (!cursor && pages.length !== total)) throw new Error('The archive page was incomplete. Please try again.');
        if (cursor) seen.add(cursor);
        if (progressive) {
          state.catalog = value; state.games = value.games; state.loaded = true;
          if (state.category !== 'all' && !value.categories.some(category=>category.id===state.category)) state.category='all';
          state.catalogTotal = total; state.catalogPartial = Boolean(cursor); render();
        }
      } while (cursor);
    }
    else {
      const response = await fetch('data/catalog.json', { signal: controller.signal, cache: 'no-cache' });
      if (!response.ok) throw new Error('The collection could not be loaded. Please try again.');
      value = await response.json();
    }
    const catalog = validateCatalog(value);
    if (number !== requestNumber) return;
    state.catalog = catalog; state.games = catalog.games; state.loaded = true; state.status = 'ready';
    if (state.category !== 'all' && !catalog.categories.some(category=>category.id===state.category)) state.category='all';
    state.catalogTotal = catalog.games.length; state.catalogPartial = false;
  } catch (error) {
    if (number !== requestNumber) return;
    state.status = 'error'; state.error = error.name === 'AbortError' ? 'The collection took too long to load. Please try again.' : error.message;
  } finally { clearTimeout(timer); if (number === requestNumber) render(); }
}
export async function loadService(render) {
  if (!apiConfigured) { state.serviceError = 'Account features are coming soon.'; render(); return; }
  try { state.service = await request('/status'); state.serviceError = ''; }
  catch { state.service = null; state.serviceError = 'Account features are temporarily unavailable.'; }
  render();
}
