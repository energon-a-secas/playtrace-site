import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { validateCatalog, selectGames, defaults, locationForState, readLocation, parsePrice } from '../js/collection.js';
import * as collection from '../js/collection.js';

const seed = JSON.parse(await readFile(new URL('../data/catalog.json', import.meta.url), 'utf8'));
const copy = () => structuredClone(seed);

test('the real seed validates with original source timelines', () => {
  const result = validateCatalog(copy());
  assert.equal(result.games.length, seed.games.length);
  assert.ok(result.games.some(game => game.posts.length > 1));
});

test('duplicates and unsupported payloads fail instead of becoming empty results', () => {
  const duplicate = copy(); duplicate.games.push(duplicate.games[0]);
  assert.throws(() => validateCatalog(duplicate));
  const postDuplicate = copy(); postDuplicate.games[0].posts.push(postDuplicate.games[0].posts[0]);
  assert.throws(() => validateCatalog(postDuplicate));
  assert.throws(() => validateCatalog({ ...copy(), schemaVersion: 2 }));
});

test('active image URLs and forged source attribution fail validation', () => {
  for (const change of [
    game => { game.preview.posterUrl = 'javascript:alert(1)'; },
    game => { game.preview.url = 'https://user:password@example.com/image.jpg'; },
    game => { game.posts[0].url = 'https://example.com/fake-post'; },
    game => { game.author.url = 'https://example.com/fake-author'; },
    game => { game.posts[0].author = 'a_different_maker'; },
    game => { game.preview.sourceUrl = 'https://www.reddit.com/r/aigamedev/comments/123456/'; },
    game => { game.updatedAt = '2000-01-01T00:00:00.000Z'; },
  ]) {
    const value = copy(); change(value.games[0]); assert.throws(() => validateCatalog(value));
  }
});

test('maker, stage, query and private following filters compose', () => {
  const games = validateCatalog(copy()).games, target = games[0];
  const state = { ...defaults, author: target.author.name.toUpperCase(), stage: target.stage,
    query: target.title, following: true, follows: [target.id] };
  assert.deepEqual(selectGames(games, state).map(game => game.id), [target.id]);
  assert.equal(selectGames(games, { ...state, follows: [] }).length, 0);
});

test('shared views preserve unrelated query and fragment while restoring every filter', () => {
  const expected = { ...defaults, query: 'a tiny idea', category: 'puzzle', stage: 'prototype',
    author: 'a_maker', following: true, sort: 'updates', view: 'list', game: 'g_123456' };
  const url = locationForState('https://playtrace.neorgon.com/?theme=light&utm_source=friend#keep', expected);
  assert.equal(url.searchParams.get('theme'), 'light');
  assert.equal(url.searchParams.get('utm_source'), 'friend');
  assert.equal(url.hash, '#keep');
  assert.deepEqual(readLocation(url), expected);
});

test('price parsing keeps exact cents and excludes invalid limits and coercion', () => {
  assert.equal(parsePrice('0'), 0); assert.equal(parsePrice('12.34'), 1234); assert.equal(parsePrice('100.00'), 10000);
  for (const value of ['', '-1', '100.01', '1.234', 'NaN', '1e2', '0x10', 'Infinity']) assert.equal(parsePrice(value), null);
});

test('closing while the challenge script loads cancels without creating a hidden widget', async () => {
  const originalDocument = globalThis.document, originalTurnstile = globalThis.turnstile;
  let script, renders = 0;
  globalThis.document = {
    createElement: () => ({ remove() {} }),
    head: { append(value) { script = value; } },
    getElementById: id => id === 'itemDialog' ? { open: false } : { replaceChildren() {} },
  };
  delete globalThis.turnstile;
  try {
    const source = (await readFile(new URL('../js/challenge.js', import.meta.url), 'utf8'))
      .replace("import { CONFIG } from './config.js';", "const CONFIG = {turnstileSiteKey: 'test-fixture'};");
    const challenge = await import(`data:text/javascript;base64,${Buffer.from(source).toString('base64')}`);
    const pending = challenge.priceChallenge();
    challenge.clearChallenge();
    globalThis.turnstile = { render() { renders++; }, remove() {} };
    script.onload();
    await assert.rejects(pending, /cancelled/);
    assert.equal(renders, 0);
  } finally { globalThis.document = originalDocument; globalThis.turnstile = originalTurnstile; }
});

