export class ApiError extends Error {
  constructor(code, message, status, retryAfterSeconds) {
    super(message);
    Object.assign(this, { code, status, retryAfterSeconds });
  }
}
export const invalid = (message = 'Invalid request.') => new ApiError('INVALID_REQUEST', message, 400);
export const unavailable = () => new ApiError('SERVICE_UNAVAILABLE', 'This service is not configured or temporarily unavailable.', 503);
export const unauthenticated = () => new ApiError('UNAUTHENTICATED', 'A valid account session is required.', 401);
export const notFound = () => new ApiError('NOT_FOUND', 'This resource was not found.', 404);
export const forbidden = () => new ApiError('FORBIDDEN', 'This request is not permitted.', 403);
export const challengeFailed = () => new ApiError('CHALLENGE_FAILED', 'The verification challenge failed. Please try again.', 403);

export function json(value, status = 200, headers = {}) {
  return new Response(JSON.stringify(value), { status, headers: {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff', ...headers,
  } });
}
export function errorResponse(error) {
  const safe = error instanceof ApiError ? error : unavailable();
  const detail = { code: safe.code, message: safe.message };
  const headers = {};
  if (safe.retryAfterSeconds) {
    detail.retryAfterSeconds = safe.retryAfterSeconds;
    headers['Retry-After'] = String(safe.retryAfterSeconds);
  }
  return json({ error: detail }, safe.status, headers);
}
export function origins(env) {
  return String(env.ALLOWED_ORIGINS || '').split(',').map(x => x.trim()).filter(x => {
    try {
      const url = new URL(x);
      return url.origin === x && (url.protocol === 'https:' ||
        (url.protocol === 'http:' && ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname)));
    } catch { return false; }
  });
}
export function checkOrigin(request, env) {
  const origin = request.headers.get('Origin');
  if (origin && !origins(env).includes(origin)) throw forbidden();
  return origin;
}
export function withCors(response, origin) {
  if (origin) {
    response.headers.set('Access-Control-Allow-Origin', origin);
    response.headers.set('Vary', 'Origin');
  }
  return response;
}
export async function readBytes(body, limit) {
  if (!body) return new Uint8Array();
  const reader = body.getReader();
  const chunks = [];
  let size = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > limit) { await reader.cancel(); throw invalid('The request is too large.'); }
      chunks.push(value);
    }
  } finally { reader.releaseLock(); }
  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
  return bytes;
}
export async function readJson(request, limit = 8192) {
  if (request.headers.get('Content-Type')?.split(';')[0].trim() !== 'application/json') throw invalid('Use a JSON request body.');
  if (Number(request.headers.get('Content-Length')) > limit) throw invalid('The request is too large.');
  try { return JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(await readBytes(request.body, limit))); }
  catch (error) { if (error instanceof ApiError) throw error; throw invalid('The JSON request is malformed.'); }
}
export function exactKeys(value, keys) {
  if (!value || typeof value !== 'object' || Array.isArray(value) ||
    Object.keys(value).length !== keys.length || keys.some(key => !Object.hasOwn(value, key))) throw invalid();
  return value;
}
export function strongSecret(value) {
  if (typeof value !== 'string' || value.length > 512) return false;
  if (/^[a-fA-F0-9]{64,}$/.test(value) && value.length % 2 === 0) return true;
  if (!/^[A-Za-z0-9_-]{43,}={0,2}$/.test(value)) return false;
  try { return atob(value.replace(/-/g, '+').replace(/_/g, '/')).length >= 32; }
  catch { return false; }
}
export const bearer = request => {
  const match = /^Bearer ([A-Za-z0-9._~+\/-]+={0,2})$/.exec(request.headers.get('Authorization') || '');
  if (!match || match[1].length > 16384) throw unauthenticated();
  return match[1];
};
