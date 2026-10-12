import { NeoAuth } from './neorgon-auth.js';
import { CONFIG } from './config.js';
import { state } from './state.js';
import { request, apiConfigured } from './api.js';
import { parsePrice } from './collection.js';
import { priceChallenge, clearChallenge } from './challenge.js';
import { renderAccount, renderSignals } from './render.js';
import { $, showToast } from './utils.js';
import { favorites } from './favorites.js';

let rerender = () => {};
let accountRequest = 0;
let signalRequest = 0;
let deletingData = false;
let favoritesSync = null, favoritesUser = null;
const accountsReady = CONFIG.accountsReady === true;
export function startAccounts(render) {
  rerender = render;
  state.follows = favorites.ids(state.userId);
  globalThis.addEventListener?.('online', () => { if (state.signedIn) refreshMe(); });
  globalThis.addEventListener?.('storage', event => {
    if (!event.key?.startsWith('playtrace.favorites.v1:')) return;
    state.follows = favorites.ids(state.userId); rerender(); renderAccount();
    if (state.signedIn) syncLocalFavorites();
  });
  if (!accountsReady) {
    accountRequest++; state.signedIn = false; state.userId = null; state.follows = favorites.ids(null); state.prices = [];
    state.accountLoaded = false; state.accountBusy = false; $('deleteConfirm').hidden = true;
    clearChallenge(); render(); renderAccount(); return;
  }
  NeoAuth.onChange(auth => {
    const changed = state.userId !== auth.userId;
    state.signedIn = auth.signedIn; state.userId = auth.signedIn ? auth.userId : null;
    if (changed || !auth.signedIn) {
      accountRequest++; if (auth.signedIn) favorites.adoptGuest(auth.userId);
      state.follows = favorites.ids(state.userId); state.prices = []; state.accountLoaded = false; state.accountError = ''; state.isAdmin = false;
      if ($('priceAmount')) $('priceAmount').value = '';
      $('deleteConfirm').hidden = true; $('privacyMessage').textContent = '';
      if ($('priceMessage')) $('priceMessage').textContent = '';
      clearChallenge();
    }
    render(); renderAccount();
    if (auth.signedIn && apiConfigured) { refreshMe();
      const expected = auth.userId;
      freshToken(expected).then(token => request('/admin/me', { token })).then(() => { if (state.userId === expected) { state.isAdmin = true; rerender(); } }).catch(() => {});
    }
  });
  NeoAuth.start();
}

async function freshToken(expectedUser) {
  if (!accountsReady) throw new Error('Account features are not available yet.');
  if (!NeoAuth.state.signedIn || NeoAuth.state.userId !== expectedUser) throw new Error('Your account changed. Please try again.');
  const token = await NeoAuth.state.clerk?.session?.getToken();
  if (!token || NeoAuth.state.userId !== expectedUser) throw new Error('Please sign in again to continue.');
  return token;
}

export async function refreshMe() {
  if (!accountsReady || deletingData) return;
  const user = state.userId, number = ++accountRequest;
  try {
    const me = await request('/me', { token: await freshToken(user) });
    if (number !== accountRequest || state.userId !== user) return;
    if (!Array.isArray(me.follows) || !Array.isArray(me.prices)) throw new Error('Your account data could not be read.');
    state.follows = favorites.reconcile(user, me.follows);
    state.prices = me.prices; state.accountLoaded = true; state.accountError = '';
  } catch (error) { if (number === accountRequest) state.accountError = error.message; }
  if (number === accountRequest) { rerender(); renderAccount(); }
  if (number === accountRequest && state.accountLoaded) await syncLocalFavorites();
}

export async function syncLocalFavorites() {
  const user = state.userId;
  if (!accountsReady || !state.signedIn || !user || deletingData || !apiConfigured) return;
  if (favoritesSync && favoritesUser === user) return favoritesSync;
  const task = (async () => {
    try {
      for (let batch = 0; batch < 10 && state.userId === user && !deletingData; batch++) {
        const sent = favorites.pending(user).slice(0, 200); if (!sent.length) break;
        const value = await request('/me/favorites', { method: 'PUT', token: await freshToken(user),
          body: { changes: sent.map(({gameId,saved}) => ({gameId,saved})) } });
        if (!Array.isArray(value.follows)) throw new Error('Favorites could not be synced.');
        const ids = favorites.acknowledge(user, sent, value.follows);
        if (state.userId !== user) return;
        accountRequest++; state.follows = ids; state.accountLoaded = true; state.accountError = '';
        rerender(); renderAccount();
      }
    } catch { if (state.userId === user) { state.accountError = 'Favorites saved on this device. Sync will retry when you reconnect.'; rerender(); renderAccount(); } }
  })();
  favoritesSync = task; favoritesUser = user;
  try { await task; } finally { if (favoritesSync === task) { favoritesSync = null; favoritesUser = null; } }
}

async function requireAccount(invoker, reason, feature) {
  if (!accountsReady) { showToast('Following and price responses are not available yet.'); return false; }
  if (!state.service?.capabilities?.[feature]) { showToast(state.serviceError || 'This account feature is temporarily unavailable.'); return false; }
  if (!await NeoAuth.requireSignIn({ invoker, reason })) return false;
  return true;
}

export async function prepareFollowing(invoker) {
  return true;
}

