import { DatabaseSync } from 'node:sqlite';
import { readFileSync } from 'node:fs';
import { createWorker } from '../src/index.mjs';

export const NOW = Date.parse('2026-10-10T12:00:00.000Z');
export const OPERATOR = 'a9'.repeat(32);
export const RATE_SECRET = 'c7'.repeat(32);
export const ORIGIN = 'https://playtrace.example';
export const ISSUER = 'https://clerk.playtrace.example';
export class TestDB {
  constructor() {
    this.sql = new DatabaseSync(':memory:');
    this.statementCount = 0;
    this.sql.exec(readFileSync(new URL('../migrations/0001_initial.sql', import.meta.url), 'utf8'));
    this.sql.exec(readFileSync(new URL('../migrations/0002_public_feedback.sql', import.meta.url), 'utf8'));
    this.sql.exec(readFileSync(new URL('../migrations/0003_history_pagination.sql', import.meta.url), 'utf8'));
    this.sql.exec(readFileSync(new URL('../migrations/0004_editorial_tools.sql', import.meta.url), 'utf8'));
    this.sql.exec(readFileSync(new URL('../migrations/0005_quick_feedback.sql', import.meta.url), 'utf8'));
    this.sql.exec(readFileSync(new URL('../migrations/0006_name_game.sql', import.meta.url), 'utf8'));
    this.sql.exec(readFileSync(new URL('../migrations/0007_project_details.sql', import.meta.url), 'utf8'));
    this.sql.exec(readFileSync(new URL('../migrations/0008_game_categories.sql', import.meta.url), 'utf8'));
    this.sql.exec(readFileSync(new URL('../migrations/0009_discovery_research.sql', import.meta.url), 'utf8'));
    this.sql.exec(readFileSync(new URL('../migrations/0010_source_evidence.sql', import.meta.url), 'utf8'));
    this.sql.exec(readFileSync(new URL('../migrations/0011_usage_metrics.sql', import.meta.url), 'utf8'));
    this.sql.exec(readFileSync(new URL('../migrations/0012_reviewed_project_facts.sql', import.meta.url), 'utf8'));
  }
  prepare(sql) {
    const db = this;
    return { sql, args: [], bind(...args) { this.args = args; return this; },
      async first() { db.statementCount++; return db.sql.prepare(sql).get(...this.args) || null; },
      async all() { db.statementCount++; return { results: db.sql.prepare(sql).all(...this.args) }; },
      async run() { db.statementCount++; const result = db.sql.prepare(sql).run(...this.args); return { meta: { changes: Number(result.changes) }, results: [] }; },
    };
  }
  async batch(statements) {
    this.sql.exec('BEGIN IMMEDIATE');
    try {
      const result = statements.map(statement => { this.statementCount++; return { results: this.sql.prepare(statement.sql).all(...statement.args) }; });
      this.sql.exec('COMMIT'); return result;
    } catch (error) { this.sql.exec('ROLLBACK'); throw error; }
  }
  close() { this.sql.close(); }
}
export function fixtureGame(id = 'abc12', author = 'MakerName') {
  const url = `https://www.reddit.com/r/aigamedev/comments/${id}/`;
  const at = '2026-10-09T10:00:00.000Z';
  return { id: `g_${id}`, title: 'My small puzzle game', summary: 'An author shared a puzzle prototype.',
    author: { name: author, url: `https://www.reddit.com/user/${author}/` }, category: 'puzzle', tags: ['prototype'], stage: 'prototype',
    platforms: [], projectUrl: 'https://maker.itch.io/puzzle', firstSeenAt: at, updatedAt: at,
    preview: { kind: 'image', url: 'https://preview.redd.it/test.png', posterUrl: null, alt: 'A puzzle screenshot', storage: 'external', rights: 'source-linked', sourceUrl: url },
    posts: [{ id, url, title: 'My small puzzle game', author, flair: 'Demo | Project | Workflow', createdAt: at, kind: 'showcase', excerpt: 'A source-linked puzzle prototype.' }] };
}
export function fixtureCatalog(games = [fixtureGame()]) {
  return { schemaVersion: 1, generatedAt: '2026-10-10T12:00:00.000Z', source: { subreddit: 'aigamedev',
    subredditUrl: 'https://www.reddit.com/r/aigamedev/', archiveUrl: 'https://arctic-shift.photon-reddit.com/api/posts/search',
    retrievedAt: '2026-10-10T12:00:00.000Z', coverageThrough: null, mode: 'manual-snapshot', lastSuccessfulIngestAt: null }, games };
}
const pair = await crypto.subtle.generateKey({ name: 'RSASSA-PKCS1-v1_5', modulusLength: 2048,
  publicExponent: new Uint8Array([1, 0, 1]), hash: 'SHA-256' }, true, ['sign', 'verify']);
export const jwk = { ...await crypto.subtle.exportKey('jwk', pair.publicKey), kid: 'test-key', alg: 'RS256', use: 'sig' };
const b64 = value => Buffer.from(typeof value === 'string' ? value : JSON.stringify(value)).toString('base64url');
export async function token(claims = {}, header = {}) {
  const parts = [b64({ alg: 'RS256', kid: 'test-key', typ: 'JWT', ...header }), b64({ sub: 'user_a', sid: 'sess_a', iss: ISSUER,
    azp: ORIGIN, iat: NOW / 1000 - 60, exp: NOW / 1000 + 3600, ...claims })];
  const signature = await crypto.subtle.sign('RSASSA-PKCS1-v1_5', pair.privateKey, new TextEncoder().encode(parts.join('.')));
  return `${parts.join('.')}.${Buffer.from(signature).toString('base64url')}`;
}
export function fixtureEnv(db = new TestDB(), overrides = {}) {
  return { DB: db, CLERK_ISSUER: ISSUER, ALLOWED_ORIGINS: ORIGIN, RATE_LIMIT_SECRET: RATE_SECRET,
    OPERATOR_TOKEN: OPERATOR, TURNSTILE_HOSTNAME: 'playtrace.example', TURNSTILE_SECRET_KEY: 'fixture-secret', INGESTION_ENABLED: 'true', ...overrides };
}
export function fixtureWorker(fetcher) {
  return createWorker({ now: () => NOW, sleep: async () => {}, fetch: async (url, options) => {
    if (url === `${ISSUER}/.well-known/jwks.json`) return Response.json({ keys: [jwk] });
    if (fetcher) return fetcher(url, options);
    return Response.json({ success: true, action: 'price_signal', hostname: 'playtrace.example', challenge_ts: new Date(NOW).toISOString() });
  } });
}
export function request(path, { method = 'GET', body, auth, origin = ORIGIN, ip = '192.0.2.1' } = {}) {
  return new Request(`https://api.playtrace.example/api/v1${path}`, { method, headers: {
    ...(origin ? { Origin: origin } : {}), ...(auth ? { Authorization: `Bearer ${auth}` } : {}),
    ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}), ...(ip ? { 'CF-Connecting-IP': ip } : {}),
  }, ...(body !== undefined ? { body: JSON.stringify(body) } : {}) });
}
export const rawPost = (id = 'new12', overrides = {}) => ({ id, author: 'NewMaker', title: 'I made a puzzle game', subreddit: 'aigamedev', link_flair_text: 'Demo | Project | Workflow',
  created_utc: NOW / 1000 - 100, selftext: 'Here is my puzzle game.', url: 'https://newmaker.itch.io/my-game',
  preview: { images: [{ source: { url: 'https://preview.redd.it/game.png?x=1&amp;y=2' } }] }, ...overrides });
