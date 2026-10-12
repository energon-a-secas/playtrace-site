import { getHighlights, saveHighlights, rotateHighlights } from './highlights.mjs';
import { rating, rateGame } from './ratings.mjs';
import { researchList, getResearch, saveResearch, researchResponse, researchMetrics } from './research.mjs';
import { projectContext } from './references.mjs';
import { listJobs, enqueueJobs, runJobs, updateJob, queueStoreMaintenance } from './jobs.mjs';
import { consolidateReposts, resolveGame } from './duplicates.mjs';
import { json, errorResponse, exactKeys, readJson, readBytes, checkOrigin, withCors, notFound, strongSecret } from './http.mjs';
import { authenticate, authenticateOperator, accountConfigured } from './auth.mjs';
import { database, catalog, importCatalog, meta, removal } from './store.mjs';
import { publicCacheKey, versionedPublicKey, invalidatePublicCache, readPublicCache, writePublicCache } from './public-cache.mjs';
import { signals, getMe, deleteMe, mutateGame, syncFavorites } from './accounts.mjs';
import { ingest, ingestionConfigured, COMMUNITY_CREATED_AT } from './ingestion.mjs';
import { mediaConfigured, storePreview, serveMedia } from './media.mjs';
import { signalProtection } from './limits.mjs';
import { text } from './validation.mjs';
import { feedbackConfigured, publicFeedback, ownFeedback, writeFeedback, hideFeedback } from './feedback.mjs';
import { adminConfigured, authorizeAdmin, members } from './admin.mjs';
import { submitChange, inbox, resolveChange } from './requests.mjs';
import { editorGame, editPreview } from './editor.mjs';
import { editDetails } from './details.mjs';
import { createCategory } from './categories.mjs';
import { gameStore, refreshSteamBatch } from './steam.mjs';
import { hydrateMedia } from './assets.mjs';
import { refreshSourceBatch } from './source-evidence.mjs';
import { removeEntry, removeSourcePost } from './moderation.mjs';
import { quizInfo, startQuiz, finishQuiz, deleteQuizData, quizMetrics } from './quiz.mjs';

