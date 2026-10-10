import { ApiError, challengeFailed, unavailable, strongSecret } from './http.mjs';
import { query } from './store.mjs';

const encode = new TextEncoder();
const hex = buffer => [...new Uint8Array(buffer)].map(x => x.toString(16).padStart(2, '0')).join('');
export function signalProtection(env) {
  const mode = env.SIGNAL_PROTECTION ?? 'turnstile';
  if (mode === 'account-rate-limit') return mode;
  if (mode === 'turnstile' && env.TURNSTILE_SECRET_KEY && env.TURNSTILE_HOSTNAME) return mode;
  return 'unconfigured';
}
export async function digest(value) { return hex(await crypto.subtle.digest('SHA-256', encode.encode(value))); }
async function hmac(secret, value) {
  const key = await crypto.subtle.importKey('raw', encode.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  return hex(await crypto.subtle.sign('HMAC', key, encode.encode(value)));
}
export async function take(db, key, limit, expires, now) {
  const result = await query(db, `INSERT INTO rate_limits(bucket_key,count,expires_at) VALUES(?,1,?)
    ON CONFLICT(bucket_key) DO UPDATE SET count=CASE WHEN rate_limits.expires_at<=? THEN 1 ELSE rate_limits.count+1 END,
      expires_at=excluded.expires_at WHERE rate_limits.expires_at<=? OR rate_limits.count<? RETURNING count`, key, expires, now, now, limit).first();
  return Boolean(result);
}
export async function mutationLimit(db, env, subject, request, kind, nowMs) {
  if (!strongSecret(env.RATE_LIMIT_SECRET)) throw unavailable();
  const now = Math.floor(nowMs / 1000), hour = Math.floor(now / 3600), expires = (hour + 1) * 3600;
  const account = await hmac(env.RATE_LIMIT_SECRET, `account:${subject}`);
  const buckets = [[`${kind === 'privacy' ? 'privacy' : 'account'}:${account}:${hour}`, kind === 'privacy' ? 60 : 30]];
  if (kind === 'price') {
    const ip = request.headers.get('CF-Connecting-IP');
    if (!ip || ip.length > 64 || !/^[0-9a-fA-F:.]+$/.test(ip)) throw unavailable();
    const day = new Date(nowMs).toISOString().slice(0, 10);
    const network = await hmac(env.RATE_LIMIT_SECRET, `network:${day}:${ip}`);
    buckets.push([`price:${account}:${hour}`, 10], [`network:${network}:${hour}`, 60]);
  }
  await query(db, 'DELETE FROM rate_limits WHERE expires_at<=?', now).run();
  for (const [key, limit] of buckets) {
    if (!await take(db, key, limit, expires, now)) throw new ApiError('RATE_LIMITED', 'Please wait before trying again.', 429, expires - now);
  }
}
export async function verifyChallenge(db, env, token, deps) {
  if (!env.TURNSTILE_SECRET_KEY || !env.TURNSTILE_HOSTNAME) throw unavailable();
  if (typeof token !== 'string' || token.length < 1 || token.length > 2048) throw challengeFailed();
  const now = Math.floor(deps.now() / 1000);
  if (!await take(db, `challenge:${await digest(token)}`, 1, now + 600, now)) throw challengeFailed();
  try {
    const response = await deps.fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', {
      method: 'POST', body: new URLSearchParams({ secret: env.TURNSTILE_SECRET_KEY, response: token }),
      signal: AbortSignal.timeout(10000), redirect: 'error',
    });
    if (!response.ok) throw challengeFailed();
    const result = await response.json();
    const timestamp = Date.parse(result.challenge_ts);
    if (result.success !== true || result.action !== 'price_signal' || result.hostname !== env.TURNSTILE_HOSTNAME ||
      !Number.isFinite(timestamp) || timestamp > deps.now() + 30000 || deps.now() - timestamp > 300000) throw challengeFailed();
  } catch { throw challengeFailed(); }
}
