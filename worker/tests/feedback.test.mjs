import test from 'node:test';
import assert from 'node:assert/strict';
import { importCatalog, removal } from '../src/store.mjs';
import { acquire } from '../src/lease.mjs';
import { NOW, OPERATOR, fixtureEnv, fixtureWorker, fixtureCatalog, request } from './helpers.mjs';

const keyA = '01'.repeat(32), keyB = '02'.repeat(32);
const body = { displayName: 'Player', body: 'The movement feels great.', idealPriceCents: 1200 };
const guestRequest = (path = '/games/g_abc12/feedback', options = {}, key = keyA) => {
  const value = request(path, options);
  if (key !== null) value.headers.set('X-Feedback-Key', key);
  return value;
};
async function setup() {
  const env = fixtureEnv(undefined, { CLERK_ISSUER: undefined, TURNSTILE_SECRET_KEY: undefined });
  await importCatalog(env.DB, fixtureCatalog());
  return { env, worker: fixtureWorker() };
}

test('quick choices are public, editable in place, counted once and removed from aggregates on moderation or deletion', async () => {
  const { env,worker }=await setup();
  const quick={displayName:'',body:'',idealPriceCents:null,choices:['visuals','idea','controls']};
  const save=async value=>worker.fetch(guestRequest(undefined,{method:'PUT',body:value}),env);
  for(const choices of [['invented'],['idea','idea'],'idea',[null],{},Array(11).fill('idea')]) {
    assert.equal((await save({...quick,choices})).status,400);
  }
  let result=await save(quick);assert.equal(result.status,200);const first=(await result.json()).feedback;
  assert.deepEqual(first.choices,['controls','idea','visuals']);assert.equal(first.body,'');
  result=await save({...quick,choices:['visuals']});assert.equal((await result.json()).feedback.id,first.id);
  let page=await (await worker.fetch(request('/games/g_abc12/feedback'),env)).json();
  assert.equal(page.count,1);assert.equal(page.choices.find(x=>x.id==='visuals').count,1);assert.equal(page.choices.find(x=>x.id==='idea').count,0);
  // A cached old client can edit its note without silently clearing new choices.
  assert.equal((await save(body)).status,200);
  const own=await (await worker.fetch(guestRequest('/games/g_abc12/feedback/mine'),env)).json();assert.deepEqual(own.feedback.choices,['visuals']);
  await worker.fetch(request(`/admin/feedback/${first.id}/hide`,{method:'POST',auth:OPERATOR,body:{reason:'Test moderation'}}),env);
  page=await (await worker.fetch(request('/games/g_abc12/feedback'),env)).json();
  assert.equal(page.count,0);assert.ok(page.choices.every(x=>x.count===0));assert.equal((await save(quick)).status,403);
  await worker.fetch(guestRequest(undefined,{method:'PUT',body:quick},keyB),env);
  await worker.fetch(guestRequest(undefined,{method:'DELETE'},keyB),env);
  page=await (await worker.fetch(request('/games/g_abc12/feedback'),env)).json();assert.ok(page.choices.every(x=>x.count===0));
  env.DB.close();
});

