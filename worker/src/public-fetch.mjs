import { readBytes } from './http.mjs';

export function publicAddress(value) {
  const ip = value.toLowerCase().replace(/^\[|\]$/g, '');
  if (ip.includes(':')) return /^[0-9a-f:]+$/.test(ip) && /^[23]/.test(ip) && !ip.startsWith('2001:db8:') && !ip.startsWith('2001:0:');
  const parts = ip.split('.').map(Number);
  if (parts.length !== 4 || parts.some(n => !Number.isInteger(n) || n < 0 || n > 255)) return false;
  const [a,b] = parts;
  return !(a === 0 || a === 10 || a === 127 || a >= 224 || a === 169 && b === 254 || a === 172 && b >= 16 && b <= 31 || a === 192 && [0,168].includes(b) || a === 100 && b >= 64 && b <= 127 || a === 198 && [18,19,51].includes(b) || a === 203 && b === 0);
}
export function publicUrl(value) {
  const url = new URL(value);
  if (url.protocol !== 'https:' || url.port || url.username || url.password || url.href.length > 2048 || !/^[a-z0-9.-]+$/.test(url.hostname)
    || !url.hostname.includes('.') || /(^|\.)(localhost|local|internal|test|invalid)$/.test(url.hostname) || /^\d[\d.]*$/.test(url.hostname)) throw new Error('URL is not a public HTTPS destination.');
  return url;
}
async function checkDns(host, deps) {
  // Resolve before each hop. Never send credentials to a user-supplied destination.
  const response = await deps.fetch(`https://cloudflare-dns.com/dns-query?name=${encodeURIComponent(host)}&type=A`, { headers: { Accept: 'application/dns-json' }, redirect: 'manual', signal: AbortSignal.timeout(5000) });
  if (!response.ok) { await response.body?.cancel(); throw new Error('DNS lookup was unavailable.'); }
  const dns = JSON.parse(new TextDecoder().decode(await readBytes(response.body, 32768)));
  const addresses = (dns.Answer || []).filter(record => [1,28].includes(record.type));
  if (!addresses.length || addresses.some(record => !publicAddress(record.data))) throw new Error('Destination could not be verified as public.');
}
async function pageBody(response, limit) {
  // Reachability is known once headers arrive. A large or interrupted body
  // limits metadata extraction; it does not turn HTTP 200 into a dead link.
  if (Number(response.headers.get('Content-Length')) > limit) {
    await response.body?.cancel().catch(() => {});
    return { html: '', bodyStatus: 'too-large' };
  }
  if (!response.body) return { html: '', bodyStatus: 'complete' };
  const reader = response.body.getReader(), chunks = [];
  let size = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > limit) {
        await reader.cancel().catch(() => {});
        return { html: '', bodyStatus: 'too-large' };
      }
      chunks.push(value);
    }
  } catch {
    await reader.cancel().catch(() => {});
    return { html: '', bodyStatus: 'unavailable' };
  } finally { reader.releaseLock(); }
  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
  return { html: new TextDecoder().decode(bytes), bodyStatus: 'complete' };
}
export async function publicPage(value, deps, limit = 1024 * 1024) {
  let url = publicUrl(value);
  for (let hop = 0; hop < 4; hop++) {
    await checkDns(url.hostname, deps);
    const response = await deps.fetch(url.href, { redirect: 'manual', signal: AbortSignal.timeout(10000), headers: { Accept: 'text/html,application/xhtml+xml', 'User-Agent': 'Playtrace/1.0 (+https://playtrace.neorgon.com/about.html)' } });
    if ([301,302,303,307,308].includes(response.status)) {
      const location = response.headers.get('Location'); await response.body?.cancel().catch(() => {});
      if (!location) throw new Error('Redirect has no destination.'); url = publicUrl(new URL(location, url).href); continue;
    }
    const type = response.headers.get('Content-Type') || '';
    if (!response.ok || !/text\/html|application\/xhtml/.test(type)) { await response.body?.cancel().catch(() => {}); return { url: url.href, status: response.status, redirectCount: hop, html: '', bodyStatus: response.ok ? 'not-html' : 'not-read' }; }
    return { url: url.href, status: response.status, redirectCount: hop, ...await pageBody(response, limit) };
  }
  throw new Error('Too many redirects.');
}
