import { createStore } from './neorgon-persist.js';
import { defaults, readLocation, validateCatalog } from './collection.js';
import { apiConfigured, request } from './api.js';
const preferences = createStore({ key: 'playtrace-site:collection', version: 1 });
export const state = { ...defaults, games: [], catalog: null, status: 'loading', loaded: false, error: '',
  service: null, serviceError: '', signedIn: false, userId: null, follows: [], prices: [], accountLoaded: false,
  accountError: '', detail: null, detailSignals: null, detailSignalError: '', accountBusy: false };
export function restoreLocation() {
  Object.assign(state, readLocation(location.href, preferences.load({})?.view === 'list' ? 'list' : 'grid'));
}
export function saveView() { return preferences.save({ view: state.view }); }
let requestNumber = 0;
let activeRequest;
export async function loadCatalog(render) {
  const number = ++requestNumber;
  activeRequest?.abort(); activeRequest = new AbortController();
  const controller = activeRequest;
  const timer = setTimeout(() => controller.abort(), 12000);
  state.status = 'loading'; state.error = ''; render();
  try {
    let value;
    if (apiConfigured) value = await request('/catalog', { signal: controller.signal });
    else {
      const response = await fetch('data/catalog.json', { signal: controller.signal, cache: 'no-cache' });
      if (!response.ok) throw new Error('The collection could not be loaded. Please try again.');
      value = await response.json();
    }
    const catalog = validateCatalog(value);
    if (number !== requestNumber) return;
    state.catalog = catalog; state.games = catalog.games; state.loaded = true; state.status = 'ready';
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