export async function followGame(invoker, gameId = state.detail?.id) {
  if (!gameId || deletingData) return;
  const restoreFocus=globalThis.document?.activeElement===invoker;
  const value = favorites.toggle(state.signedIn ? state.userId : null, gameId);
  if (!value) { showToast('Your favorites list is full. Remove a game before adding another.'); return; }
  accountRequest++; state.follows = value.ids; rerender(); renderAccount();
  showToast(value.persisted ? value.saved ? 'Saved to favorites.' : 'Removed from favorites.' : 'Saved for this visit. Browser storage is unavailable.');
  // Re-rendering a card replaces its button. Restore keyboard focus only when
  // that button was the active control, without scrolling the collection.
  if (restoreFocus && invoker?.dataset?.favorite) document.querySelector(`[data-favorite="${gameId}"]`)?.focus({preventScroll:true});
  await syncLocalFavorites();
}

export function clearSignals() {
  signalRequest++; state.detailSignals = null; state.detailSignalError = '';
}

export async function loadSignals(gameId = state.detail?.id) {
  const number = ++signalRequest;
  if (!gameId) return;
  state.detailSignals = null; state.detailSignalError = ''; renderSignals();
  if (!state.service?.capabilities?.signals) { state.detailSignalError = 'Price signals are not available yet.'; renderSignals(); return; }
  try {
    const summary = await request(`/games/${gameId}/signals`);
    if (number !== signalRequest || state.detail?.id !== gameId) return;
    if (!['ready', 'insufficient'].includes(summary.state) || summary.gameId !== gameId) throw new Error('Price signals could not be read.');
    if (summary.state === 'ready' && (!Number.isInteger(summary.count) || summary.count < 5 || !Number.isInteger(summary.medianCents) || !Array.isArray(summary.buckets))) throw new Error('Price signals could not be read.');
    state.detailSignals = summary;
  } catch (error) { if (number === signalRequest && state.detail?.id === gameId) state.detailSignalError = error.message; }
  if (number === signalRequest && state.detail?.id === gameId) renderSignals();
}

export async function savePrice(invoker) {
  if (!accountsReady) return;
  const gameId = state.detail?.id, amountCents = parsePrice($('priceAmount').value);
  if (!gameId || state.accountBusy) return;
  $('priceAmount').setAttribute('aria-invalid', String(amountCents === null));
  if (amountCents === null) { $('priceMessage').textContent = 'Enter an amount from $0 to $100, with no more than two decimal places.'; $('priceAmount').focus(); return; }
  if (!await requireAccount(invoker, 'Sign in to share one editable price response for this game.', 'signals')) return;
  if (state.accountBusy) return;
  const user = state.userId, mode = state.service?.signalProtection;
  if (!['turnstile', 'account-rate-limit'].includes(mode)) { $('priceMessage').textContent = 'Price responses are temporarily unavailable.'; return; }
  state.accountBusy = true; $('priceMessage').textContent = mode === 'turnstile' ? 'Complete the verification to share your response.' : 'Saving your response…'; renderAccount();
  try {
    const body = { amountCents, currency: 'USD' };
    if (mode === 'turnstile') body.turnstileToken = await priceChallenge();
    if (state.detail?.id !== gameId || !$('itemDialog').open) return;
    await request(`/games/${gameId}/price`, { method: 'PUT', body, token: await freshToken(user) });
    if (state.userId !== user) return;
    await refreshMe();
    if (state.detail?.id === gameId) { $('priceMessage').textContent = 'Your response is saved. You can change or remove it any time.'; await loadSignals(gameId); }
  } catch (error) { if (state.detail?.id === gameId) $('priceMessage').textContent = error.message; }
  finally { clearChallenge(); state.accountBusy = false; renderAccount(); }
}

export async function withdrawPrice() {
  const gameId = state.detail?.id, user = state.userId;
  if (!accountsReady || !gameId || !state.signedIn || state.accountBusy) return;
  state.accountBusy = true; renderAccount();
  try {
    await request(`/games/${gameId}/price`, { method: 'DELETE', token: await freshToken(user) });
    if (state.userId !== user) return;
    await refreshMe();
    if (state.detail?.id === gameId) { $('priceMessage').textContent = 'Your response has been removed.'; $('priceAmount').value = ''; await loadSignals(gameId); }
  } catch (error) { if (state.detail?.id === gameId) $('priceMessage').textContent = error.message; }
  finally { state.accountBusy = false; renderAccount(); }
}

export async function deleteMyData(invoker) {
  if (!accountsReady || state.accountBusy || !apiConfigured || !await NeoAuth.requireSignIn({ invoker, reason: 'Sign in to manage your Playtrace data.' }) || state.accountBusy) return;
  $('deleteConfirm').hidden = false; $('confirmDelete').focus();
}
export async function confirmDelete() {
  if (!accountsReady || !state.signedIn || state.accountBusy) return;
  const user = state.userId;
  let deleted = false;
  state.accountBusy = true; deletingData = true; accountRequest++; clearSignals(); renderAccount();
  try {
    if (favoritesUser === user) await favoritesSync;
    await request('/me', { method: 'DELETE', body: { confirm: 'delete-my-data' }, token: await freshToken(user) });
    if (state.userId !== user) return;
    accountRequest++; clearSignals();
    favorites.clear(user); state.follows = []; state.prices = []; state.accountLoaded = true; state.accountError = '';
    if ($('priceAmount')) $('priceAmount').value = '';
    if ($('priceMessage')) $('priceMessage').textContent = '';
    state.detailSignalError = 'Refresh to see the latest price signals.'; renderSignals(); rerender();
    deleted = true; $('deleteConfirm').hidden = true; $('privacyMessage').textContent = 'Your Playtrace follows and price responses have been deleted.';
  } catch (error) { if (state.userId === user) { $('privacyMessage').textContent = error.message; state.detailSignalError = 'Price signals need to be refreshed.'; renderSignals(); } }
  finally {
    deletingData = false; state.accountBusy = false; renderAccount();
    if (deleted && state.userId === user) $('deleteMyData').focus();
    if (state.userId !== user && state.signedIn) refreshMe();
  }
}
