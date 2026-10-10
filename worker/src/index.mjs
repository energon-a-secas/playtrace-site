import { json, errorResponse, exactKeys, readJson, readBytes, checkOrigin, withCors, notFound, strongSecret } from './http.mjs';
import { authenticate, authenticateOperator, accountConfigured } from './auth.mjs';
import { database, catalog, importCatalog, meta, removal } from './store.mjs';
import { signals, getMe, deleteMe, mutateGame } from './accounts.mjs';
import { ingest, ingestionConfigured, COMMUNITY_CREATED_AT } from './ingestion.mjs';
import { mediaConfigured, storePreview, serveMedia } from './media.mjs';
import { signalProtection } from './limits.mjs';
import { text } from './validation.mjs';
import { feedbackConfigured, publicFeedback, ownFeedback, writeFeedback, hideFeedback } from './feedback.mjs';

const routes = [
  [/^\/status$/, ['GET'], 'status'],
  [/^\/catalog$/, ['GET'], 'catalog'],
  [/^\/me$/, ['GET', 'DELETE'], 'me'],
  [/^\/games\/(g_[a-z0-9]{5,12})\/signals$/, ['GET'], 'signals'],
  [/^\/games\/(g_[a-z0-9]{5,12})\/feedback$/, ['GET', 'PUT', 'DELETE'], 'feedback'],
  [/^\/games\/(g_[a-z0-9]{5,12})\/feedback\/mine$/, ['GET'], 'ownFeedback'],
  [/^\/games\/(g_[a-z0-9]{5,12})\/(price|follow)$/, ['PUT', 'DELETE'], 'mutation'],
  [/^\/admin\/catalog$/, ['POST'], 'import'],
  [/^\/admin\/ingest$/, ['POST'], 'ingest'],
  [/^\/admin\/backfill$/, ['POST'], 'backfill'],
  [/^\/admin\/feedback\/([a-f0-9-]{36})\/hide$/, ['POST'], 'hideFeedback'],
  [/^\/admin\/games\/(g_[a-z0-9]{5,12})\/(remove|preview)$/, ['POST'], 'adminGame'],
  [/^\/media\/([a-f0-9-]{36})$/, ['GET'], 'media'],
];
async function status(env) {
  const head = env.DB ? await meta(env.DB, 'catalog') : null;
  const ing = env.DB ? await meta(env.DB, 'ingestion') : null;
  const history = env.DB ? await meta(env.DB, 'history') : null;
  const protection = accountConfigured(env) ? signalProtection(env) : 'unconfigured';
  return { schemaVersion: 1, capabilities: { catalog: Boolean(head), feedback: feedbackConfigured(env), signals: protection !== 'unconfigured',
    following: accountConfigured(env), ingestion: ingestionConfigured(env), mediaStorage: mediaConfigured(env) && strongSecret(env.OPERATOR_TOKEN) },
  ingestion: { state: !ingestionConfigured(env) ? 'unconfigured' : ing?.state || 'never',
    lastAttemptAt: ing?.lastAttemptAt || null, lastSuccessAt: ing?.lastSuccessAt || null, coverageThrough: ing?.coverageThrough || null },
  history: { state: !ingestionConfigured(env) ? 'unconfigured' : history?.state || 'never', communityCreatedAt: COMMUNITY_CREATED_AT,
    startedAt: history?.startedAt || null, scannedThrough: history?.scannedThrough || null,
    completedThrough: history?.state === 'ok' ? history.coverageThrough : null,
    lastAttemptAt: history?.lastAttemptAt || null },
  minimumSignals: 5, signalProtection: protection };
}
// Dependencies are passed by the test harness, never read from an environment
// flag or browser input. The deployed default always uses real Web APIs.
export function createWorker(overrides = {}) {
  const deps = { fetch: globalThis.fetch.bind(globalThis), now: () => Date.now(), sleep: ms => new Promise(resolve => setTimeout(resolve, ms)), ...overrides };
  return {
    async fetch(request, env) {
      let origin = null;
      try {
        origin = checkOrigin(request, env);
        const url = new URL(request.url);
        if (!url.pathname.startsWith('/api/v1/')) throw notFound();
        const path = url.pathname.slice('/api/v1'.length);
        const route = routes.find(([pattern]) => pattern.test(path));
        if (!route) throw notFound();
        const [pattern, methods, action] = route;
        if (request.method === 'OPTIONS') return withCors(new Response(null, { status: 204, headers: {
          'Access-Control-Allow-Methods': methods.join(', '), 'Access-Control-Allow-Headers': 'Authorization, Content-Type, X-Feedback-Key',
          'Access-Control-Max-Age': '600', 'Cache-Control': 'no-store',
        } }), origin);
        if (!methods.includes(request.method)) return withCors(json({ error: { code: 'INVALID_REQUEST', message: 'Method not allowed.' } }, 405, { Allow: methods.join(', ') }), origin);
        const match = pattern.exec(path);
        let result;
        if (action === 'status') result = json(await status(env), 200, { 'Cache-Control': request.headers.has('Authorization') ? 'no-store' : 'public, max-age=60' });
        else if (action === 'catalog') result = json(await catalog(database(env), { limit: url.searchParams.get('pageSize') || 200,
          cursor: url.searchParams.get('cursor') }), 200, { 'Cache-Control': request.headers.has('Authorization') ? 'no-store' : 'public, max-age=60' });
        else if (action === 'signals') result = json(await signals(database(env), match[1]));
        else if (action === 'feedback') {
          const db = database(env);
          if (request.method === 'GET') result = json(await publicFeedback(db, match[1], url.searchParams.get('cursor')));
          else {
            // Workerd can expose an empty stream for a bodyless DELETE.
            if (request.method === 'DELETE') await readBytes(request.body, 0);
            result = json(await writeFeedback(db, env, request, match[1], request.method === 'PUT' ? await readJson(request) : null, deps));
          }
        }
        else if (action === 'ownFeedback') result = json(await ownFeedback(database(env), env, request, match[1]));
        else if (action === 'media') result = await serveMedia(database(env), env, match[1]);
        else if (action === 'me' || action === 'mutation') {
          const db = database(env);
          const subject = await authenticate(request, env, deps);
          if (action === 'me') result = json(request.method === 'GET' ? await getMe(db, subject) : await deleteMe(db, env, subject, request, await readJson(request), deps));
          else {
            if (request.method === 'DELETE') await readBytes(request.body, 0);
            result = json(await mutateGame(db, env, subject, request, match[1], match[2], request.method === 'PUT' ? await readJson(request) : null, deps));
          }
        } else {
          await authenticateOperator(request, env);
          const db = database(env);
          const body = await readJson(request, action === 'import' ? 2 * 1024 * 1024 : 8192);
          if (action === 'import') result = json(await importCatalog(db, body));
          else if (action === 'ingest') { exactKeys(body, []); result = json(await ingest(env, deps)); }
          else if (action === 'backfill') { exactKeys(body, []); result = json(await ingest(env, deps, true)); }
          else if (action === 'hideFeedback') result = json(await hideFeedback(db, match[1], body));
          else if (match[2] === 'remove') {
            exactKeys(body, ['reason']); text(body.reason, 1200);
            result = json(await removal(db, env.PREVIEWS, match[1], body.reason, new Date(deps.now()).toISOString()));
          } else result = json(await storePreview(db, env, match[1], body, request, deps));
        }
        return withCors(result, origin);
      } catch (error) { return withCors(errorResponse(error), origin); }
    },
    async scheduled(_event, env, context) {
      const run = (async () => {
        const recent = await ingest(env, deps);
        if (recent.status === 'ok') await ingest(env, deps, true);
      })();
      if (context?.waitUntil) context.waitUntil(run);
      else await run;
    },
  };
}
export default createWorker();
