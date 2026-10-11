import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { validateCatalog, selectGames, defaults, locationForState, readLocation, parsePrice, distributionFor } from '../js/collection.js';
import * as collection from '../js/collection.js';
import { feedbackQuestions, feedbackOptions, validChoices } from '../js/feedback-options.js';

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

test('project destinations use real host boundaries and distinguish repositories from hosted sites', () => {
  for (const [url, expected] of [
    ['https://starstilanx.itch.io/wyrmfall-a-dragon-arpg', 'itch'],
    ['https://store.steampowered.com/app/620/Portal_2/', 'steam'],
    ['https://play.google.com/store/apps/details?id=com.example.game', 'google-play'],
    ['https://apps.apple.com/us/app/example/id123456', 'app-store'],
    ['https://testflight.apple.com/join/example', 'testflight'],
    ['https://github.com/maker/game', 'github'],
    ['https://gitlab.com/maker/game', 'gitlab'],
    ['https://codeberg.org/maker/game', 'codeberg'],
    ['https://maker.github.io/game/', 'website'],
    ['https://maker.itch.io.evil.example/game', 'website'],
    ['https://notitch.io/game', 'website'],
    ['https://example.com/?game=https://store.steampowered.com/app/620', 'website'],
    ['https://store.steampowered.com/news/', 'website'],
  ]) assert.equal(distributionFor(url).id, expected, url);
  assert.equal(distributionFor(null), null);
  for (const url of ['javascript:alert(1)', 'https://itch.io@evil.example/game']) assert.throws(() => distributionFor(url));
});

test('destination metadata is derived from the project link without upgrading its stage or inventing devices', () => {
  const raw = copy(), wyrmfall = raw.games.find(game => game.title === 'Wyrmfall');
  wyrmfall.distribution = { id: 'steam', label: '<img src=x>', url: 'https://unrelated.example/' };
  const game = validateCatalog(raw).games.find(game => game.id === wyrmfall.id);
  assert.equal(game.distribution.id, 'itch'); assert.equal(game.distribution.url, game.projectUrl);
  assert.equal(game.distribution.label, 'itch.io'); assert.equal(game.stage, 'prototype'); assert.deepEqual(game.platforms, []);
  game.projectUrl = 'https://github.com/maker/game';
  const refreshed = validateCatalog({ ...raw, games: [game] }).games[0];
  assert.equal(refreshed.distribution.id, 'github');
});

test('platform filtering composes with search, genre, stage and following, including records without a link', () => {
  const games = validateCatalog(copy()).games, wyrmfall = games.find(game => game.title === 'Wyrmfall');
  const filters = { ...defaults, platform: 'itch', category: 'rpg', stage: 'prototype', query: 'wyrmfall', following: true, follows: [wyrmfall.id] };
  assert.deepEqual(selectGames(games, filters).map(game => game.id), [wyrmfall.id]);
  assert.deepEqual(selectGames(games, { ...filters, platform: 'steam' }), []);
  const unlisted = selectGames(games, { ...defaults, platform: 'unlisted' });
  assert.ok(unlisted.length); assert.ok(unlisted.every(game => game.projectUrl === null));
  assert.ok(selectGames(games, { ...defaults, query: 'itch.io' }).some(game => game.id === wyrmfall.id));
  assert.equal(readLocation('https://playtrace.example/?platform=not-a-platform').platform, 'all');
});

