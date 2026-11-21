#!/usr/bin/env node
// Offline analysis of the public catalogue; no network, credentials or writes.
// Usage: node scripts/analyze-catalogue.mjs data/public-catalog.json > report.json
import fs from 'node:fs';
import { createHash } from 'node:crypto';
import { pathToFileURL } from 'node:url';
import assert from 'node:assert/strict';
import { distributionFor } from '../js/collection.js';

const tally = (rows, key) => Object.fromEntries([...rows.reduce((map, row) => {
  const value = key(row); map.set(value, (map.get(value) || 0) + 1); return map;
}, new Map())].sort((a, b) => b[1] - a[1] || String(a[0]).localeCompare(String(b[0]))));
const count = (rows, predicate) => rows.filter(predicate).length;
const unique = values => new Set(values).size;
const median = values => {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b), middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
};
const day = 86400000;
function destinationKey(game) {
  const url = new URL(game.projectUrl);
  if (distributionFor(game.projectUrl)?.id === 'steam') return `${url.hostname}/app/${/^\/app\/(\d+)/.exec(url.pathname)[1]}`;
  // Preserve non-tracking query parameters; do not assume all paths on a host
  // are the same game. Identical URLs are candidates, never automatic merges.
  for (const key of [...url.searchParams.keys()]) if (/^utm_|^(fbclid|gclid)$/i.test(key)) url.searchParams.delete(key);
  url.searchParams.sort();
  return `${url.host}${url.pathname.replace(/\/$/, '')}${url.search}`;
}
export function analyzeCatalogue(catalogue) {
  const games = catalogue.games, posts = games.flatMap(game => game.posts), n = games.length;
  const at = Date.parse(catalogue.snapshotAt || catalogue.generatedAt);
  assert(n > 0 && Number.isFinite(at), 'Need a non-empty dated public catalogue');
  assert.equal(unique(games.map(game => game.id)), n, 'Duplicate entry IDs');
  const linked = games.filter(game => game.projectUrl);
  const checked = games.filter(game => game.availability);
  const stored = games.filter(game => game.steam);
  const apps = [...new Map(stored.map(game => [game.steam.appId, game.steam])).values()];
  const freshPlayable = game => {
    const a = game.availability;
    const age = at - Date.parse(a?.storeCheckedAt || a?.checkedAt);
    return a?.playable === true && ['itch', 'steam'].includes(a.provider)
      && (a.storeStatus || a.status) === 'reachable' && a.status !== 'broken' && age >= 0 && age < 7 * day;
  };
  const identities = new Map();
  for (const game of linked) {
    const key = `${game.author.name.toLowerCase()}|${destinationKey(game)}`;
    identities.set(key, [...(identities.get(key) || []), game]);
  }
  const candidates = [...identities.values()].filter(group => group.length > 1);
  const category = tally(games, game => game.category);
  const stage = tally(games, game => game.stage);
  const distribution = tally(games, game => distributionFor(game.projectUrl)?.id || 'unlisted');
  const makerCounts = Object.values(tally(games, game => game.author.name.toLowerCase()));
  const dateValues = posts.map(post => post.createdAt).sort();
  const paidFull = apps.filter(app => app.type === 'game' && app.state === 'released' && Number.isInteger(app.priceCents) && app.priceCents > 0 && app.currency === 'USD');
  const result = {
    snapshotAt: catalogue.snapshotAt || null,
    source: catalogue.source,
    population: 'Published Playtrace catalogue entries; not verified unique games, all subreddit posts, or the games market.',
    totals: {
      entries: n, sourcePostMemberships: posts.length, uniqueSourcePosts: unique(posts.map(post => post.id)),
      makerHandles: makerCounts.length, repeatMakerHandles: makerCounts.filter(x => x > 1).length,
      entriesFromRepeatHandles: makerCounts.filter(x => x > 1).reduce((sum, value) => sum + value, 0),
      entriesWithMultiplePosts: count(games, game => game.posts.length > 1),
      subsequentSourcePosts: posts.length - n,
      linkedEntries: linked.length, distinctDestinations: unique(linked.map(destinationKey)),
      explicitlyPlayableOrReleased: count(games, game => ['playable', 'released'].includes(game.stage)),
      freshStoreBuildEvidence: count(games, freshPlayable),
      reviewedEntries: count(games, game => game.reviewStatus === 'reviewed'),
      firstSourcePost: dateValues[0], latestSourcePost: dateValues.at(-1),
    },
    categories: category, stages: stage, distributions: distribution,
    devices: tally(games.flatMap(game => [...new Set(game.platforms)]), x => x),
    firstSharedMonth: Object.fromEntries(Object.entries(tally(games, game => game.firstSeenAt.slice(0, 7))).sort()),
    latestUpdateMonth: Object.fromEntries(Object.entries(tally(games, game => game.updatedAt.slice(0, 7))).sort()),
    sourceFlairs: tally(posts, post => post.flair || 'Unlabeled'),
    sourcePostsPerEntry: tally(games, game => game.posts.length),
    previewKinds: tally(games, game => game.preview.kind),
    quality: {
      nonspecificGenre: category.other || 0, unknownStage: stage.unknown || 0,
      noDeviceMetadata: count(games, game => !game.platforms.length),
      noMechanicTags: count(games, game => !game.tags.length),
      noProjectLink: n - linked.length,
      noIndependentSummary: count(games, game => game.summary.startsWith('Source post by')),
      headlineLengthTitleOver80: count(games, game => game.title.length > 80),
      noImageOrPosterUrl: count(games, game => !(game.preview.kind === 'image' ? game.preview.url : game.preview.posterUrl)),
      approvedR2Previews: count(games, game => game.preview.storage === 'r2'),
      sourceCodeLinks: count(games, game => Boolean(game.repositoryUrl) || distributionFor(game.projectUrl)?.kind === 'repository'),
      githubPagesDestinations: count(linked, game => new URL(game.projectUrl).hostname.endsWith('.github.io')),
      sourcesAfterDeclaredCoverage: count(posts, post => post.createdAt > catalogue.source.coverageThrough),
      duplicatePostMemberships: posts.length - unique(posts.map(post => post.id)),
      sameMakerDestinationCandidateGroups: candidates.length,
      entriesInCandidateGroups: candidates.reduce((sum, group) => sum + group.length, 0),
    },
    availability: {
      checkedEntries: checked.length, byStatus: tally(checked, game => game.availability.status),
      freshStoreBuildsByProvider: tally(games.filter(freshPlayable), game => game.availability.provider),
      itchEmbeddedBrowserEvidence: count(games, game => freshPlayable(game) && game.availability.provider === 'itch' && game.availability.browser === true),
      storeEvidenceByProvider: tally(checked.filter(game => game.availability.provider), game => game.availability.provider),
      lastCheckFrom: checked.map(game => game.availability.checkedAt).sort()[0] || null,
      lastCheckTo: checked.map(game => game.availability.checkedAt).sort().at(-1) || null,
      brokenMarkedPlayableOrReleased: count(checked, game => game.availability.status === 'broken' && ['playable', 'released'].includes(game.stage)),
    },
    steam: {
      linkedEntries: distribution.steam || 0, cachedEntries: stored.length, distinctApps: apps.length,
      states: tally(apps, app => app.state), types: tally(apps, app => app.type || 'unknown'),
      stateAndType: tally(apps, app => `${app.state}/${app.type || 'unknown'}`),
      paidReleasedGameTypeUSD: { sample: paidFull.length, medianCents: median(paidFull.map(app => app.priceCents)), pricesCents: paidFull.map(app => app.priceCents).sort((a,b)=>a-b) },
      releaseDateFieldPresent: count(apps, app => Object.hasOwn(app, 'releaseDate')),
      evidenceFrom: apps.map(app => app.checkedAt).sort()[0] || null,
      evidenceTo: apps.map(app => app.checkedAt).sort().at(-1) || null,
    },
    categoryByDistribution: Object.fromEntries(Object.keys(category).map(id => [id, tally(games.filter(game => game.category === id), game => distributionFor(game.projectUrl)?.id || 'unlisted')])),
    duplicateCandidates: candidates.map(group => group.map(game => ({ id: game.id, title: game.title, projectUrl: game.projectUrl, sourceUrl: game.posts[0].url }))),
  };
  for (const partition of [category, stage, distribution, result.sourcePostsPerEntry]) assert.equal(Object.values(partition).reduce((a,b)=>a+b,0), n);
  assert.equal(Object.values(result.availability.byStatus).reduce((a,b)=>a+b,0), checked.length);
  assert.equal(Object.entries(result.sourcePostsPerEntry).reduce((sum,[posts,entries])=>sum+Number(posts)*entries,0), result.totals.sourcePostMemberships);
  return result;
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const path = process.argv[2] || 'data/public-catalog.json', bytes = fs.readFileSync(path);
  const report = analyzeCatalogue(JSON.parse(bytes));
  process.stdout.write(JSON.stringify({ input: path, sha256: createHash('sha256').update(bytes).digest('hex'), ...report }, null, 2) + '\n');
}
