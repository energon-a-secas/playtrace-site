import { createHash } from 'node:crypto';
import { valuesFor } from '../js/insight-analysis.js';

const day = 86400000;
const digest = value => createHash('sha256').update(JSON.stringify(value)).digest('hex');
const validDate = value => typeof value === 'string' && Number.isFinite(Date.parse(value));
const hashPattern = /^[a-f0-9]{64}$/;
const dimensions = ['category', 'styles', 'models'];

export function completeSnapshot(snapshot) {
  if (snapshot?.version !== 1 || !validDate(snapshot.observedAt) || !Array.isArray(snapshot.games)
    || snapshot.games.length !== snapshot.pagination?.total || snapshot.pagination.nextCursor !== null
    || new Set(snapshot.games.map(game => game.id)).size !== snapshot.games.length
    || snapshot.games.some(game => !game.id || !validDate(game.firstSeenAt) || !Array.isArray(game.observations)
      || game.observations.some(post => !post.id || !validDate(post.at)))) throw new Error('A complete dated evidence snapshot is required for the weekly brief.');
  return snapshot;
}

// Only fingerprints survive in historical checkpoints. No old titles, authors,
// excerpts, URLs, images or contributions are copied into the history file.
export function checkpoint(snapshot) {
  completeSnapshot(snapshot);
  const entries = snapshot.games.map(game => {
    const metadata = ['title', 'category', 'stage', 'distribution', 'platforms', 'projectUrl', 'storeRelease',
      'demoAvailable', 'demoRelease', 'storeGenres', 'releaseKind', 'storeProvider', 'browserBuild', 'downloadableBuild']
      .map(key => [key, Array.isArray(game[key]) ? [...game[key]].sort() : game[key] ?? null]);
    const posts = [...game.observations].sort((a, b) => a.id.localeCompare(b.id));
    const evidence = posts.map(post => [post.id, post.at, post.coverage, ...['styles', 'models', 'formats', 'engines']
      .map(key => [...(post[key] || [])].sort()), post.evidence || []]);
    return [digest(game.id), game.firstSeenAt, digest(metadata), digest(evidence), posts.map(post => digest(post.id))];
  }).sort((a, b) => a[0].localeCompare(b[0]));
  return { observedAt: snapshot.observedAt, entries };
}

export function validateHistory(history, now) {
  if (!history) return { version: 1, checkpoints: [] };
  if (history.version !== 1 || !Array.isArray(history.checkpoints) || history.checkpoints.length > 14) throw new Error('Invalid insight history.');
  const dates = new Set();
  for (const point of history.checkpoints) {
    const date = point?.observedAt?.slice(0, 10);
    if (!validDate(point?.observedAt) || Date.parse(point.observedAt) > now || dates.has(date)
      || !Array.isArray(point.entries) || point.entries.length > 20000) throw new Error('Invalid insight checkpoint.');
    dates.add(date);
    const ids = new Set();
    for (const row of point.entries) {
      if (!Array.isArray(row) || row.length !== 5 || !hashPattern.test(row[0]) || ids.has(row[0])
        || !validDate(row[1]) || !hashPattern.test(row[2]) || !hashPattern.test(row[3])
        || !Array.isArray(row[4]) || row[4].some(id => !hashPattern.test(id))) throw new Error('Invalid insight checkpoint entry.');
      ids.add(row[0]);
    }
  }
  // An explicit projection also drops any extra fields supplied by a response.
  return { version: 1, checkpoints: history.checkpoints.map(point => ({ observedAt: point.observedAt,
    entries: point.entries.map(row => [row[0], row[1], row[2], row[3], [...new Set(row[4])]]) })) };
}

export function catalogueChanges(current, previous) {
  if (!previous) return null;
  const before = new Map(previous.entries.map(row => [row[0], row]));
  const after = new Map(current.entries.map(row => [row[0], row]));
  const beforePosts = new Set(previous.entries.flatMap(row => row[4]));
  const afterPosts = new Set(current.entries.flatMap(row => row[4]));
  const counts = { newlyShared: 0, backfilled: 0, metadataUpdated: 0, evidenceUpdated: 0, regrouped: 0, removed: 0 };
  for (const row of current.entries) {
    const old = before.get(row[0]);
    if (old) {
      if (row[2] !== old[2]) counts.metadataUpdated++;
      if (row[3] !== old[3]) counts.evidenceUpdated++;
    } else if (row[4].some(id => beforePosts.has(id))) counts.regrouped++;
    else counts[Date.parse(row[1]) > Date.parse(previous.observedAt) ? 'newlyShared' : 'backfilled']++;
  }
  for (const row of previous.entries) if (!after.has(row[0])) {
    if (row[4].some(id => afterPosts.has(id))) counts.regrouped++;
    else counts.removed++;
  }
  return { from: previous.observedAt, to: current.observedAt, ...counts };
}

