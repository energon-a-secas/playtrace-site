import { CONFIG } from './config.js';
export const apiConfigured = Boolean(CONFIG.apiBase);
export async function request(path, { method = 'GET', body, token, signal } = {}) {
  if (!apiConfigured) throw Object.assign(new Error('Account features are not available yet. You can still explore every game.'), { code: 'SERVICE_UNAVAILABLE' });
  if (!path.startsWith('/') || path.startsWith('//')) throw new Error('Invalid API path');
  const url = new URL(CONFIG.apiBase.replace(/\/$/, '') + path, location.origin);
  const local = ['localhost', '127.0.0.1', '[::1]'].includes(location.hostname);
  if (url.protocol !== 'https:' && !(local && ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname))) throw new Error('Invalid API configuration');
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 12000);
  const abort = () => controller.abort();
  signal?.addEventListener('abort', abort, { once: true });
  try {
    const headers = { Accept: 'application/json' };
    if (body !== undefined) headers['Content-Type'] = 'application/json';
    if (token) headers.Authorization = `Bearer ${token}`;
    const response = await fetch(url, { method, headers, signal: controller.signal, credentials: 'omit', redirect: 'error',
      ...(body !== undefined ? { body: JSON.stringify(body) } : {}) });
    const result = await response.json();
    if (!response.ok) throw Object.assign(new Error(result?.error?.message || 'This request could not be completed. Please try again.'),
      { code: result?.error?.code || 'REQUEST_FAILED', status: response.status, retryAfterSeconds: result?.error?.retryAfterSeconds });
    return result;
  } catch (error) {
    if (error.name === 'AbortError') throw new Error('The request took too long. Please try again.');
    throw error;
  } finally { clearTimeout(timer); signal?.removeEventListener('abort', abort); }
}