test('guest feedback works without auth, stays public, edits in place and keeps private prices private', async () => {
  const { env, worker } = await setup();
  env.DB.sql.exec("INSERT INTO price_signals VALUES('private-member','g_abc12',9900,'USD','2026-10-10T12:00:00.000Z')");
  const status = await (await worker.fetch(request('/status'), env)).json();
  assert.equal(status.capabilities.feedback, true); assert.equal(status.capabilities.following, false);
  let response = await worker.fetch(guestRequest(undefined, { method: 'PUT', body }), env);
  assert.equal(response.status, 200); assert.equal(response.headers.get('Cache-Control'), 'no-store');
  const first = (await response.json()).feedback;
  const publicPage = await (await worker.fetch(request('/games/g_abc12/feedback'), env)).json();
  assert.equal(publicPage.entries.length, 1); assert.equal(publicPage.count, 1);
  assert.deepEqual(publicPage.idealPrices, { currency: 'USD', count: 1, medianCents: 1200 });
  assert.deepEqual(Object.keys(publicPage.entries[0]).sort(), ['body', 'choices', 'createdAt', 'currency', 'displayName', 'experience', 'id', 'idealPriceCents', 'updatedAt']);
  assert.equal(JSON.stringify(publicPage).includes(keyA), false);
  assert.equal(JSON.stringify(publicPage).includes('private-member'), false);
  response = await worker.fetch(guestRequest(undefined, { method: 'PUT', body: { ...body, body: 'An updated suggestion.', idealPriceCents: null } }), env);
  assert.equal((await response.json()).feedback.id, first.id);
  let own = await (await worker.fetch(guestRequest('/games/g_abc12/feedback/mine'), env)).json();
  assert.equal(own.feedback.body, 'An updated suggestion.');
  own = await (await worker.fetch(guestRequest('/games/g_abc12/feedback/mine', {}, keyB), env)).json();
  assert.equal(own.feedback, null);
  await worker.fetch(guestRequest(undefined, { method: 'DELETE' }, keyB), env);
  assert.equal(env.DB.sql.prepare('SELECT count(*) n FROM feedback').get().n, 1);
  await worker.fetch(guestRequest(undefined, { method: 'DELETE' }), env);
  assert.equal(env.DB.sql.prepare('SELECT count(*) n FROM feedback').get().n, 0);
  assert.equal(env.DB.sql.prepare('SELECT count(*) n FROM price_signals').get().n, 1);
  env.DB.close();
});

test('public feedback accepts a note or an optional exact-cent price and rejects forged identity and invalid input', async () => {
  const { env, worker } = await setup();
  for (const change of [
    { body: '', idealPriceCents: null }, { idealPriceCents: '12' }, { idealPriceCents: 1.5 },
    { idealPriceCents: -1 }, { idealPriceCents: 10001 }, { displayName: 'x'.repeat(41) },
    { body: 'x'.repeat(1501) }, { displayName: 'two\nlines' }, { subject: 'another-person' }, { id: 'forged' },
  ]) assert.equal((await worker.fetch(guestRequest(undefined, { method: 'PUT', body: { ...body, ...change } }), env)).status, 400);
  for (const key of [null, '', 'short', 'A'.repeat(64)]) {
    assert.equal((await worker.fetch(guestRequest(undefined, { method: 'PUT', body }, key), env)).status, 400);
  }
  assert.equal((await worker.fetch(guestRequest(undefined, { method: 'PUT', body, ip: null }), env)).status, 503);
  assert.equal((await worker.fetch(guestRequest(undefined, { method: 'PUT', body }), { ...env, RATE_LIMIT_SECRET: undefined })).status, 503);
  assert.equal((await worker.fetch(guestRequest(undefined, { method: 'PUT', body, origin: 'https://evil.example' }), env)).status, 403);
  for (const valid of [{ ...body, idealPriceCents: null }, { displayName: '', body: '', idealPriceCents: 0 }]) {
    const response = await worker.fetch(guestRequest(undefined, { method: 'PUT', body: valid }), env);
    assert.equal(response.status, 200);
  }
  const row = env.DB.sql.prepare('SELECT * FROM feedback').get();
  assert.equal(row.display_name, 'Guest'); assert.equal(row.ideal_price_cents, 0);
  assert.notEqual(row.guest_key_hash, keyA); assert.equal(JSON.stringify(row).includes('192.0.2.1'), false);
  const options = await worker.fetch(request('/games/g_abc12/feedback', { method: 'OPTIONS' }), env);
  assert.match(options.headers.get('Access-Control-Allow-Headers'), /X-Feedback-Key/);
  env.DB.close();
});

test('guest key and network limits are independent and removal remains available after the write cap', async () => {
  const { env, worker } = await setup();
  for (let i = 0; i < 10; i++) assert.equal((await worker.fetch(guestRequest(undefined, { method: 'PUT', body }), env)).status, 200);
  assert.equal((await worker.fetch(guestRequest(undefined, { method: 'PUT', body }), env)).status, 429);
  assert.equal((await worker.fetch(guestRequest(undefined, { method: 'DELETE' }), env)).status, 200);
  for (let i = 0; i < 50; i++) assert.equal((await worker.fetch(guestRequest(undefined, { method: 'PUT', body }, (i + 100).toString(16).padStart(64, '0')), env)).status, 200);
  assert.equal((await worker.fetch(guestRequest(undefined, { method: 'PUT', body }, keyB), env)).status, 429);
  env.DB.close();
});

