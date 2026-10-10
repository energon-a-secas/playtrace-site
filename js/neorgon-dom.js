/**
 * Neorgon DOM Kit
 * Canonical source: packages/neorgon-ui/dom/dom.js
 * Vendored per site as js/neorgon-dom.js by packages/neorgon-ui/sync-dom.sh
 *
 * These five helpers were re-implemented in 52 separate utils.js files, with
 * 11 distinct escHtml bodies and 15 distinct showToast bodies. The divergence
 * was not stylistic. Two live defects came out of it:
 *
 *   escHtml on five sites used textContent then read back innerHTML, which
 *   escapes & < > but NOT quotes, so every attribute-position call site was
 *   injectable.
 *
 *   35 of 38 showToast bodies never set role or aria-live, so the message was
 *   invisible to anyone not watching that corner of the screen.
 *
 * Do not edit a vendored copy. Edit here and run sync-dom.sh.
 */

/**
 * Escape a value for interpolation into HTML, including attribute position.
 *
 * Quotes matter: `x" onerror="alert(1)` interpolated into alt="..." breaks out
 * of the attribute without them.
 */
export function escHtml(str) {
  if (str === null || str === undefined) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/** Trailing-edge debounce. */
export function debounce(fn, wait = 200) {
  let t;
  return function debounced(...args) {
    clearTimeout(t);
    t = setTimeout(() => fn.apply(this, args), wait);
  };
}

/** Leading-edge throttle: fires immediately, then at most once per wait. */
export function throttle(fn, wait = 200) {
  let last = 0, timer;
  return function throttled(...args) {
    const now = Date.now();
    const remaining = wait - (now - last);
    if (remaining <= 0) {
      clearTimeout(timer);
      last = now;
      fn.apply(this, args);
    } else if (!timer) {
      timer = setTimeout(() => {
        last = Date.now();
        timer = null;
        fn.apply(this, args);
      }, remaining);
    }
  };
}

export function clamp(n, min, max) {
  return Math.min(max, Math.max(min, n));
}

/** Short non-cryptographic id, for DOM keys and local records. */
export function uid(prefix = '') {
  return prefix + Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}

export function prefersReducedMotion() {
  return typeof matchMedia === 'function'
    && matchMedia('(prefers-reduced-motion: reduce)').matches;
}

const toastTimers = new WeakMap();

/**
 * Show a transient message.
 *
 * The DOM contract is configurable because sites' CSS already differs:
 * 41 use the class `visible`, and a few use `show` or `toast--visible`.
 * Passing the site's own names keeps its stylesheet working untouched.
 *
 * role and aria-live are set on every call, not only on creation, so a toast
 * element that already exists in the page markup gets them too.
 */
export function showToast(msg, {
  id = 'app-toast',
  className = 'toast',
  visibleClass = 'visible',
  duration = 2000,
} = {}) {
  let el = document.getElementById(id);
  if (!el) {
    el = document.createElement('div');
    el.id = id;
    el.className = className;
    document.body.appendChild(el);
  }
  el.setAttribute('role', 'status');
  el.setAttribute('aria-live', 'polite');
  el.textContent = msg;
  el.classList.add(visibleClass);
  clearTimeout(toastTimers.get(el));
  toastTimers.set(el, setTimeout(() => el.classList.remove(visibleClass), duration));
  return el;
}

/** Copy text, resolving to true on success. Falls back for older browsers. */
export async function copyText(text) {
  try {
    if (navigator.clipboard && window.isSecureContext) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch { /* fall through to the legacy path */ }
  try {
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.setAttribute('readonly', '');
    ta.style.position = 'fixed';
    ta.style.opacity = '0';
    document.body.appendChild(ta);
    ta.select();
    const ok = document.execCommand('copy');
    ta.remove();
    return ok;
  } catch {
    return false;
  }
}

/**
 * Hand the visitor a file.
 *
 * Revokes the object URL. Several hand-rolled copies never did, which leaks the
 * blob for the lifetime of the document.
 */
export function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function downloadText(text, filename, type = 'text/plain') {
  downloadBlob(new Blob([text], { type }), filename);
}