let moduleNumber = 0;
async function isolatedModule(file, bindings) {
  const key = `playtraceTest${++moduleNumber}`;
  globalThis[key] = bindings;
  const source = (await readFile(new URL(`../js/${file}`, import.meta.url), 'utf8')).replace(/^import .*;\n/gm, '');
  try {
    return await import(`data:text/javascript;base64,${Buffer.from(`const {${Object.keys(bindings).join(',')}} = globalThis.${key};\n${source}`).toString('base64')}`);
  } finally { delete globalThis[key]; }
}
function fakeNodes() {
  const nodes = new Map();
  return id => {
    if (!nodes.has(id)) nodes.set(id, { innerHTML: '', textContent: '', value: '', hidden: false, disabled: false,
      open: true, dataset: {}, classList: { remove() {} }, nextElementSibling: { textContent: '' },
      setAttribute() {}, removeAttribute() {}, focus() {}, closest() { return this; } });
    return nodes.get(id);
  };
}
async function accountModule(request, accountsReady = true) {
  const $ = fakeNodes();
  const state = { signedIn: true, userId: 'user_a', follows: ['g_abc12'], prices: [], accountLoaded: true,
    accountBusy: false, detail: { id: 'g_abc12' }, service: { capabilities: { signals: true, following: true }, signalProtection: 'account-rate-limit' } };
  const authCalls = { starts: 0, listeners: 0, prompts: 0, tokens: 0 };
  const NeoAuth = { state: { signedIn: true, userId: 'user_a', clerk: { session: { getToken: async () => { authCalls.tokens++; return 'test-token'; } } } },
    start() { authCalls.starts++; }, onChange() { authCalls.listeners++; }, requireSignIn: async () => { authCalls.prompts++; return true; } };
  const api = await isolatedModule('accounts.js', { state, $, NeoAuth, request, CONFIG: { accountsReady }, apiConfigured: true, parsePrice,
    priceChallenge: async () => '', clearChallenge() {}, renderAccount() {}, renderSignals() {}, showToast() {} });
  return { api, state, $, authCalls };
}
async function flushRequests() { for (let i = 0; i < 12; i++) await Promise.resolve(); }
const insufficient = { gameId: 'g_abc12', state: 'insufficient', count: null, medianCents: null, buckets: null };
const ready = { gameId: 'g_abc12', state: 'ready', count: 5, medianCents: 1000, buckets: [] };

test('same-timestamp catalogue refresh removes featured content and updates cards and maker options', async () => {
  const catalogue = validateCatalog(copy()), $ = fakeNodes();
  const state = { ...defaults, games: catalogue.games, catalog: catalogue, loaded: true, status: 'ready', follows: [], prices: [], detail: null };
  const originalDocument = globalThis.document, originalLocation = globalThis.location;
  globalThis.document = { querySelectorAll: () => [], querySelector: selector => $(selector) };
  globalThis.location = { href: 'https://playtrace.example/' };
  try {
    const renderer = await isolatedModule('render.js', { state, $, ...collection, CONFIG: { removalContact: 'https://balise.neorgon.com/report/' }, e: String });
    renderer.render();
    const removed = $('featuredGame').innerHTML.match(/data-item="([^"]+)"/)[1];
    state.games = state.games.filter(game => game.id !== removed);
    state.catalog = { ...catalogue, games: state.games };
    renderer.render();
    assert.equal($('featuredGame').innerHTML.includes(removed), false);
    assert.equal($('itemList').innerHTML.includes(removed), false);
    state.games = state.games.map((game, index) => index ? game : { ...game, title: 'Refreshed source title', author: { ...game.author, name: 'NewSourceMaker' } });
    state.catalog = { ...catalogue, games: state.games };
    renderer.render();
    assert.match($('itemList').innerHTML, /Refreshed source title/);
    assert.match($('authorSelect').innerHTML, /NewSourceMaker/);
    state.games = []; state.catalog = { ...catalogue, games: [] }; renderer.render();
    assert.equal($('featuredGame').innerHTML, '');
  } finally { globalThis.document = originalDocument; globalThis.location = originalLocation; }
});

