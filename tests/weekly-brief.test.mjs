import test from 'node:test';
import assert from 'node:assert/strict';
import { buildWeeklyBrief, checkpoint, catalogueChanges, validateHistory, fetchPreviousInsights } from '../scripts/weekly-brief.mjs';
import { weeklyBriefView } from '../js/weekly-brief-view.js';

const at = '2026-10-13T23:00:00.000Z';
const game = (id, firstSeenAt = '2026-10-06T00:00:00.000Z') => ({ id, title: 'A name', author: 'Never in history',
  firstSeenAt, category: 'puzzle', stage: 'playable', projectUrl: 'https://example.com/play',
  observations: [{ id: `post_${id}`, at: firstSeenAt, coverage: 'full-text', models: ['Claude Opus 5'], styles: ['Pixel art'], evidence: [{ text: 'Private historical copy must not survive' }] }] });
const snapshot = (games, observedAt = at) => ({ version: 1, observedAt, generatedAt: 'revision', games, pagination: { total: games.length, nextCursor: null } });

test('weekly windows are complete Monday–Sunday UTC and deduplicate project mentions', () => {
  const a = game('a'), b = game('b', '2026-10-05T00:00:00.000Z');
  a.observations.push({ ...a.observations[0], id: 'second', at: '2026-10-11T23:59:59.000Z' });
  const c = game('c', '2026-09-28T00:00:00.000Z'), d = game('d', '2026-10-12T00:00:00.000Z');
  const { brief } = buildWeeklyBrief(snapshot([a, b, c, d]));
  assert.equal(brief.latest.arrivals, 2); assert.equal(brief.previous.arrivals, 1);
  assert.equal(brief.latest.posts, 3); assert.equal(brief.latest.active, 2);
  assert.deepEqual(brief.latest.distributions.models.values, [{ label: 'Claude Opus 5', count: 2 }]);
  assert.equal(brief.latest.start, '2026-10-05T00:00:00.000Z');
  assert.equal(brief.latest.end, '2026-10-11T23:59:59.999Z');
});
test('unclassified evidence stays in the denominator and empty weeks have no synthetic results', () => {
  const a = game('a'); a.category = 'other'; a.stage = 'unknown'; a.observations[0].models = [];
  const { brief } = buildWeeklyBrief(snapshot([a]));
  assert.equal(brief.latest.distributions.category.unknown, 1);
  assert.equal(brief.latest.distributions.models.unknown, 1);
  assert.equal(brief.latest.availableBuilds, 0); assert.equal(brief.latest.unknownBuilds, 1);
  assert.equal(brief.previous.active, 0); assert.equal(brief.changes, null);
  assert.match(weeklyBriefView(brief), /first dated checkpoint/);
});
test('new sources, backfills, corrections, regrouping and disappearance remain separate', () => {
  const previous = snapshot([game('a'), game('merged'), game('gone')], '2026-10-05T12:00:00.000Z');
  const a = game('a'); a.title = 'Corrected title'; a.observations[0].models = ['Claude'];
  a.observations.push(game('merged').observations[0]);
  const split = game('split'); split.observations = [game('a').observations[0]];
  const current = snapshot([a, split, game('new', '2026-10-06T00:00:00Z'), game('backfill', '2025-01-01T00:00:00Z')]);
  const diff = catalogueChanges(checkpoint(current), checkpoint(previous));
  assert.deepEqual([diff.newlyShared, diff.backfilled, diff.metadataUpdated, diff.evidenceUpdated, diff.regrouped, diff.removed], [1, 1, 1, 1, 2, 1]);
});
test('refresh dates alone do not count as changes and raw historic content is excluded', () => {
  const a = game('a'), before = checkpoint(snapshot([a]));
  a.storeCheckedAt = at; a.observations[0].checkedAt = at;
  const after = checkpoint(snapshot([a]));
  assert.equal(catalogueChanges(after, before).metadataUpdated, 0);
  assert.equal(catalogueChanges(after, before).evidenceUpdated, 0);
  const text = JSON.stringify(before);
  for (const secret of ['A name', 'Never in history', 'example.com', 'Private historical']) assert.ok(!text.includes(secret));
  const history = validateHistory({ version: 1, checkpoints: [{ ...before, body: 'Drop extra fields' }] }, Date.parse(at));
  assert.ok(!JSON.stringify(history).includes('Drop extra fields'));
});
test('checkpoint retention freezes each day and uses the actual shorter baseline', () => {
  let result = buildWeeklyBrief(snapshot([game('a')], '2026-10-01T01:00:00Z'));
  const first = result.history.checkpoints[0];
  result = buildWeeklyBrief(snapshot([game('b')], '2026-10-01T20:00:00Z'), result.history);
  assert.deepEqual(result.history.checkpoints, [first]);
  assert.equal(result.brief.changes.from, first.observedAt);
  assert.match(weeklyBriefView(result.brief), /baseline is less than a week old/);
  for (let i = 2; i <= 20; i++) result = buildWeeklyBrief(snapshot([game('a')], `2026-10-${String(i).padStart(2, '0')}T01:00:00Z`), result.history);
  assert.equal(result.history.checkpoints.length, 14);
  assert.equal(result.brief.changes.from, '2026-10-13T01:00:00Z');
});
test('invalid or incomplete snapshots cannot replace history; network errors are not treated as an empty history', async () => {
  assert.throws(() => buildWeeklyBrief({ ...snapshot([game('a')]), pagination: { total: 2, nextCursor: null } }));
  assert.throws(() => buildWeeklyBrief(snapshot([game('a'), game('a')])));
  assert.throws(() => validateHistory({ version: 1, checkpoints: [{ observedAt: 'tomorrow', entries: [] }] }, Date.parse(at)));
  assert.throws(() => validateHistory({ version: 1, checkpoints: [checkpoint(snapshot([game('a')], '2099-01-01'))] }, Date.parse(at)));
  await assert.rejects(fetchPreviousInsights(async () => new Response('', { status: 503 })));
  let calls = 0;
  const read = await fetchPreviousInsights(async () => ++calls === 1 ? new Response('', { status: 404 }) : Response.json(snapshot([game('a')])));
  assert.equal(read.savedHistory, null); assert.equal(read.priorSnapshot.games.length, 1);
});
test('brief renderer escapes labels and comparisons always expose their denominators', () => {
  const a = game('a'); a.observations[0].models = ['<img src=x onerror=alert(1)>'];
  const html = weeklyBriefView(buildWeeklyBrief(snapshot([a])).brief);
  assert.ok(!html.includes('<img')); assert.ok(html.includes('&lt;img'));
  assert.match(html, /1 \/ 1/); assert.match(html, /previous: 0 \/ 0/);
});