const routes = [
  [/^\/highlights$/, ['GET'], 'highlights'],
  [/^\/admin\/highlights$/, ['GET','PUT'], 'editorHighlights'],
  [/^\/games\/(g_[a-z0-9]{5,12})\/resolve$/, ['GET'], 'resolveGame'],
  [/^\/games\/(g_[a-z0-9]{5,12})\/context$/, ['GET'], 'context'],
  [/^\/games\/(g_[a-z0-9]{5,12})\/rating$/, ['GET','PUT','DELETE'], 'rating'],
  [/^\/research$/, ['GET'], 'researchList'],
  [/^\/research\/([a-z][a-z0-9-]{2,59})$/, ['GET'], 'researchGame'],
  [/^\/research\/([a-z][a-z0-9-]{2,59})\/responses$/, ['GET','PUT','DELETE'], 'researchResponse'],
  [/^\/admin\/research$/, ['GET'], 'editorResearchList'],
  [/^\/admin\/research\/([a-z][a-z0-9-]{2,59})$/, ['PUT'], 'editorResearchSave'],
  [/^\/admin\/research\/([a-z][a-z0-9-]{2,59})\/metrics$/, ['GET'], 'editorResearchMetrics'],
  [/^\/admin\/jobs$/, ['GET','POST'], 'editorJobs'],
  [/^\/admin\/jobs\/run$/, ['POST'], 'editorJobsRun'],
  [/^\/admin\/jobs\/([a-f0-9-]{36})$/, ['PUT'], 'editorJob'],
  [/^\/admin\/reposts$/, ['GET','POST'], 'editorReposts'],
  [/^\/admin\/campaign$/, ['POST'], 'campaign'],
  [/^\/status$/, ['GET'], 'status'],
  [/^\/catalog$/, ['GET'], 'catalog'],
  [/^\/quiz$/, ['GET'], 'quizInfo'],
  [/^\/quiz\/rounds$/, ['POST'], 'quizStart'],
  [/^\/quiz\/rounds\/mine$/, ['DELETE'], 'quizDelete'],
  [/^\/quiz\/rounds\/([a-f0-9-]{36})$/, ['PUT'], 'quizFinish'],
  [/^\/admin\/quiz-metrics$/, ['GET'], 'editorQuiz'],
  [/^\/me$/, ['GET', 'DELETE'], 'me'],
  [/^\/me\/favorites$/, ['PUT'], 'favorites'],
  [/^\/games\/(g_[a-z0-9]{5,12})\/signals$/, ['GET'], 'signals'],
  [/^\/games\/(g_[a-z0-9]{5,12})\/feedback$/, ['GET', 'PUT', 'DELETE'], 'feedback'],
  [/^\/games\/(g_[a-z0-9]{5,12})\/feedback\/mine$/, ['GET'], 'ownFeedback'],
  [/^\/games\/(g_[a-z0-9]{5,12})\/store$/, ['GET'], 'store'],
  [/^\/games\/(g_[a-z0-9]{5,12})\/change-requests$/, ['POST'], 'changeRequest'],
  [/^\/games\/(g_[a-z0-9]{5,12})\/(price|follow)$/, ['PUT', 'DELETE'], 'mutation'],
  [/^\/admin\/catalog$/, ['POST'], 'import'],
  [/^\/admin\/ingest$/, ['POST'], 'ingest'],
  [/^\/admin\/backfill$/, ['POST'], 'backfill'],
  [/^\/admin\/enrich$/, ['POST'], 'enrich'],
  [/^\/admin\/me$/, ['GET'], 'editorMe'],
  [/^\/admin\/members$/, ['GET', 'PUT'], 'editorMembers'],
  [/^\/admin\/categories$/, ['POST'], 'editorCategories'],
  [/^\/admin\/requests$/, ['GET'], 'editorInbox'],
  [/^\/admin\/requests\/([a-f0-9-]{36})$/, ['PUT'], 'editorRequest'],
  [/^\/admin\/games\/(g_[a-z0-9]{5,12})$/, ['GET'], 'editorGame'],
  [/^\/admin\/games\/(g_[a-z0-9]{5,12})\/image$/, ['PUT'], 'editorImage'],
  [/^\/admin\/games\/(g_[a-z0-9]{5,12})\/details$/, ['PUT'], 'editorDetails'],
  [/^\/admin\/games\/(g_[a-z0-9]{5,12})\/delete$/, ['POST'], 'editorRemove'],
  [/^\/admin\/games\/(g_[a-z0-9]{5,12})\/posts\/([a-z0-9]{5,12})\/remove$/, ['POST'], 'editorRemovePost'],
  [/^\/admin\/games\/(g_[a-z0-9]{5,12})\/media$/, ['POST'], 'editorMedia'],
  [/^\/admin\/feedback\/([a-f0-9-]{36})\/hide$/, ['POST'], 'hideFeedback'],
  [/^\/admin\/games\/(g_[a-z0-9]{5,12})\/(remove|preview)$/, ['POST'], 'adminGame'],
  [/^\/media\/([a-f0-9-]{36})$/, ['GET'], 'media'],
];
async function status(env) {
  const head = env.DB ? await meta(env.DB, 'catalog') : null;
  const ing = env.DB ? await meta(env.DB, 'ingestion') : null;
  const history = env.DB ? await meta(env.DB, 'history') : null;
  const protection = accountConfigured(env) ? signalProtection(env) : 'unconfigured';
  return { schemaVersion: 1, capabilities: { ratings: feedbackConfigured(env), research: feedbackConfigured(env), catalog: Boolean(head), feedback: feedbackConfigured(env), quiz: feedbackConfigured(env), changeRequests: feedbackConfigured(env), admin: adminConfigured(env), steam: Boolean(env.DB), signals: protection !== 'unconfigured',
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
    async fetch(request, env, context) {
      let origin = null;
      const cache=deps.cache??globalThis.caches?.default;
      let changedPublic=false;
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
        const key=cache?await versionedPublicKey(env,publicCacheKey(request,action)):null;
        const cached=await readPublicCache(cache,key);
        if(cached)return withCors(cached,origin);
        let result;
        if (action === 'status') result = json(await status(env), 200, { 'Cache-Control': request.headers.has('Authorization') ? 'no-store' : 'public, max-age=60' });
        else if (action === 'catalog') result = json(await catalog(database(env), { limit: url.searchParams.get('pageSize') || 200,
          cursor: url.searchParams.get('cursor') }), 200, { 'Cache-Control': request.headers.has('Authorization') ? 'no-store' : 'public, max-age=60' });
        else if (action === 'highlights') result = json(await getHighlights(database(env)), 200, { 'Cache-Control': 'public, max-age=60' });
        else if (action === 'resolveGame') result = json(await resolveGame(database(env),match[1]));
        else if (action === 'context') result = json(await projectContext(database(env),match[1]));
        else if (action === 'rating') {
          if(request.method==='GET'&&!request.headers.has('X-Feedback-Key')) result=json(await rating(database(env),match[1]));
          else { if(request.method==='DELETE')await readBytes(request.body,0); result=json(await rateGame(database(env),env,request,match[1],request.method==='PUT'?await readJson(request):null,deps)); }
        }
        else if (action === 'researchList') result=json(await researchList(database(env)));
        else if (action === 'researchGame') result=json(await getResearch(database(env),match[1],url.searchParams.get('game')));
        else if (action === 'researchResponse') {
          if(request.method==='DELETE')await readBytes(request.body,0);
          result=json(await researchResponse(database(env),env,request,match[1],url.searchParams.get('game'),request.method==='PUT'?await readJson(request):null,deps));
        }
        else if (action === 'signals') result = json(await signals(database(env), match[1]));
        else if (action === 'quizInfo') result = json(await quizInfo(database(env)));
        else if (action === 'quizStart') result = json(await startQuiz(database(env),env,request,await readJson(request),deps),201);
        else if (action === 'quizFinish') result = json(await finishQuiz(database(env),env,request,match[1],await readJson(request),deps));
        else if (action === 'quizDelete') { await readBytes(request.body,0); result=json(await deleteQuizData(database(env),env,request,deps)); }
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
        else if (action === 'store') result = json(await gameStore(database(env), match[1], deps));
        else if (action === 'changeRequest') result = json(await submitChange(database(env), env, request, match[1], await readJson(request), deps), 201);
        else if (action.startsWith('editor')) {
          const admin = await authorizeAdmin(request, env, deps), db = database(env);
          changedPublic=request.method!=='GET'&&['editorHighlights','editorImage','editorDetails','editorMedia','editorCategories','editorJobsRun','editorReposts','editorRemove','editorRemovePost'].includes(action);
          if (action === 'editorMe') result = json({ email: admin.email, role: admin.role, integrations: { jev: Boolean(env.JEV_API_KEY), itch: Boolean(env.ITCHIO_API_TOKEN) } });
          else if(action==='editorHighlights') result=json(request.method==='GET'?await getHighlights(db,true):await saveHighlights(db,await readJson(request),admin,deps));
          else if(action==='editorResearchList')result=json(await researchList(db,true));
          else if(action==='editorResearchSave')result=json(await saveResearch(db,match[1],await readJson(request),admin,deps));
          else if(action==='editorResearchMetrics')result=json(await researchMetrics(db,match[1]));
          else if(action==='editorJobs')result=json(request.method==='GET'?await listJobs(db,url.searchParams.get('status'),url.searchParams.get('cursor'),url.searchParams.get('kind')):await enqueueJobs(db,await readJson(request),admin,deps));
          else if(action==='editorJobsRun'){const options=await readJson(request);exactKeys(options,Object.hasOwn(options||{},'kind')?['kind']:[]);result=json(await runJobs(db,env,deps,1,options.kind??'all'));}
          else if(action==='editorJob')result=json(await updateJob(db,match[1],await readJson(request),admin,deps));
          else if(action==='editorReposts'){if(request.method==='POST')exactKeys(await readJson(request),[]);result=json(await consolidateReposts(db,deps,request.method==='POST',env.PREVIEWS));}
          else if (action === 'editorMembers') result = json(await members(db, admin, request.method === 'PUT' ? await readJson(request) : undefined));
          else if (action === 'editorCategories') result = json(await createCategory(db, await readJson(request), admin, deps));
          else if (action === 'editorInbox') result = json(await inbox(db, url.searchParams.get('status'), url.searchParams.get('cursor')));
          else if (action === 'editorQuiz') result = json(await quizMetrics(db));
          else if (action === 'editorRequest') result = json(await resolveChange(db, match[1], await readJson(request), admin, deps));
          else if (action === 'editorGame') result = json(await editorGame(db, match[1]));
          else if (action === 'editorRemove') result = json(await removeEntry(db,env,match[1],await readJson(request),admin,deps));
          else if (action === 'editorRemovePost') result = json(await removeSourcePost(db,match[1],match[2],await readJson(request),admin,deps));
          else if (action === 'editorImage') result = json(await editPreview(db, env, match[1], await readJson(request, 7 * 1024 * 1024), request, admin, deps));
          else if (action === 'editorDetails') { await editDetails(db, match[1], await readJson(request), admin, deps); result = json(await editorGame(db, match[1])); }
          else { exactKeys(await readJson(request), []); result = json(await hydrateMedia(env, deps, match[1])); }
        }
        else if (action === 'media') result = await serveMedia(database(env), env, match[1]);
        else if (action === 'me' || action === 'mutation' || action === 'favorites') {
          const db = database(env);
          const subject = await authenticate(request, env, deps);
          if (action === 'favorites') result = json(await syncFavorites(db, env, subject, request, await readJson(request, 16384), deps));
          else if (action === 'me') result = json(request.method === 'GET' ? await getMe(db, subject) : await deleteMe(db, env, subject, request, await readJson(request), deps));
          else {
            if (request.method === 'DELETE') await readBytes(request.body, 0);
            result = json(await mutateGame(db, env, subject, request, match[1], match[2], request.method === 'PUT' ? await readJson(request) : null, deps));
          }
        } else {
          await authenticateOperator(request, env);
          changedPublic=request.method!=='GET'&&['import','ingest','backfill','enrich','adminGame'].includes(action);
          const db = database(env);
          const body = await readJson(request, action === 'import' ? 2 * 1024 * 1024 : 8192);
          if (action === 'campaign') {
            exactKeys(body,['action','options']);
            changedPublic=body.action==='run'||(body.action==='reposts'&&body.options?.apply===true);
            if(body.action==='enqueue')result=json(await enqueueJobs(db,body.options,{subject:'operator'},deps));
            else if(body.action==='run'){exactKeys(body.options,Object.hasOwn(body.options||{},'kind')?['kind']:[]);result=json(await runJobs(db,env,deps,2,body.options.kind??'all'));}
            else if(body.action==='reposts'){exactKeys(body.options,['apply']);if(typeof body.options.apply!=='boolean')throw notFound();result=json(await consolidateReposts(db,deps,body.options.apply,env.PREVIEWS));}
            else if(body.action==='jobs'){exactKeys(body.options,['status','cursor']);result=json(await listJobs(db,body.options.status,body.options.cursor));}
            else throw notFound();
          }
          else if (action === 'import') result = json(await importCatalog(db, body));
          else if (action === 'ingest') { exactKeys(body, []); result = json(await ingest(env, deps)); }
          else if (action === 'backfill') { exactKeys(body, []); result = json(await ingest(env, deps, true)); }
          else if (action === 'enrich') { exactKeys(body, []); result = json({ steam: await refreshSteamBatch(db, deps), media: await hydrateMedia(env, deps) }); }
          else if (action === 'hideFeedback') result = json(await hideFeedback(db, match[1], body));
          else if (match[2] === 'remove') {
            exactKeys(body, ['reason']); text(body.reason, 1200);
            result = json(await removal(db, env.PREVIEWS, match[1], body.reason, new Date(deps.now()).toISOString()));
          } else result = json(await storePreview(db, env, match[1], body, request, deps));
        }
        if(changedPublic&&cache)await invalidatePublicCache(env);
        const save=writePublicCache(cache,key,result);
        if(context?.waitUntil)context.waitUntil(save);else await save;
        return withCors(result, origin);
      } catch (error) {
        // A removal can commit its tombstone before a retryable cleanup fails.
        if(changedPublic&&cache)try{await invalidatePublicCache(env);}catch{}
        return withCors(errorResponse(error), origin);
      }
    },
    async scheduled(event, env, context) {
      const run = (async () => {
        const maintenance=event?.cron==='5,45 * * * *';
        const sourceTick=event?.cron==='45 * * * *'||(maintenance&&new Date(event.scheduledTime??deps.now()).getUTCMinutes()===45);
        // Separate invocations keep the complete handler below the D1 budget,
        // including six cold Steam caches and a ten-post media hydration batch.
        if (event?.cron === '0 3,4 * * 6') return (await rotateHighlights(database(env), deps)).rotated;
        if (event?.cron === '20 * * * *') { const db=database(env); await queueStoreMaintenance(db,deps); return (await runJobs(db,env,deps,2)).processed>0; }
        if (event?.cron === '50 * * * *') return (await consolidateReposts(database(env),deps,true,env.PREVIEWS)).merged>0;
        if (sourceTick) return ingestionConfigured(env) ? (await refreshSourceBatch(database(env),deps)).updatedGames>0 : false;
        if (event?.cron === '5 * * * *'||maintenance) {
          const db = database(env);
          const steam=await refreshSteamBatch(db, deps);
          const recent = await meta(db, 'ingestion'), history = await meta(db, 'history');
          const media=ingestionConfigured(env) && recent?.state === 'ok' && history?.state === 'ok' ? await hydrateMedia(env, deps) : null;
          return steam.checked>0||media?.checked>0;
        }
        const recent = await ingest(env, deps);
        if (recent.status === 'ok') await ingest(env, deps, true);
        return true; // Coverage/status watermarks changed even with no new posts.
      })().then(async changed=>{if(changed&&(deps.cache??globalThis.caches?.default))await invalidatePublicCache(env);});
      if (context?.waitUntil) context.waitUntil(run);
      else await run;
    },
  };
}
export default createWorker();