function cohort(games, start, end) {
  const inWeek = at => Date.parse(at) >= start && Date.parse(at) < end;
  const arrivals = games.filter(game => inWeek(game.firstSeenAt));
  const active = games.map(game => ({ ...game, observations: game.observations.filter(post => inWeek(post.at)) })).filter(game => game.observations.length);
  const distributions = Object.fromEntries(dimensions.map(dimension => {
    const population = dimension === 'category' ? arrivals : active;
    const counts = new Map(); let known = 0;
    for (const game of population) {
      const values = valuesFor(game, dimension);
      if (values.length) known++;
      for (const value of values) counts.set(value, (counts.get(value) || 0) + 1);
    }
    return [dimension, { total: population.length, unknown: population.length - known,
      values: [...counts].map(([label, count]) => ({ label, count })).sort((a, b) => b.count - a.count || a.label.localeCompare(b.label)) }];
  }));
  return { start: new Date(start).toISOString(), end: new Date(end - 1).toISOString(), arrivals: arrivals.length,
    active: active.length, posts: new Set(active.flatMap(game => game.observations.map(post => post.id))).size,
    fullText: active.filter(game => game.observations.some(post => post.coverage === 'full-text')).length,
    availableBuilds: arrivals.filter(game => ['playable', 'released'].includes(game.stage)).length,
    unknownBuilds: arrivals.filter(game => !game.stage || game.stage === 'unknown').length, distributions };
}

export function buildWeeklyBrief(snapshot, savedHistory = null, priorSnapshot = null) {
  completeSnapshot(snapshot);
  const now = Date.parse(snapshot.observedAt), current = checkpoint(snapshot);
  const history = validateHistory(savedHistory, now);
  if (!history.checkpoints.length && priorSnapshot && Date.parse(priorSnapshot.observedAt) < now) history.checkpoints.push(checkpoint(priorSnapshot));
  const old = [...history.checkpoints].filter(point => Date.parse(point.observedAt) < now).sort((a, b) => a.observedAt.localeCompare(b.observedAt));
  const baseline = old.filter(point => Date.parse(point.observedAt) <= now - 7 * day).at(-1) || old[0];
  // First publication of each UTC day is immutable; corrections later that day
  // remain visible in the comparison instead of overwriting their baseline.
  if (!history.checkpoints.some(point => point.observedAt.slice(0, 10) === current.observedAt.slice(0, 10))) history.checkpoints.push(current);
  history.checkpoints = history.checkpoints.sort((a, b) => a.observedAt.localeCompare(b.observedAt)).slice(-14);
  const date = new Date(now); date.setUTCHours(0, 0, 0, 0);
  const end = +date - ((date.getUTCDay() + 6) % 7) * day;
  return { history, brief: { version: 1, observedAt: snapshot.observedAt, generatedAt: snapshot.generatedAt,
    categories: (snapshot.categories || []).map(({ id, label }) => ({ id, label })),
    latest: cohort(snapshot.games, end - 7 * day, end), previous: cohort(snapshot.games, end - 14 * day, end - 7 * day),
    changes: catalogueChanges(current, baseline) } };
}

export async function fetchPreviousInsights(fetcher = fetch) {
  async function read(file, optional = false) {
    const response = await fetcher(`https://playtrace.neorgon.com/data/${file}`, { signal: AbortSignal.timeout(30000), cache: 'no-store' });
    if (optional && response.status === 404) return null;
    if (!response.ok) throw new Error('Previous insight history could not be read. Keeping the previous deployment.');
    const reader = response.body.getReader(); const chunks = []; let size = 0;
    try {
      for (;;) {
        const { done, value } = await reader.read(); if (done) break;
        size += value.length; if (size > 16 * 1024 * 1024) throw new Error('Insight history exceeds publication bounds.');
        chunks.push(Buffer.from(value));
      }
    } finally { await reader.cancel(); }
    return JSON.parse(Buffer.concat(chunks).toString('utf8'));
  }
  const history = await read('insight-history.json', true);
  return { savedHistory: history, priorSnapshot: history ? null : await read('community-insights.json', true) };
}
