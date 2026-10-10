import test from 'node:test';
import assert from 'node:assert/strict';
import { authenticate, authenticateOperator } from '../src/auth.mjs';
import { verifyChallenge, mutationLimit, take } from '../src/limits.mjs';
import { NOW, OPERATOR, ISSUER, ORIGIN, jwk, token, fixtureEnv, request } from './helpers.mjs';

const deps = { now: () => NOW, fetch: async () => Response.json({ keys: [jwk] }) };
test('session verification accepts a signed default session and derives the subject', async () => {
  const env = fixtureEnv();
  assert.equal(await authenticate(request('/me', { auth: await token({ sub: 'user_real' }) }), env, deps), 'user_real'); env.DB.close();
});
test('session rejects forged signatures, algorithms, issuer, origin, missing claims and expired tokens', async () => {
  const env = fixtureEnv();
  const cases = [
    [await token({ exp: NOW / 1000 - 1 })], [await token({ iss: 'https://attacker.example' })],
    [await token({ azp: 'https://attacker.example' })], [await token({ azp: null })], [await token({ sid: '' })],
    [await token({ sub: '' })], [await token({ iat: NOW / 1000 + 120 })], [await token({ nbf: NOW / 1000 + 120 })],
    [await token({}, { alg: 'none' })], [await token({}, { alg: 'HS256' })], [await token({}, { jku: 'https://attacker.example/keys' })],
    [await token({}, { kid: 'unknown' })], [await token({ sts: 'pending' })],
  ];
  const good = await token();
  const parts = good.split('.'); parts[2] = `${parts[2][0] === 'A' ? 'B' : 'A'}${parts[2].slice(1)}`; cases.push([parts.join('.')]);
  for (const [auth] of cases) await assert.rejects(authenticate(request('/me', { auth }), env, deps), error => error.code === 'UNAUTHENTICATED');
  await assert.rejects(authenticate(new Request('https://api.example/me', { headers: { Cookie: `__session=${good}` } }), env, deps), /valid account session/);
  env.DB.close();
});
test('unknown key refreshes the pinned issuer once, never a token key URL', async () => {
  const env = fixtureEnv(undefined, { CLERK_ISSUER: 'https://other-clerk.example' });
  const calls = [];
  await assert.rejects(authenticate(request('/me', { auth: await token({ iss: env.CLERK_ISSUER }, { kid: 'unknown' }) }), env,
    { now: () => NOW, fetch: async url => { calls.push(url); return Response.json({ keys: [jwk] }); } }));
  assert.deepEqual(calls, [`${env.CLERK_ISSUER}/.well-known/jwks.json`, `${env.CLERK_ISSUER}/.well-known/jwks.json`]); env.DB.close();
});
test('JWKS manual redirects reject 3xx without following or authenticating redirected keys', async () => {
  for (const status of [301, 302, 303, 307, 308]) {
    const env = fixtureEnv(undefined, { CLERK_ISSUER: `https://redirect-${status}.clerk.example` });
    const calls = [];
    await assert.rejects(authenticate(request('/me', { auth: await token({ iss: env.CLERK_ISSUER }) }), env,
      { now: () => NOW, fetch: async (url, options) => {
        calls.push({ url, options });
        return Response.json({ keys: [jwk] }, { status, headers: { Location: 'https://attacker.example/keys' } });
      } }), error => error.code === 'UNAUTHENTICATED');
    assert.equal(calls.length, 1); assert.equal(calls[0].url, `${env.CLERK_ISSUER}/.well-known/jwks.json`);
    assert.equal(calls[0].options.redirect, 'manual');
    assert.deepEqual(calls[0].options.headers, { Accept: 'application/json' }); env.DB.close();
  }
});
test('operator credential is independent and server-fixed; weak/missing setup fails closed', async () => {
  const env = fixtureEnv();
  assert.equal(await authenticateOperator(request('/admin/catalog', { auth: OPERATOR }), env), 'operator');
  await assert.rejects(authenticateOperator(request('/admin/catalog', { auth: await token() }), env), e => e.code === 'FORBIDDEN');
  await assert.rejects(authenticate(request('/me', { auth: OPERATOR }), env, deps), e => e.code === 'UNAUTHENTICATED');
  await assert.rejects(authenticateOperator(request('/admin/catalog', { auth: 'short' }), { ...env, OPERATOR_TOKEN: 'short' }), e => e.code === 'SERVICE_UNAVAILABLE');
  env.DB.close();
});
test('challenge requires action, hostname, timestamp and success, then rejects replay atomically', async () => {
  const env = fixtureEnv();
  const valid = { success: true, action: 'price_signal', hostname: 'playtrace.example', challenge_ts: new Date(NOW).toISOString() };
  const cases = [{ success: false }, { action: 'login' }, { hostname: 'attacker.example' },
    { challenge_ts: new Date(NOW - 301000).toISOString() }, { challenge_ts: new Date(NOW + 31000).toISOString() }, { challenge_ts: 'bad' }];
  for (let i = 0; i < cases.length; i++) await assert.rejects(verifyChallenge(env.DB, env, `bad-token-${i}`,
    { now: () => NOW, fetch: async () => Response.json({ ...valid, ...cases[i] }) }), e => e.code === 'CHALLENGE_FAILED');
  await assert.rejects(verifyChallenge(env.DB, env, 'network-failure', { now: () => NOW, fetch: async () => { throw new Error('network'); } }), e => e.code === 'CHALLENGE_FAILED');
  let calls = 0;
  const challengeDeps = { now: () => NOW, fetch: async () => { calls++; return Response.json(valid); } };
  const attempts = await Promise.allSettled(Array.from({ length: 12 }, () => verifyChallenge(env.DB, env, 'same-challenge', challengeDeps)));
  assert.equal(attempts.filter(item => item.status === 'fulfilled').length, 1); assert.equal(calls, 1); env.DB.close();
});
test('Turnstile manual redirects fail closed without forwarding the verification secret', async () => {
  const env = fixtureEnv();
  for (const status of [301, 302, 303, 307, 308]) {
    const calls = [];
    await assert.rejects(verifyChallenge(env.DB, env, `redirect-${status}`, { now: () => NOW, fetch: async (url, options) => {
      calls.push({ url, options });
      return Response.json({ success: true, action: 'price_signal', hostname: env.TURNSTILE_HOSTNAME,
        challenge_ts: new Date(NOW).toISOString() }, { status, headers: { Location: 'https://attacker.example/verify' } });
    } }), error => error.code === 'CHALLENGE_FAILED');
    assert.equal(calls.length, 1); assert.equal(calls[0].url, 'https://challenges.cloudflare.com/turnstile/v0/siteverify');
    assert.equal(calls[0].options.redirect, 'manual'); assert.equal(calls[0].options.method, 'POST');
  }
  env.DB.close();
});
test('atomic rate upserts cannot race above cap; expiry starts a fresh bucket', async () => {
  const env = fixtureEnv();
  const attempts = await Promise.all(Array.from({ length: 80 }, () => take(env.DB, 'test-bucket', 10, 2000, 1000)));
  assert.equal(attempts.filter(Boolean).length, 10);
  assert.equal(env.DB.sql.prepare('SELECT count FROM rate_limits').get().count, 10);
  assert.equal(await take(env.DB, 'test-bucket', 10, 3000, 2000), true);
  assert.equal(env.DB.sql.prepare('SELECT count FROM rate_limits').get().count, 1); env.DB.close();
});
test('network/account rate limits are independent; stored keys contain no raw address or subject', async () => {
  const env = fixtureEnv();
  for (let user = 0; user < 6; user++) for (let i = 0; i < 10; i++) await mutationLimit(env.DB, env, `user_${user}`, request('/price'), 'price', NOW);
  await assert.rejects(mutationLimit(env.DB, env, 'another_user', request('/price'), 'price', NOW), e => e.code === 'RATE_LIMITED' && e.retryAfterSeconds === 3600);
  await assert.rejects(mutationLimit(env.DB, env, 'user_0', request('/price', { ip: '192.0.2.2' }), 'price', NOW), e => e.code === 'RATE_LIMITED');
  await mutationLimit(env.DB, env, 'user_0', request('/me'), 'privacy', NOW);
  const rows = env.DB.sql.prepare('SELECT * FROM rate_limits').all();
  assert.equal(JSON.stringify(rows).includes('192.0.2.'), false); assert.equal(JSON.stringify(rows).includes('user_0'), false);
  assert.ok(rows.every(row => row.expires_at <= NOW / 1000 + 172800)); env.DB.close();
});
