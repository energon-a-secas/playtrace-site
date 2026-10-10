import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { importCatalog, catalog, query } from '../src/store.mjs';
import { validateCatalog } from '../src/validation.mjs';
import { aggregate } from '../src/accounts.mjs';
import { OPERATOR, ORIGIN, token, fixtureEnv, fixtureWorker, request, fixtureCatalog, fixtureGame } from './helpers.mjs';

test('curated static seed passes the same validator as the API', () => {
  const file = new URL('../../data/catalog.json', import.meta.url);
  assert.equal(validateCatalog(JSON.parse(readFileSync(file, 'utf8'))).schemaVersion, 1);
});
test('unconfigured features report unavailable; routes, methods, CORS and no-store work', async () => {
  const worker = fixtureWorker();
  let response = await worker.fetch(request('/status'), {});
  assert.equal(response.status, 403);
  response = await worker.fetch(request('/status', { origin: null }), {});
  const data = await response.json();
  assert.equal(response.status, 200); assert.deepEqual(Object.values(data.capabilities), [false, false, false, false, false, false]);
  assert.equal(data.signalProtection, 'unconfigured');
  response = await worker.fetch(request('/catalog', { origin: null }), {}); assert.equal(response.status, 503);
  response = await worker.fetch(request('/not-a-route', { origin: null }), {}); assert.equal(response.status, 404);
  response = await worker.fetch(request('/catalog', { origin: null, method: 'POST', body: {} }), {}); assert.equal(response.status, 405);
  const env = fixtureEnv();
  response = await worker.fetch(request('/me', { method: 'OPTIONS' }), env);
  assert.equal(response.status, 204); assert.equal(response.headers.get('Access-Control-Allow-Origin'), ORIGIN);
  response = await worker.fetch(request('/catalog', { origin: 'https://evil.example' }), env);
  assert.equal(response.status, 403); assert.equal(response.headers.get('Access-Control-Allow-Origin'), null);
  response = await worker.fetch(request('/catalog'), env); assert.equal(response.status, 503);
  response = await worker.fetch(request('/me'), env); assert.equal(response.status, 401); assert.equal(response.headers.get('Cache-Control'), 'no-store'); env.DB.close();
});
test('catalogue import validates atomically, is idempotent and never trusts supplied identities', async () => {
  const env = fixtureEnv(), worker = fixtureWorker(), input = fixtureCatalog();
  let response = await worker.fetch(request('/admin/catalog', { method: 'POST', body: input, auth: OPERATOR, origin: null }), env);
  assert.equal(response.status, 200); assert.deepEqual(await response.json(), { importedGames: 1, importedPosts: 1 });
  await importCatalog(env.DB, input);
  assert.equal(env.DB.sql.prepare('SELECT count(*) AS n FROM games').get().n, 1);
  assert.equal(env.DB.sql.prepare('SELECT count(*) AS n FROM source_posts').get().n, 1);
  for (const mutate of [
    data => { data.schemaVersion = 2; }, data => { data.games[0].preview.url = 'javascript:alert(1)'; },
    data => { data.games.push(data.games[0]); }, data => { data.games[0].posts.push(data.games[0].posts[0]); },
    data => { data.games[0].author.url = 'https://evil.example/user'; }, data => { data.games[0].firstSeenAt = '2026-10-08T10:00:00.000Z'; },
    data => { data.games[0].posts[0].id = 12345; }, data => { data.games[0].posts[0].author = null; },
  ]) {
    const bad = structuredClone(input); mutate(bad);
    response = await worker.fetch(request('/admin/catalog', { method: 'POST', body: bad, auth: OPERATOR }), env);
    assert.equal(response.status, 400); assert.equal((await catalog(env.DB)).games.length, 1);
  }
  response = await worker.fetch(request('/admin/catalog', { method: 'POST', body: input, auth: await token() }), env); assert.equal(response.status, 403);
  response = await worker.fetch(request('/catalog', { auth: await token() }), env); assert.equal(response.headers.get('Cache-Control'), 'no-store');
  env.DB.close();
});
test('cross-game source conflict aborts an import transaction', async () => {
  const env = fixtureEnv(); await importCatalog(env.DB, fixtureCatalog());
  const other = fixtureGame('ear12');
  other.posts[0].createdAt = '2026-10-08T10:00:00.000Z'; other.firstSeenAt = other.posts[0].createdAt;
  other.posts.push(fixtureGame().posts[0]);
  await assert.rejects(importCatalog(env.DB, fixtureCatalog([other])), e => e.code === 'INVALID_REQUEST');
  assert.equal(env.DB.sql.prepare('SELECT count(*) AS n FROM games').get().n, 1);
  assert.equal(env.DB.sql.prepare('SELECT count(*) AS n FROM source_posts').get().n, 1); env.DB.close();
});
test('price and follows derive caller, upsert once, suppress small cohorts and withdraw immediately', async () => {
  const env = fixtureEnv(), worker = fixtureWorker(); await importCatalog(env.DB, fixtureCatalog());
  const price = async (subject, amount, challenge) => worker.fetch(request('/games/g_abc12/price', { method: 'PUT', auth: await token({ sub: subject }),
    body: { amountCents: amount, currency: 'USD', turnstileToken: challenge } }), env);
  assert.equal((await price('one', 1000, 'one')).status, 200);
  assert.equal((await price('one', 999, 'one-edit')).status, 200);
  let result = await worker.fetch(request('/games/g_abc12/signals'), env);
  assert.deepEqual(await result.json(), { gameId: 'g_abc12', currency: 'USD', minimum: 5, state: 'insufficient', count: null, medianCents: null, buckets: null });
  for (const [user, amount] of [['two', 0], ['three', 1000], ['four', 2000], ['five', 10000]]) assert.equal((await price(user, amount, user)).status, 200);
  result = await worker.fetch(request('/games/g_abc12/signals'), env);
  const ready = await result.json(); assert.equal(ready.count, 5); assert.equal(ready.medianCents, 1000); assert.deepEqual(ready.buckets.map(b => b.count), [1, 1, 1, 1, 1]);
  const auth = await token({ sub: 'one' });
  for (let n = 0; n < 2; n++) assert.equal((await worker.fetch(request('/games/g_abc12/follow', { method: 'PUT', body: {}, auth }), env)).status, 200);
  result = await worker.fetch(request('/me', { auth }), env); const me = await result.json();
  assert.deepEqual(me.follows, ['g_abc12']); assert.equal(me.prices[0].amountCents, 999);
  assert.equal((await worker.fetch(request('/me', { method: 'DELETE', body: { confirm: 'delete-my-data' }, auth }), env)).status, 200);
  result = await worker.fetch(request('/games/g_abc12/signals'), env); assert.equal((await result.json()).count, null);
  result = await worker.fetch(request('/me', { auth }), env); assert.deepEqual(await result.json(), { follows: [], prices: [] });
  env.DB.close();
});
test('price validation rejects coercion, unsupported currency, extra subject and absent challenge', async () => {
  const env = fixtureEnv(), worker = fixtureWorker(); await importCatalog(env.DB, fixtureCatalog()); const auth = await token();
  for (const body of [{ amountCents: '100', currency: 'USD', turnstileToken: 'a' }, { amountCents: 1.5, currency: 'USD', turnstileToken: 'a' },
    { amountCents: -1, currency: 'USD', turnstileToken: 'a' }, { amountCents: 10001, currency: 'USD', turnstileToken: 'a' },
    { amountCents: 100, currency: 'EUR', turnstileToken: 'a' }, { amountCents: 100, currency: 'USD', turnstileToken: 'a', subject: 'someone' },
    { amountCents: 100, currency: 'USD' }]) {
    assert.equal((await worker.fetch(request('/games/g_abc12/price', { method: 'PUT', body, auth }), env)).status, 400);
  }
  assert.equal(env.DB.sql.prepare('SELECT count(*) AS n FROM price_signals').get().n, 0); env.DB.close();
});
test('explicit server account-rate-limit mode supports authenticated signals without a widget; invalid setup fails closed', async () => {
  const env = fixtureEnv(undefined, { SIGNAL_PROTECTION: 'account-rate-limit', TURNSTILE_SECRET_KEY: undefined }), worker = fixtureWorker();
  await importCatalog(env.DB, fixtureCatalog()); const auth = await token();
  let status = await (await worker.fetch(request('/status'), env)).json(); assert.equal(status.signalProtection, 'account-rate-limit'); assert.equal(status.capabilities.signals, true);
  const req = () => request('/games/g_abc12/price', { method: 'PUT', body: { amountCents: 0, currency: 'USD' }, auth });
  assert.equal((await worker.fetch(req(), env)).status, 200);
  for (const change of [{ SIGNAL_PROTECTION: 'invalid' }, { SIGNAL_PROTECTION: undefined }, { RATE_LIMIT_SECRET: undefined }]) {
    assert.equal((await worker.fetch(req(), { ...env, ...change })).status, 503);
    status = await (await worker.fetch(request('/status'), { ...env, ...change })).json(); assert.equal(status.signalProtection, 'unconfigured');
  }
  assert.equal((await worker.fetch(request('/games/g_abc12/price', { method: 'PUT', body: { amountCents: 0, currency: 'USD' }, auth, ip: null }), env)).status, 503);
  env.DB.close();
});
test('threshold and even median rounding are exact', () => {
  assert.equal(aggregate('g_abc12', [0, 10, 20, 30]).count, null);
  assert.equal(aggregate('g_abc12', [0, 0, 0, 1, 10000, 10000]).medianCents, 1);
});
test('request bodies enforce streaming size limits', async () => {
  const env = fixtureEnv(), worker = fixtureWorker(); await importCatalog(env.DB, fixtureCatalog());
  const response = await worker.fetch(request('/me', { method: 'DELETE', auth: await token(), body: { confirm: 'x'.repeat(9000) } }), env);
  assert.equal(response.status, 400); env.DB.close();
});

test('guest and private withdrawals accept empty runtime streams and reject actual body bytes', async () => {
  const env = fixtureEnv(), worker = fixtureWorker(); await importCatalog(env.DB, fixtureCatalog());
  const auth = await token();
  for (const action of ['feedback', 'follow', 'price']) {
    const path = `/games/g_abc12/${action}`;
    for (const payload of ['', '{}']) {
      const base = request(path, { method: 'DELETE', auth });
      base.headers.set('X-Feedback-Key', '01'.repeat(32));
      const body = new ReadableStream({ start(controller) {
        if (payload) controller.enqueue(new TextEncoder().encode(payload));
        controller.close();
      } });
      const incoming = new Request(base, { body, duplex: 'half' });
      assert.notEqual(incoming.body, null);
      const response = await worker.fetch(incoming, env);
      assert.equal(response.status, payload ? 400 : 200, `${action}: ${payload || 'empty stream'}`);
    }
  }
  env.DB.close();
});
