import test from 'node:test';
import assert from 'node:assert/strict';
import { storePreview, safePreviewUrl, imageType } from '../src/media.mjs';
import { importCatalog, catalog, removal, query } from '../src/store.mjs';
import { acquire, release } from '../src/lease.mjs';
import { fixtureEnv, fixtureCatalog, fixtureWorker, request, NOW, OPERATOR } from './helpers.mjs';

const png = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10, 0, 0, 0, 0]);
const consent = { sourceUrl: 'https://preview.redd.it/art.png', consentEvidenceUrl: 'https://www.reddit.com/message/messages/permission', consentNote: 'Creator consent recorded for this preview.' };
function bucket() {
  const objects = new Map();
  return { objects, async put(key, bytes) { objects.set(key, bytes); }, async get(key) { const bytes = objects.get(key); return bytes ? { body: bytes } : null; }, async delete(key) { objects.delete(key); } };
}
const imageDeps = { now: () => NOW, fetch: async () => new Response(png, { headers: { 'Content-Type': 'image/png' } }) };
test('image fetch rejects unexpected hosts, credentials, ports, IPs, redirects and mismatched signatures', async () => {
  const env = fixtureEnv(undefined, { PREVIEWS: bucket(), PREVIEW_ALLOWED_HOSTS: 'preview.redd.it,127.0.0.1,localhost' });
  for (const url of ['http://preview.redd.it/a', 'https://evil.example/a', 'https://preview.redd.it:444/a',
    'https://user:pass@preview.redd.it/a', 'https://127.0.0.1/a', 'https://localhost/a']) assert.throws(() => safePreviewUrl(url, env));
  assert.throws(() => imageType(new TextEncoder().encode('<svg></svg>'), 'image/png'));
  assert.throws(() => imageType(png, 'text/html'));
  await importCatalog(env.DB, fixtureCatalog());
  await assert.rejects(storePreview(env.DB, env, 'g_abc12', consent, request('/admin/games/g_abc12/preview'), {
    now: () => NOW, fetch: async (_url, options) => { assert.equal(options.redirect, 'manual'); throw new Error('Network failure'); },
  }));
  await assert.rejects(storePreview(env.DB, env, 'g_abc12', consent, request('/admin/games/g_abc12/preview'), {
    now: () => NOW, fetch: async () => new Response(new Uint8Array(5 * 1024 * 1024 + 1), { headers: { 'Content-Type': 'image/png' } }),
  }));
  assert.equal(env.PREVIEWS.objects.size, 0); assert.equal(env.DB.sql.prepare('SELECT count(*) AS n FROM media_assets').get().n, 0); env.DB.close();
});
test('preview manual redirects reject 3xx without fetching another host or storing an asset', async () => {
  const env = fixtureEnv(undefined, { PREVIEWS: bucket(), PREVIEW_ALLOWED_HOSTS: 'preview.redd.it' });
  await importCatalog(env.DB, fixtureCatalog());
  for (const status of [301, 302, 303, 307, 308]) {
    const calls = [];
    await assert.rejects(storePreview(env.DB, env, 'g_abc12', consent, request('/admin/games/g_abc12/preview'), {
      now: () => NOW, fetch: async (url, options) => {
        calls.push({ url, options });
        return new Response(png, { status, headers: { Location: 'https://attacker.example/private.png', 'Content-Type': 'image/png' } });
      },
    }), error => error.code === 'INVALID_REQUEST');
    assert.equal(calls.length, 1); assert.equal(calls[0].url, consent.sourceUrl); assert.equal(calls[0].options.redirect, 'manual');
  }
  assert.equal(env.PREVIEWS.objects.size, 0); assert.equal(env.DB.sql.prepare('SELECT count(*) AS n FROM media_assets').get().n, 0);
  assert.equal((await catalog(env.DB)).games[0].preview.storage, 'external'); env.DB.close();
});
test('consented UUID preview route serves bounded images; removal suppresses access before retryable cleanup', async () => {
  const env = fixtureEnv(undefined, { PREVIEWS: bucket(), PREVIEW_ALLOWED_HOSTS: 'preview.redd.it' });
  await importCatalog(env.DB, fixtureCatalog());
  const worker = fixtureWorker(imageDeps.fetch);
  let response = await worker.fetch(request('/admin/games/g_abc12/preview', { method: 'POST', auth: OPERATOR, body: consent }), env);
  assert.equal(response.status, 200);
  const { preview } = await response.json(), assetId = new URL(preview.url).pathname.split('/').at(-1);
  assert.match(assetId, /^[a-f0-9-]{36}$/); assert.equal(preview.rights, 'owner-consent');
  const asset = env.DB.sql.prepare('SELECT * FROM media_assets').get(); assert.equal(asset.approved_by, 'operator'); assert.equal(asset.consent_note, consent.consentNote);
  assert.equal(JSON.stringify(await catalog(env.DB)).includes(consent.consentNote), false);
  response = await worker.fetch(request(`/media/${assetId}`), env);
  assert.equal(response.status, 200); assert.equal(response.headers.get('Content-Type'), 'image/png');
  assert.equal(response.headers.get('Cache-Control'), 'no-store'); assert.equal(response.headers.get('X-Content-Type-Options'), 'nosniff');
  const deleteObject = env.PREVIEWS.delete;
  env.PREVIEWS.delete = async () => { throw new Error('Storage unavailable'); };
  response = await worker.fetch(request('/admin/games/g_abc12/remove', { method: 'POST', auth: OPERATOR, body: { reason: 'Creator request' } }), env);
  assert.equal(response.status, 503);
  assert.equal((await catalog(env.DB)).games.length, 0);
  assert.equal((await worker.fetch(request(`/media/${assetId}`), env)).status, 404);
  assert.equal(env.DB.sql.prepare('SELECT count(*) AS n FROM media_assets').get().n, 1);
  env.PREVIEWS.delete = deleteObject;
  response = await worker.fetch(request('/admin/games/g_abc12/remove', { method: 'POST', auth: OPERATOR, body: { reason: 'Creator request' } }), env);
  assert.equal(response.status, 200); assert.equal(env.PREVIEWS.objects.size, 0);
  assert.equal(env.DB.sql.prepare('SELECT count(*) AS n FROM games').get().n, 0);
  assert.equal(env.DB.sql.prepare('SELECT count(*) AS n FROM media_assets').get().n, 0);
  assert.equal((await importCatalog(env.DB, fixtureCatalog())).importedGames, 0); env.DB.close();
});
test('removal cannot cascade asset keys while a preview upload holds the same game lease', async () => {
  const env = fixtureEnv(undefined, { PREVIEWS: bucket(), PREVIEW_ALLOWED_HOSTS: 'preview.redd.it' });
  await importCatalog(env.DB, fixtureCatalog());
  const stored = await storePreview(env.DB, env, 'g_abc12', consent, request('/admin/games/g_abc12/preview'), imageDeps);
  const owner = await acquire(env.DB, 'media_lock:g_abc12', NOW, 120000);
  await assert.rejects(removal(env.DB, env.PREVIEWS, 'g_abc12', 'Creator request', new Date(NOW).toISOString()), e => e.code === 'SERVICE_UNAVAILABLE');
  assert.equal(env.DB.sql.prepare('SELECT count(*) AS n FROM media_assets').get().n, 1);
  assert.equal((await catalog(env.DB)).games.length, 0);
  await release(env.DB, 'media_lock:g_abc12', owner);
  assert.deepEqual(await removal(env.DB, env.PREVIEWS, 'g_abc12', 'Creator request', new Date(NOW).toISOString()), { removed: true });
  assert.equal(env.PREVIEWS.objects.size, 0); env.DB.close();
});
test('new catalogue imports cannot invent R2 consent', async () => {
  const env = fixtureEnv(); const input = fixtureCatalog();
  input.games[0].preview.storage = 'r2'; input.games[0].preview.rights = 'owner-consent';
  await assert.rejects(importCatalog(env.DB, input), error => error.code === 'INVALID_REQUEST');
  assert.equal(env.DB.sql.prepare('SELECT count(*) AS n FROM games').get().n, 0); env.DB.close();
});