test('public pagination handles tied timestamps and median excludes hidden and legacy prices', async () => {
  const { env, worker } = await setup();
  for (let i = 0; i < 24; i++) await worker.fetch(guestRequest(undefined, { method: 'PUT', body: { ...body, idealPriceCents: i * 100 } }, (i + 100).toString(16).padStart(64, '0')), env);
  const first = await (await worker.fetch(request('/games/g_abc12/feedback'), env)).json();
  assert.equal(first.entries.length, 20); assert.equal(first.count, 24); assert.equal(first.idealPrices.medianCents, 1150);
  const second = await (await worker.fetch(request(`/games/g_abc12/feedback?cursor=${first.nextCursor}`), env)).json();
  assert.equal(second.entries.length, 4); assert.equal(second.nextCursor, null);
  assert.equal(new Set([...first.entries, ...second.entries].map(item => item.id)).size, 24);
  assert.equal((await worker.fetch(request('/games/g_abc12/feedback?cursor=bad'), env)).status, 400);
  env.DB.close();
});

test('operator moderation suppresses public text and prices, blocks immediate reposting, and game removal cascades', async () => {
  const { env, worker } = await setup();
  const saved = await (await worker.fetch(guestRequest(undefined, { method: 'PUT', body }), env)).json();
  const path = `/admin/feedback/${saved.feedback.id}/hide`;
  assert.equal((await worker.fetch(request(path, { method: 'POST', body: { reason: 'Reported spam' } }), env)).status, 403);
  assert.equal((await worker.fetch(request(path, { method: 'POST', auth: OPERATOR, body: { reason: 'Reported spam' } }), env)).status, 200);
  const publicPage = await (await worker.fetch(request('/games/g_abc12/feedback'), env)).json();
  assert.equal(publicPage.count, 0); assert.equal(publicPage.idealPrices.medianCents, null);
  const mine = await (await worker.fetch(guestRequest('/games/g_abc12/feedback/mine'), env)).json();
  assert.equal(mine.feedback, null); assert.equal(mine.moderated, true);
  await worker.fetch(guestRequest(undefined, { method: 'DELETE' }), env);
  assert.equal((await worker.fetch(guestRequest(undefined, { method: 'PUT', body }), env)).status, 403);
  await removal(env.DB, null, 'g_abc12', 'Maker request', new Date(NOW).toISOString());
  assert.equal(env.DB.sql.prepare('SELECT count(*) n FROM feedback').get().n, 0);
  assert.equal((await worker.fetch(request('/games/g_abc12/feedback'), env)).status, 404);
  assert.equal((await worker.fetch(guestRequest(undefined, { method: 'PUT', body }), env)).status, 404);
  env.DB.close();
});

test('creator removal between the precheck and guest save atomically rejects new and edited contributions', async () => {
  for (const editing of [false, true]) {
    const { env, worker } = await setup();
    if (editing) assert.equal((await worker.fetch(guestRequest(undefined, { method: 'PUT', body }), env)).status, 200);
    // A concurrent preview operation leaves the tombstoned game row in place
    // until cleanup can retry, so FK constraints alone cannot reject this save.
    await acquire(env.DB, 'media_lock:g_abc12', NOW);
    const prepare = env.DB.prepare.bind(env.DB); let interleaved = false;
    env.DB.prepare = sql => {
      const statement = prepare(sql);
      if (sql.startsWith('INSERT INTO feedback')) {
        const first = statement.first;
        statement.first = async function () {
          interleaved = true;
          await assert.rejects(removal(env.DB, null, 'g_abc12', 'Creator removal', new Date(NOW).toISOString()), error => error.code === 'SERVICE_UNAVAILABLE');
          return first.call(this);
        };
      }
      return statement;
    };
    const response = await worker.fetch(guestRequest(undefined, { method: 'PUT', body: { ...body, body: 'This text must not survive creator removal.' } }), env);
    assert.equal(interleaved, true); assert.equal(response.status, 404);
    assert.equal(env.DB.sql.prepare('SELECT status FROM games').get().status, 'removed');
    assert.equal(env.DB.sql.prepare('SELECT count(*) n FROM removals').get().n, 1);
    assert.equal(env.DB.sql.prepare('SELECT count(*) n FROM feedback').get().n, 0);
    env.DB.close();
  }
});
