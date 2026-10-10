import { CONFIG } from './config.js';
let scriptReady;
let widget;
let rejectPending;
let generation = 0;
function loadScript() {
  if (globalThis.turnstile) return Promise.resolve(globalThis.turnstile);
  if (!scriptReady) scriptReady = new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.src = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit';
    script.async = true;
    const fail = () => { clearTimeout(timer); script.remove(); scriptReady = null; reject(new Error('The verification could not load. Check your connection and try again.')); };
    const timer = setTimeout(fail, 12000);
    script.onload = () => { clearTimeout(timer); if (globalThis.turnstile) resolve(globalThis.turnstile); else fail(); };
    script.onerror = fail;
    document.head.append(script);
  });
  return scriptReady;
}
export function clearChallenge() {
  generation++;
  if (widget != null && globalThis.turnstile) globalThis.turnstile.remove(widget);
  widget = null;
  if (rejectPending) { const reject = rejectPending; rejectPending = null; reject(new Error('Verification was cancelled. You can try again.')); }
  document.getElementById('priceChallenge')?.replaceChildren();
}
export async function priceChallenge() {
  if (!CONFIG.turnstileSiteKey) throw new Error('Price responses are temporarily unavailable.');
  clearChallenge();
  const attempt = generation;
  const turnstile = await loadScript();
  if (attempt !== generation || !document.getElementById('itemDialog')?.open) throw new Error('Verification was cancelled. You can try again.');
  return new Promise((resolve, reject) => {
    rejectPending = reject;
    widget = turnstile.render('#priceChallenge', {
      sitekey: CONFIG.turnstileSiteKey, action: 'price_signal', theme: 'auto', size: 'flexible',
      callback: token => { rejectPending = null; resolve(token); },
      'error-callback': () => { rejectPending = null; reject(new Error('Verification failed. Please try again.')); },
      'expired-callback': () => { rejectPending = null; reject(new Error('Verification expired. Please try again.')); },
      'timeout-callback': () => { rejectPending = null; reject(new Error('Verification timed out. Please try again.')); },
    });
  });
}
