import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';
import { fixtureEnv, fixtureCatalog, fixtureGame, NOW } from './helpers.mjs';
import { importCatalog, query } from '../src/store.mjs';
import { LocalD1 } from '../../scripts/local-d1.mjs';

const quote = value => value === null ? 'NULL' : typeof value === 'number' ? String(value) : "'" + String(value).replaceAll("'", "''") + "'";
test('offline feedback publication checks current source health and guards changes after preparation', async () => {
  const env = fixtureEnv(), db = env.DB, game = fixtureGame();
  const dir = mkdtempSync(join(tmpdir(), 'playtrace-feedback-guard-'));
  try {
    await importCatalog(db, fixtureCatalog());
    const checkedAt = new Date().toISOString(), body = 'I played the game and the controls worked well.';
    const current = { id: 'comm01', author: 'APlayer', body, link_id: 't3_abc12', created_utc: NOW / 1000 - 60, retrieved_on: Math.floor(Date.now() / 1000) };
    const evidence = { id: current.id, author: current.author, body, source: 'reddit', createdAt: new Date(current.created_utc * 1000).toISOString(), url: 'https://www.reddit.com/r/aigamedev/comments/abc12/_/comm01/' };
    const draft = { windowStart: '2026-10-01T00:00:00.000Z', windowEnd: new Date(NOW).toISOString(), classifiedComments: 9, evidence: [evidence] };
    await query(db, 'INSERT INTO editorial_jobs(id,game_id,kind,status,window_start,payload_json,created_at,updated_at,requested_by) VALUES(?,?,?,?,?,?,?,?,?)', 'draft', game.id, 'feedback', 'ready', draft.windowStart, JSON.stringify(draft), checkedAt, checkedAt, 'test').run();
    // A disposable schema/data dump; no network, keys or production records.
    const schema = db.sql.prepare("SELECT sql FROM sqlite_schema WHERE type IN('table','index') AND sql IS NOT NULL AND name NOT LIKE 'sqlite_%' ORDER BY type DESC,rowid").all().map(r => r.sql + ';');
    const rows = db.sql.prepare("SELECT name FROM sqlite_schema WHERE type='table' AND name NOT LIKE 'sqlite_%'").all().flatMap(({ name }) => db.sql.prepare(`SELECT * FROM ${name}`).all().map(row => `INSERT INTO ${name}(${Object.keys(row).join(',')}) VALUES(${Object.values(row).map(quote).join(',')});`));
    const sql = [...schema, ...rows].join('\n');
    const backup = join(dir, 'backup.sql'), comments = join(dir, 'comments.json'), reviews = join(dir, 'reviews.json'), output = join(dir, 'prepared');
    writeFileSync(backup, sql, { mode: 0o600 });
    writeFileSync(comments, JSON.stringify({ checkedAt, comments: [current] }), { mode: 0o600 });
    writeFileSync(reviews, JSON.stringify({ version: 1, reviews: [{ gameId: game.id, commentIds: ['comm01'], summary: 'One person reported playing and praised the controls [1].', labels: [{ number: 1, theme: 'controls', tone: 'praise', experience: 'played' }] }] }), { mode: 0o600 });
    const args = [new URL('../../scripts/prepare-reviewed-feedback.mjs', import.meta.url).pathname, '--backup', backup, '--reviews', reviews, '--output', output, '--comments', comments];
    execFileSync(process.execPath, args, { stdio: 'pipe' });
    const prepared = readFileSync(join(output, 'apply.sql'), 'utf8'), fresh = new LocalD1(sql);
    fresh.sql.exec(prepared);
    const published = JSON.parse(fresh.sql.prepare('SELECT payload_json FROM feedback_reviews').get().payload_json);
    assert.equal(published.classifiedComments, null);
    assert.equal(published.reviewedComments, 1);
    assert.equal(published.sampled, true);
    assert.equal(published.evidenceScope.retainedComments, 1);
    fresh.close();
    const changed = new LocalD1(sql);
    const check = JSON.stringify({ sources: [{ url: evidence.url, actionable: true, retrievedAt: checkedAt, observedHash: 'changed' }] });
    changed.sql.prepare('INSERT INTO evidence_checks VALUES(?,?,?,?)').run(game.id, checkedAt, checkedAt, check);
    assert.throws(() => changed.sql.exec(prepared), /NOT NULL/);
    assert.equal(changed.sql.prepare('SELECT count(*) n FROM feedback_reviews').get().n, 0);
    changed.close();
    writeFileSync(backup, sql + `\nINSERT INTO evidence_checks VALUES(${[game.id, checkedAt, checkedAt, check].map(quote).join(',')});`, { mode: 0o600 });
    assert.throws(() => execFileSync(process.execPath, args, { stdio: 'pipe' }), /Reddit source changed/);
    writeFileSync(comments, JSON.stringify({ checkedAt: '2020-01-01T00:00:00Z', comments: [current] }), { mode: 0o600 });
    assert.throws(() => execFileSync(process.execPath, args, { stdio: 'pipe' }), /past 24 hours/);
  } finally { db.close(); rmSync(dir, { recursive: true, force: true }); }
});