test('shared views preserve unrelated query and fragment while restoring every filter', () => {
  const expected = { ...defaults, query: 'a tiny idea', category: 'puzzle', platform: 'itch', stage: 'prototype',
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
      querySelector() { return {textContent:''}; }, setAttribute() {}, removeAttribute() {}, focus() {}, closest() { return this; } });
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

test('same-timestamp catalogue refresh removes missing cards and updates searchable maker data', async () => {
  const catalogue = validateCatalog(copy()), $ = fakeNodes();
  const state = { ...defaults, games: catalogue.games, catalog: catalogue, loaded: true, status: 'ready', follows: [], prices: [], detail: null };
  const originalDocument = globalThis.document, originalLocation = globalThis.location;
  globalThis.document = { querySelectorAll: () => [], querySelector: selector => $(selector) };
  globalThis.location = { href: 'https://playtrace.example/' };
  try {
    let makers=[];
    const renderer = await isolatedModule('render.js', { state, $, ...collection, CONFIG: { removalContact: 'https://balise.neorgon.com/report/' }, e: String, syncMakers:games=>makers=games.map(g=>g.author.name), icon:()=>'', playLink:()=>'' });
    renderer.render();
    const removed = state.games[0].id;
    state.games = state.games.filter(game => game.id !== removed);
    state.catalog = { ...catalogue, games: state.games };
    renderer.render();
    assert.equal($('itemList').innerHTML.includes(removed), false);
    state.games = state.games.map((game, index) => index ? game : { ...game, title: 'Refreshed source title', author: { ...game.author, name: 'NewSourceMaker' } });
    state.catalog = { ...catalogue, games: state.games };
    renderer.render();
    assert.match($('itemList').innerHTML, /Refreshed source title/);
    assert.ok(makers.includes('NewSourceMaker'));
    state.games = []; state.catalog = { ...catalogue, games: [] }; renderer.render();
    assert.equal($('itemList').innerHTML, '');
  } finally { globalThis.document = originalDocument; globalThis.location = originalLocation; }
});

test('background catalogue pages preserve visible card nodes while same-timestamp edits still replace them', async () => {
  const catalogue = validateCatalog(copy()), $ = fakeNodes();
  const all = selectGames(catalogue.games, { ...defaults, follows: [] });
  const state = { ...defaults, games: all.slice(0, 60), catalog: catalogue, loaded: true, status: 'loading',
    catalogPartial: true, catalogTotal: all.length, follows: [], prices: [], detail: null };
  const originalDocument = globalThis.document, originalLocation = globalThis.location;
  globalThis.document = { querySelectorAll: () => [], querySelector: selector => $(selector) };
  globalThis.location = { href: 'https://playtrace.example/' };
  let replacements = 0, html = '';
  Object.defineProperty($('itemList'), 'innerHTML', { get: () => html, set: value => { replacements++; html = value; } });
  try {
    const renderer = await isolatedModule('render.js', { state, $, ...collection, CONFIG: {}, e: String, syncMakers:()=>{}, icon:()=>'', playLink:()=>'' });
    renderer.render(); assert.equal(replacements, 1);
    state.games = all; state.catalogPartial = false; state.status = 'ready'; renderer.render();
    assert.equal(replacements, 1, 'Unchanged visible cards retain their existing DOM and focus');
    const priorCards = replacements;
    state.games = structuredClone(all); renderer.render();
    assert.equal(replacements, priorCards, 'The same cards keep their DOM when background pages or copies arrive');
    state.games = all.map((game, i) => i ? game : { ...game, title: 'Changed without a timestamp change' });
    renderer.render(); assert.equal(replacements, 2); assert.match(html, /Changed without a timestamp change/);
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
  for (const id of ['followingFilter', 'followGame', 'deleteMyData', 'confirmDelete']) assert.equal($(id).disabled, true, id);
  assert.equal($('followGame').hidden, true);
  assert.match($('privacyMessage').textContent, /not available yet/);
});

async function catalogueModule(request, loadPublicSnapshot = async () => { throw new Error('No snapshot'); }) {
  return isolatedModule('state.js', { createStore: () => ({ load: () => ({}), save: () => true }),
    defaults, readLocation, validateCatalog, apiConfigured: true, request, loadPublicSnapshot });
}
const pageOf = (games, nextCursor = null, total = seed.games.length) => ({ ...copy(), games, pagination: { total, nextCursor } });

test('a service outage can load a recent public snapshot, then live recovery replaces it', async () => {
  let offline=true, snapshots=0;
  const saved={...copy(),snapshotAt:new Date().toISOString()};
  const module=await catalogueModule(async()=>{
    if(offline)throw Object.assign(new Error('Unavailable'),{code:'SERVICE_UNAVAILABLE'});
    return pageOf(copy().games.slice(1),null,seed.games.length-1);
  },async()=>{snapshots++;return saved;});
  await module.loadCatalog(()=>{});
  assert.equal(module.state.loaded,true);assert.equal(module.state.status,'error');assert.equal(module.state.catalogSnapshot,true);
  assert.equal(module.state.games.length,seed.games.length);
  offline=false;await module.loadCatalog(()=>{});
  assert.equal(module.state.catalogSnapshot,false);assert.equal(module.state.status,'ready');
  assert.equal(module.state.games.length,seed.games.length-1);assert.equal(snapshots,1);
});

test('snapshots cannot mask malformed data or replace a partially loaded live archive', async () => {
  for(const partial of [false,true]){
    let calls=0,snapshots=0;
    const module=await catalogueModule(async()=>{
      if(!partial)return {schemaVersion:9};
      if(!calls++)return pageOf(copy().games.slice(0,40),'second');
      throw Object.assign(new Error('Unavailable'),{code:'SERVICE_UNAVAILABLE'});
    },async()=>{snapshots++;return copy();});
    await module.loadCatalog(()=>{});
    assert.equal(snapshots,0);assert.equal(module.state.status,'error');assert.equal(module.state.catalogSnapshot,false);
    assert.equal(module.state.games.length,partial?40:0);
  }
});

test('public fallback requires a dated export no older than a day and validates provenance', async () => {
  let value={...copy(),snapshotAt:new Date(Date.now()-1000).toISOString()};
  const loader=await isolatedModule('catalog-snapshot.js',{validateCatalog,fetch:async()=>Response.json(value)});
  assert.equal((await loader.loadPublicSnapshot()).games.length,seed.games.length);
  for(const snapshotAt of [undefined,'bad',new Date(Date.now()+60000).toISOString(),new Date(Date.now()-86400001).toISOString()]){
    value={...copy(),snapshotAt};await assert.rejects(loader.loadPublicSnapshot(),/out of date/);
  }
  value={...copy(),snapshotAt:new Date().toISOString()};value.games[0].posts[0].author='different_maker';
  await assert.rejects(loader.loadPublicSnapshot(),/Mismatched source author/);
});

test('catalogue first page renders before the next page resolves, then completes without duplicates', async () => {
  let finish, calls = 0; const renders = [];
  const module = await catalogueModule(async () => ++calls === 1 ? pageOf(copy().games.slice(0, 40), 'second') : new Promise(resolve => { finish = resolve; }));
  const pending = module.loadCatalog(() => renders.push({ count: module.state.games.length, partial: module.state.catalogPartial }));
  await flushRequests();
  assert.equal(module.state.loaded, true); assert.equal(module.state.status, 'loading');
  assert.equal(module.state.games.length, 40); assert.equal(module.state.catalogPartial, true);
  assert.equal(module.state.catalogTotal, seed.games.length);
  assert.ok(renders.some(render => render.count === 40 && render.partial));
  finish(pageOf(copy().games.slice(40))); await pending;
  assert.equal(module.state.status, 'ready'); assert.equal(module.state.catalogPartial, false);
  assert.equal(module.state.games.length, seed.games.length);
});

test('partial catalogue failures retain an honest subset; retry replaces it and refresh applies removals atomically', async () => {
  let attempt = 0;
  const module = await catalogueModule(async () => {
    attempt++;
    if (attempt === 1) return pageOf(copy().games.slice(0, 40), 'second');
    if (attempt === 2) throw new Error('Network unavailable');
    if (attempt === 3) return copy();
    return pageOf(copy().games.slice(1), null, seed.games.length - 1);
  });
  await module.loadCatalog(() => {});
  assert.equal(module.state.status, 'error'); assert.equal(module.state.catalogPartial, true); assert.equal(module.state.games.length, 40);
  await module.loadCatalog(() => {});
  assert.equal(module.state.status, 'ready'); assert.equal(module.state.catalogPartial, false);
  const removed = module.state.games[0].id;
  await module.loadCatalog(() => {});
  assert.equal(module.state.games.some(game => game.id === removed), false);
});

test('catalogue rejects duplicate pages, revision changes and mismatched totals without merging unsafe records', async () => {
  for (const badPage of [
    pageOf(copy().games.slice(0, 40), null, 80),
    { ...pageOf(copy().games.slice(40)), generatedAt: '2026-10-11T12:00:00.000Z' },
    pageOf(copy().games.slice(40), null, seed.games.length + 1),
    pageOf([], 'third'),
  ]) {
    let calls = 0;
    const module = await catalogueModule(async () => ++calls === 1 ? pageOf(copy().games.slice(0, 40), 'second') : badPage);
    await module.loadCatalog(() => {});
    assert.equal(module.state.status, 'error'); assert.equal(module.state.games.length, 40); assert.equal(module.state.catalogPartial, true);
  }
});

const feedbackEntry = (body = 'Useful feedback') => ({ id: '12345678-1234-1234-1234-123456789012', displayName: 'Visitor', body,
  idealPriceCents: null, currency: 'USD', createdAt: '2026-10-10T12:00:00.000Z', updatedAt: '2026-10-10T12:00:00.000Z' });
const feedbackPage = (entries = [], gameId = 'g_abc12') => ({ gameId, entries, count: entries.length,
  idealPrices: { currency: 'USD', count: 0, medianCents: null }, nextCursor: null });
async function feedbackModule(request) {
  const $ = fakeNodes(), state = { service: { capabilities: { feedback: true } } };
  const guest = await isolatedModule('guest-key.js', {});
  const api = await isolatedModule('feedback.js', { state, $, request, apiConfigured: true, parsePrice, feedbackQuestions, feedbackOptions, validChoices,
    guestEditKey: guest.editKey, keyPersists: guest.keyPersists,
    money: collection.money, dateLabel: collection.dateLabel, e: value => String(value).replaceAll('<', '&lt;').replaceAll('>', '&gt;') });
  return { api, $, state };
}

test('guest form posts and removes without account state, persists an edit key and escapes public text', async () => {
  const originals = { localStorage: globalThis.localStorage, location: globalThis.location };
  const storage = new Map(), calls = []; let saved = null;
  globalThis.localStorage = { getItem: key => storage.get(key), setItem: (key, value) => storage.set(key, value) };
  globalThis.location = { href: 'https://playtrace.example/?game=g_abc12' };
  try {
    const { api, $ } = await feedbackModule(async (path, options = {}) => {
      calls.push({ path, ...options });
      if (options.method === 'PUT') { saved = { ...feedbackEntry(), ...options.body }; return { gameId: 'g_abc12', feedback: saved }; }
      if (options.method === 'DELETE') { saved = null; return { deleted: true }; }
      if (path.endsWith('/mine')) return { gameId: 'g_abc12', feedback: saved, moderated: false };
      return feedbackPage(saved ? [saved] : []);
    });
    api.resetFeedback('g_abc12'); await api.loadFeedback();
    assert.equal($('feedbackSubmit').disabled, false);
    $('feedbackBody').value = '<img src=x onerror=alert(1)> A useful suggestion';
    await api.saveFeedback();
    const write = calls.find(call => call.method === 'PUT');
    assert.match(write.feedbackKey, /^[a-f0-9]{64}$/); assert.equal(write.token, undefined);
    assert.equal(write.body.idealPriceCents, null); assert.equal(storage.size, 1);
    assert.equal($('feedbackRemove').hidden, false); assert.match($('feedbackList').innerHTML, /&lt;img/);
    assert.doesNotMatch($('feedbackList').innerHTML, /<img/);
    await api.removeFeedback();
    assert.equal($('feedbackRemove').hidden, true); assert.equal($('feedbackBody').value, '');
    assert.equal(calls.some(call => call.path === '/me'), false);
  } finally { Object.assign(globalThis, originals); }
});

test('guest own-read failure has a visible retry; unavailable local storage is disclosed before contributing', async () => {
  const original = globalThis.localStorage;
  globalThis.localStorage = { getItem: () => 'ab'.repeat(32) };
  try {
    const { api, $ } = await feedbackModule(async path => { if (path.endsWith('/mine')) throw new Error('Network'); return feedbackPage(); });
    api.resetFeedback('g_abc12'); await api.loadFeedback();
    assert.equal($('feedbackSubmit').disabled, true); assert.equal($('feedbackError').hidden, false);
    assert.match($('feedbackErrorText').textContent, /Retry before editing/);
    globalThis.localStorage = { getItem() { throw new Error('Blocked'); } };
    const blocked = await feedbackModule(async () => feedbackPage());
    blocked.api.resetFeedback('g_abc12'); await blocked.api.loadFeedback();
    assert.match(blocked.$('feedbackAvailability').textContent, /during this visit/);
  } finally { globalThis.localStorage = original; }
});

test('closing a guest form rejects late reads and writes from the previous project', async () => {
  const original = globalThis.localStorage;
  globalThis.localStorage = { getItem: () => null, setItem() {} };
  try {
    let resolveRead, resolveWrite;
    const { api, $ } = await feedbackModule(async (path, options = {}) => {
      if (options.method === 'PUT') return new Promise(resolve => { resolveWrite = resolve; });
      if (path.includes('g_other')) return feedbackPage([], 'g_other');
      return new Promise(resolve => { resolveRead = resolve; });
    });
    api.resetFeedback('g_abc12'); const oldRead = api.loadFeedback();
    api.clearFeedback(); api.resetFeedback('g_other'); await api.loadFeedback();
    resolveRead(feedbackPage([feedbackEntry('Stale read')])); await oldRead;
    assert.equal($('feedbackList').innerHTML.includes('Stale read'), false);
    $('feedbackBody').value = 'A good suggestion'; const oldWrite = api.saveFeedback(); await flushRequests();
    api.clearFeedback(); api.resetFeedback('g_abc12');
    resolveWrite({ gameId: 'g_other', feedback: feedbackEntry('Stale write') }); await oldWrite;
    assert.equal($('feedbackBody').value, ''); assert.equal($('feedbackMessage').textContent, '');
  } finally { globalThis.localStorage = original; }
});