test('privacy deletion rejects a stale private read and prevents overlapping account writes', async () => {
  let finishGet, finishDelete; const calls = [];
  const { api, state, $ } = await accountModule(async (path, options = {}) => {
    const method = options.method || 'GET'; calls.push(`${method} ${path}`);
    if (path === '/me' && method === 'GET' && !finishGet) return new Promise(resolve => { finishGet = resolve; });
    if (path === '/me' && method === 'GET') return { follows: [], prices: [] };
    if (path === '/me' && method === 'DELETE') return new Promise(resolve => { finishDelete = resolve; });
    return {};
  });
  const oldRead = api.refreshMe(); await flushRequests();
  const deletion = api.confirmDelete(); await flushRequests();
  await api.followGame({});
  assert.equal(calls.some(call => call.endsWith('/follow')), false);
  finishDelete({ deleted: true }); await deletion;
  finishGet({ follows: ['g_abc12'], prices: [{ gameId: 'g_abc12', amountCents: 1000 }] }); await oldRead;
  assert.deepEqual(state.follows, []); assert.deepEqual(state.prices, []);
  assert.equal(state.detailSignals, null); assert.equal($('deleteConfirm').hidden, true);
  assert.equal(state.accountBusy, false);
});

test('newer same-game signals win and closing invalidates outstanding aggregate reads', async () => {
  const pending = [];
  const { api, state } = await accountModule(() => new Promise(resolve => pending.push(resolve)));
  const first = api.loadSignals(), second = api.loadSignals();
  pending[1](insufficient); await second; pending[0](ready); await first;
  assert.equal(state.detailSignals.state, 'insufficient');
  const closing = api.loadSignals();
  api.clearSignals(); state.detail = null; state.detail = { id: 'g_abc12' };
  pending[2](ready); await closing;
  assert.equal(state.detailSignals, null);
});

test('source post IDs reject numeric coercion even when the source URL matches', () => {
  const catalogue = copy(), game = catalogue.games.find(entry => entry.posts.length === 1), post = game.posts[0];
  const oldUrl = post.url;
  post.id = 12345; post.url = 'https://www.reddit.com/r/aigamedev/comments/12345/';
  if (game.preview.sourceUrl === oldUrl) game.preview.sourceUrl = post.url;
  assert.throws(() => validateCatalog(catalogue));
});

test('unavailable accounts never initialize Clerk, prompt, mint tokens or request private data', async () => {
  const calls = [];
  const { api, state, $, authCalls } = await accountModule(async (path, options = {}) => {
    calls.push({ path, method: options.method || 'GET' }); return insufficient;
  }, false);
  api.startAccounts(() => {});
  assert.equal(state.signedIn, false); assert.equal(state.userId, null);
  // Stale or manually assigned account state cannot bypass the configured gate.
  state.signedIn = true; state.userId = 'user_a'; state.accountLoaded = true;
  $('priceAmount').value = '10';
  assert.equal(await api.prepareFollowing({}), false);
  await api.followGame({}); await api.savePrice({}); await api.withdrawPrice();
  await api.deleteMyData({}); await api.confirmDelete(); await api.refreshMe();
  assert.deepEqual(calls, []);
  assert.deepEqual(authCalls, { starts: 0, listeners: 0, prompts: 0, tokens: 0 });
  await api.loadSignals();
  assert.deepEqual(calls, [{ path: '/games/g_abc12/signals', method: 'GET' }]);
  assert.equal(state.detailSignals.state, 'insufficient');
});

test('ready accounts initialize the kit and retain verified private action flow', async () => {
  const calls = [];
  const { api, authCalls } = await accountModule(async (path, options = {}) => {
    calls.push({ path, method: options.method || 'GET', token: options.token });
    return path === '/me' ? { follows: [], prices: [] } : { gameId: 'g_abc12', following: false };
  }, true);
  api.startAccounts(() => {}); await api.followGame({});
  assert.equal(authCalls.starts, 1); assert.equal(authCalls.listeners, 1); assert.equal(authCalls.prompts, 1);
  assert.deepEqual(calls, [{ path: '/games/g_abc12/follow', method: 'DELETE', token: 'test-token' }, { path: '/me', method: 'GET', token: 'test-token' }]);
});

test('unavailable account controls show availability without a sign-in call to action', async () => {
  const $ = fakeNodes(), state = { follows: [], prices: [], detail: { id: 'g_abc12' }, service: { capabilities: { signals: true, following: true }, signalProtection: 'account-rate-limit' } };
  const renderer = await isolatedModule('render.js', { state, $, CONFIG: { accountsReady: false }, e: String });
  renderer.renderAccount();
  for (const id of ['followingFilter', 'followGame', 'submitPrice', 'priceAmount', 'withdrawPrice', 'deleteMyData', 'confirmDelete']) assert.equal($(id).disabled, true, id);
  assert.doesNotMatch($('submitPrice').textContent, /sign in/i);
  assert.match($('accountAvailability').textContent, /not available yet/);
  assert.match($('privacyMessage').textContent, /not available yet/);
});
