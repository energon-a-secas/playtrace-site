import { bearer, origins, strongSecret, unavailable, unauthenticated, forbidden } from './http.mjs';

const encoder = new TextEncoder();
const jwksCache = new Map();
const boundedClaim = value => typeof value === 'string' && value.length > 0 && value.length <= 256 && !/[\s\x00-\x1f]/.test(value);
export function issuer(env) {
  try {
    const url = new URL(env.CLERK_ISSUER);
    return url.protocol === 'https:' && url.origin === env.CLERK_ISSUER && !url.username && !url.password ? url.origin : null;
  } catch { return null; }
}
export const accountConfigured = env => Boolean(env.DB && issuer(env) && origins(env).length && strongSecret(env.RATE_LIMIT_SECRET));
function decode(part) {
  if (!/^[A-Za-z0-9_-]+$/.test(part)) throw unauthenticated();
  const raw = atob(part.replace(/-/g, '+').replace(/_/g, '/'));
  return Uint8Array.from(raw, char => char.charCodeAt(0));
}
async function keys(base, deps, refresh) {
  const cached = jwksCache.get(base);
  if (!refresh && cached && cached.until > deps.now()) return cached.keys;
  const response = await deps.fetch(`${base}/.well-known/jwks.json`, {
    redirect: 'manual', signal: AbortSignal.timeout(8000), headers: { Accept: 'application/json' },
  });
  if (!response.ok || Number(response.headers.get('Content-Length')) > 65536) {
    await response.body?.cancel(); throw unauthenticated();
  }
  const { readBytes } = await import('./http.mjs');
  const data = JSON.parse(new TextDecoder().decode(await readBytes(response.body, 65536)));
  if (!Array.isArray(data.keys) || data.keys.length < 1 || data.keys.length > 20) throw unauthenticated();
  const accepted = data.keys.filter(key => key.kty === 'RSA' && (!key.alg || key.alg === 'RS256') &&
    (!key.use || key.use === 'sig') && boundedClaim(key.kid) && typeof key.n === 'string' && typeof key.e === 'string');
  jwksCache.set(base, { keys: accepted, until: deps.now() + 300000 });
  return accepted;
}
export async function authenticate(request, env, deps) {
  if (!accountConfigured(env)) throw unavailable();
  try {
    const token = bearer(request);
    const parts = token.split('.');
    if (parts.length !== 3) throw unauthenticated();
    const header = JSON.parse(new TextDecoder().decode(decode(parts[0])));
    const claims = JSON.parse(new TextDecoder().decode(decode(parts[1])));
    if (header.alg !== 'RS256' || !boundedClaim(header.kid) || header.crit || header.jku || header.x5u) throw unauthenticated();
    const now = Math.floor(deps.now() / 1000);
    if (claims.iss !== issuer(env) || !boundedClaim(claims.sub) || !boundedClaim(claims.sid) ||
      !origins(env).includes(claims.azp) || !Number.isInteger(claims.exp) || claims.exp <= now ||
      !Number.isInteger(claims.iat) || claims.iat > now || claims.iat >= claims.exp ||
      (claims.nbf !== undefined && (!Number.isInteger(claims.nbf) || claims.nbf > now)) ||
      (claims.sts !== undefined && claims.sts !== 'active')) throw unauthenticated();
    let key = (await keys(issuer(env), deps, false)).find(item => item.kid === header.kid);
    if (!key) key = (await keys(issuer(env), deps, true)).find(item => item.kid === header.kid);
    if (!key) throw unauthenticated();
    const imported = await crypto.subtle.importKey('jwk', key, { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' }, false, ['verify']);
    if (!await crypto.subtle.verify('RSASSA-PKCS1-v1_5', imported, decode(parts[2]), encoder.encode(`${parts[0]}.${parts[1]}`))) throw unauthenticated();
    return claims.sub;
  } catch { throw unauthenticated(); }
}
export async function authenticateOperator(request, env) {
  if (!strongSecret(env.OPERATOR_TOKEN)) throw unavailable();
  let supplied;
  try { supplied = bearer(request); } catch { throw forbidden(); }
  const [a, b] = await Promise.all([
    crypto.subtle.digest('SHA-256', encoder.encode(supplied)),
    crypto.subtle.digest('SHA-256', encoder.encode(env.OPERATOR_TOKEN)),
  ]);
  const aa = new Uint8Array(a), bb = new Uint8Array(b);
  let mismatch = 0;
  for (let i = 0; i < aa.length; i++) mismatch |= aa[i] ^ bb[i];
  if (mismatch !== 0) throw forbidden();
  return 'operator';
}
