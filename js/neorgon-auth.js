/**
 * Neorgon Auth Kit
 * Canonical source: packages/neorgon-ui/auth/neorgon-auth.js
 * Vendored per site as js/neorgon-auth.js by packages/neorgon-ui/sync-auth.sh.
 * Never edit a vendored copy: fix it here and re-run the sync.
 *
 * One Neorgon account, one way to sign in to it, on every site:
 *   - a header slot: a "Sign in" button when signed out, Clerk's avatar menu when signed in
 *   - a native <dialog> hosting Clerk's form, titled with the site's own name and mark
 *   - Convex HTTP clients kept on the current Clerk token
 *   - "Your Neorgon sites": where this account has been used, stored in the account itself
 *
 *   <meta name="clerk-publishable-key" content="pk_live_...">
 *   <link rel="stylesheet" href="css/neorgon-auth.css">
 *   <div class="neo-auth" data-neo-auth data-keep-mobile hidden></div>   (inside .header-right)
 *
 *   import { NeoAuth } from './neorgon-auth.js';
 *   NeoAuth.start({ convex });
 *   NeoAuth.onChange(({ signedIn, label }) => paint(signedIn, label));
 *   if (await NeoAuth.requireSignIn({ reason: 'Sign in to upload your own memes.' })) upload();
 *
 * Contract, CSP and troubleshooting: packages/neorgon-ui/auth/README.md
 */

const CLERK_BUNDLE = 'npm/@clerk/clerk-js@5/dist/clerk.browser.js';
const PRIVACY_URL = 'https://neorgon.com/privacy/';
const TERMS_URL = 'https://neorgon.com/tos/';
const LOCAL_HOSTS = ['localhost', '127.0.0.1', '[::1]'];
const DEV_KEY_STORAGE = 'neo-auth:dev-key';
const SETTLED = new Set(['signed-in', 'signed-out', 'unavailable']);
const DAY = /^\d{4}-\d{2}-\d{2}$/;
const SITE_ID = /^[a-z0-9-]{1,40}$/;

const STRINGS = {
  en: {
    signIn: 'Sign in',
    signInTo: (site) => `Sign in to ${site}`,
    createAccount: (site) => `Create your account for ${site}`,
    lede: 'One Neorgon account works on every Neorgon site.',
    close: 'Close',
    loading: 'Loading sign-in',
    loadFailed: 'Sign-in could not load. Check your connection, then try again.',
    localOnly: 'This key only works on neorgon.com. To try sign-in on localhost, use a development key.',
    retry: 'Try again',
    signedInAs: (name) => `Signed in as ${name}`,
    signedOut: 'Signed out',
    privacy: 'Privacy',
    terms: 'Terms',
    sitesTitle: 'Your Neorgon sites',
    sitesLede: 'Where this account has been used. Kept in your account, visible only to you.',
    sitesLoading: 'Loading your sites',
    usedHeading: 'Used with this account',
    othersHeading: 'Also works with this account',
    none: 'Nothing recorded yet. Each Neorgon site you use while signed in appears here.',
    lastUsed: (day) => `Last used ${day}`,
    since: (day) => `since ${day}`,
    here: 'You are here',
    clear: 'Clear this history',
    confirmClear: 'Clear it, this cannot be undone',
    cleared: 'History cleared',
    sitesFailed: 'Your sites could not load. Try again in a moment.',
  },
  es: {
    signIn: 'Iniciar sesión',
    signInTo: (site) => `Inicia sesión en ${site}`,
    createAccount: (site) => `Crea tu cuenta para ${site}`,
    lede: 'Una cuenta de Neorgon sirve en todos los sitios de Neorgon.',
    close: 'Cerrar',
    loading: 'Cargando el inicio de sesión',
    loadFailed: 'No se pudo cargar el inicio de sesión. Revisa tu conexión e inténtalo de nuevo.',
    localOnly: 'Esta clave solo funciona en neorgon.com. Para probar el inicio de sesión en localhost, usa una clave de desarrollo.',
    retry: 'Reintentar',
    signedInAs: (name) => `Sesión iniciada como ${name}`,
    signedOut: 'Sesión cerrada',
    privacy: 'Privacidad',
    terms: 'Términos',
    sitesTitle: 'Tus sitios de Neorgon',
    sitesLede: 'Dónde se ha usado esta cuenta. Se guarda en tu cuenta y solo tú lo ves.',
    sitesLoading: 'Cargando tus sitios',
    usedHeading: 'Usados con esta cuenta',
    othersHeading: 'También funcionan con esta cuenta',
    none: 'Aún no hay nada registrado. Cada sitio de Neorgon que uses con tu sesión iniciada aparecerá aquí.',
    lastUsed: (day) => `Último uso: ${day}`,
    since: (day) => `desde ${day}`,
    here: 'Estás aquí',
    clear: 'Borrar este historial',
    confirmClear: 'Bórralo, no se puede deshacer',
    cleared: 'Historial borrado',
    sitesFailed: 'No se pudieron cargar tus sitios. Inténtalo de nuevo en un momento.',
  },
};

const ICON_PERSON = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="8.5" r="3.5"/><path d="M5 19.5c1.3-3.2 4-4.8 7-4.8s5.7 1.6 7 4.8"/></svg>';
const ICON_CLOSE = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><path d="M6 6l12 12M18 6 6 18"/></svg>';
const ICON_HEX = '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linejoin="round" aria-hidden="true"><path d="M12 3.4 19.4 7.7v8.6L12 20.6 4.6 16.3V7.7Z"/><circle cx="12" cy="12" r="2.1" fill="currentColor" stroke="none"/></svg>';
const MARK_HEX = '<svg viewBox="0 0 40 40" width="100%" height="100%" aria-hidden="true"><path d="M20 5.5 32.6 12.75v14.5L20 34.5 7.4 27.25v-14.5Z" style="fill: var(--auth-accent)"/><circle cx="20" cy="20" r="4.2" style="fill: var(--auth-surface)"/></svg>';

/* ── Pure helpers. Exported for tests; none of them touches the DOM. ─────── */

const isPlainObject = (value) => value !== null && typeof value === 'object' && !Array.isArray(value);

/** The Clerk Frontend API host a publishable key names, or null for anything that is not one. */
export function hostFromPublishableKey(key) {
  const match = /^pk_(?:test|live)_([A-Za-z0-9+/=]+)$/.exec(String(key ?? '').trim());
  if (!match) return null;
  let decoded;
  try { decoded = atob(match[1]); } catch { return null; }
  if (!decoded.endsWith('$')) return null;
  const host = decoded.slice(0, -1);
  return /^[a-z0-9-]+(\.[a-z0-9-]+)+$/i.test(host) ? host.toLowerCase() : null;
}

/**
 * The newest __client_uat timestamp in a cookie string: 0 when signed out, null when
 * clerk-js has never run on this domain. On a production instance the cookie is set on
 * the eTLD+1, so a session started on any Neorgon site is visible here without loading
 * clerk-js, which is what lets anonymous visitors skip the bundle entirely.
 */
export function readClientUat(cookieString) {
  let found = false;
  let newest = 0;
  for (const part of String(cookieString ?? '').split(';')) {
    const eq = part.indexOf('=');
    if (eq < 0) continue;
    const name = part.slice(0, eq).trim();
    if (name !== '__client_uat' && !name.startsWith('__client_uat_')) continue;
    found = true;
    const value = Number(part.slice(eq + 1).trim());
    if (Number.isFinite(value) && value > newest) newest = value;
  }
  return found ? newest : null;
}

/** The id a host is recorded under in the account history: "memes" for memes.neorgon.com. */
export function siteIdFromHost(hostname) {
  const host = String(hostname ?? '').toLowerCase().replace(/\.$/, '');
  if (host === 'neorgon.com' || host === 'www.neorgon.com') return 'neorgon';
  const match = /^([a-z0-9-]+)\.neorgon\.com$/.exec(host);
  return match && SITE_ID.test(match[1]) ? match[1] : null;
}

export function todayUTC(date = new Date()) {
  return date.toISOString().slice(0, 10);
}

/** The metadata patch that records a visit, or null when this site is already stamped today. */
export function usageStamp(unsafeMetadata, siteId, today) {
  const sites = unsafeMetadata?.neorgon?.sites;
  const current = isPlainObject(sites) ? sites[siteId] : undefined;
  if (isPlainObject(current) && current.last === today) return null;
  const first = isPlainObject(current) && DAY.test(current.first) ? current.first : today;
  return { neorgon: { sites: { [siteId]: { first, last: today } } } };
}

/** Deep merge where null removes a key: updateMetadata's semantics, for clerk-js builds without it. */
export function mergeMetadata(base, patch) {
  const out = isPlainObject(base) ? { ...base } : {};
  for (const [key, value] of Object.entries(patch ?? {})) {
    if (value === null) delete out[key];
    else if (isPlainObject(value)) out[key] = mergeMetadata(isPlainObject(out[key]) ? out[key] : {}, value);
    else out[key] = value;
  }
  return out;
}

/**
 * Join the generated catalogue with what the account recorded. The person can edit their own
 * unsafeMetadata, so only catalogue sites ever render and a record needs real dates to count.
 */
export function sitesView(catalogue, unsafeMetadata, currentId) {
  const records = isPlainObject(unsafeMetadata?.neorgon?.sites) ? unsafeMetadata.neorgon.sites : {};
  const used = [];
  const others = [];
  for (const site of Array.isArray(catalogue) ? catalogue : []) {
    if (!site || !SITE_ID.test(site.id)) continue;
    const record = records[site.id];
    const row = { ...site, current: site.id === currentId };
    if (isPlainObject(record) && DAY.test(record.last)) {
      used.push({ ...row, last: record.last, first: DAY.test(record.first) ? record.first : record.last });
    } else {
      others.push(row);
    }
  }
  used.sort((a, b) => b.last.localeCompare(a.last) || String(a.name).localeCompare(String(b.name)));
  others.sort((a, b) => String(a.name).localeCompare(String(b.name)));
  return { used, others };
}

export function localeFor(lang) {
  return /^es(?:-|$)/i.test(String(lang ?? '')) ? 'es' : 'en';
}

function parseColor(value) {
  const raw = String(value ?? '').trim().toLowerCase();
  let match = /^#([0-9a-f]{3,8})$/.exec(raw);
  if (match) {
    let hex = match[1];
    if (hex.length === 3 || hex.length === 4) hex = [...hex].map((c) => c + c).join('');
    if (hex.length !== 6 && hex.length !== 8) return null;
    return {
      r: parseInt(hex.slice(0, 2), 16),
      g: parseInt(hex.slice(2, 4), 16),
      b: parseInt(hex.slice(4, 6), 16),
      a: hex.length === 8 ? parseInt(hex.slice(6, 8), 16) / 255 : 1,
    };
  }
  match = /^rgba?\(\s*([\d.]+)[\s,]+([\d.]+)[\s,]+([\d.]+)(?:[\s,/]+([\d.]+%?))?\s*\)$/.exec(raw);
  if (!match) return null;
  const alpha = match[4] === undefined ? 1 : match[4].endsWith('%') ? parseFloat(match[4]) / 100 : parseFloat(match[4]);
  return { r: +match[1], g: +match[2], b: +match[3], a: alpha };
}

function luminance({ r, g, b }) {
  const channel = (v) => {
    const s = v / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
}

/** Dark or white text for a filled accent, whichever has the higher WCAG contrast. */
export function contrastText(color) {
  const rgb = parseColor(color);
  if (!rgb) return '#ffffff';
  const l = luminance(rgb);
  const onWhite = 1.05 / (l + 0.05);
  const onDark = (l + 0.05) / (luminance({ r: 11, g: 11, b: 16 }) + 0.05);
  return onDark > onWhite ? '#0b0b10' : '#ffffff';
}

const toHex = ({ r, g, b }) => `#${[r, g, b].map((v) => Math.round(v).toString(16).padStart(2, '0')).join('')}`;
const mix = (a, b, weight) => ({
  r: a.r + (b.r - a.r) * weight,
  g: a.g + (b.g - a.g) * weight,
  b: a.b + (b.b - a.b) * weight,
  a: 1,
});

/* ── Runtime state ───────────────────────────────────────────────────────── */

const auth = {
  started: null,
  status: 'idle',          // idle | loading | signed-out | signed-in | unavailable
  key: null,
  clerk: null,
  loading: null,
  userId: null,
  label: '',
  options: {},
  locale: 'en',
  clients: new Set(),
  listeners: new Set(),
  waiters: [],
  invoker: null,
  live: null,
  signInDialog: null,
  sitesDialog: null,
  catalogue: null,
};

const t = () => STRINGS[auth.locale] ?? STRINGS.en;
const meta = (name) => document.querySelector(`meta[name="${name}"]`)?.content?.trim() || '';
const isLocalHost = () => LOCAL_HOSTS.includes(location.hostname);

function h(tag, attrs = {}, ...children) {
  const node = document.createElement(tag);
  for (const [key, value] of Object.entries(attrs)) {
    if (value == null || value === false) continue;
    if (key === 'class') node.className = value;
    else if (key === 'text') node.textContent = value;
    else if (key === 'html') node.innerHTML = value;
    else if (key.startsWith('on')) node.addEventListener(key.slice(2), value);
    else node.setAttribute(key, value === true ? '' : String(value));
  }
  for (const child of children.flat()) {
    if (child != null && child !== false) node.append(child);
  }
  return node;
}

function authError(code, message) {
  return Object.assign(new Error(message), { code });
}

function snapshot() {
  return {
    status: auth.status,
    signedIn: auth.status === 'signed-in',
    userId: auth.userId,
    label: auth.label,
    clerk: auth.clerk,
  };
}

function emit() {
  const detail = snapshot();
  for (const listener of [...auth.listeners]) {
    try { listener(detail); } catch (error) { console.error('Neorgon auth: an onChange listener threw.', error); }
  }
  document.dispatchEvent(new CustomEvent('neo-auth:change', { detail }));
}

/** Apply a state change. Listeners hear about real changes only, never about token refresh ticks. */
function commit(next) {
  const before = `${auth.status}|${auth.userId}|${auth.label}`;
  Object.assign(auth, next);
  if (before === `${auth.status}|${auth.userId}|${auth.label}`) return false;
  renderSlots();
  if (SETTLED.has(auth.status)) emit();
  return true;
}

const signedOutState = (status) => ({ status, userId: null, label: '' });

function resolveKey(options) {
  if (isLocalHost()) {
    let devKey = null;
    try { devKey = localStorage.getItem(DEV_KEY_STORAGE); } catch { /* storage blocked */ }
    // Honoured on localhost only. On a production host an override would let a crafted
    // link put someone else's Clerk instance, and its password form, on a neorgon.com origin.
    if (devKey?.startsWith('pk_test_')) return devKey;
  }
  return options.publishableKey || meta('clerk-publishable-key') || null;
}

function siteName() {
  return auth.options.siteName
    || meta('neo-auth-site')
    || document.querySelector('.header-title-wrap h1')?.textContent?.trim()
    || document.title.split(/\s[|:·]\s/)[0].trim()
    || location.hostname;
}

const currentSiteId = () => auth.options.siteId || siteIdFromHost(location.hostname);

function displayLabel(user) {
  return user.username
    || user.firstName
    || user.primaryEmailAddress?.emailAddress?.split('@')[0]
    || 'Account';
}

/* ── Clerk ───────────────────────────────────────────────────────────────── */

function injectClerk(host, key) {
  if (typeof window.Clerk?.load === 'function') return Promise.resolve(window.Clerk);
  return new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.src = `https://${host}/${CLERK_BUNDLE}`;
    script.async = true;
    script.crossOrigin = 'anonymous';
    // The browser bundle throws "Missing publishableKey" without this attribute, and
    // window.Clerk is then a ready instance rather than a constructor.
    script.dataset.clerkPublishableKey = key;
    script.addEventListener('load', () => {
      if (typeof window.Clerk?.load === 'function') resolve(window.Clerk);
      else reject(authError('no-clerk', `clerk-js loaded from ${host} but did not expose window.Clerk`));
    }, { once: true });
    script.addEventListener('error', () => {
      reject(authError('script-blocked', `clerk-js could not load from ${host}; check that the page's script-src allows https://${host}`));
    }, { once: true });
    document.head.append(script);
  });
}

function loadClerk() {
  if (auth.loading) return auth.loading;
  auth.loading = (async () => {
    if (isLocalHost() && auth.key.startsWith('pk_live_')) {
      throw authError('local-production-key', `a production key cannot run on localhost; set localStorage["${DEV_KEY_STORAGE}"] to a pk_test_ key`);
    }
    const clerk = await injectClerk(hostFromPublishableKey(auth.key), auth.key);
    await clerk.load({
      telemetry: false,
      appearance: appearanceFor('global'),
      // Signing out stays on the page. Without this the instance default sends people
      // to the Account Portal on accounts.neorgon.com, away from the site they were using.
      afterSignOutUrl: location.href,
    });
    auth.clerk = clerk;
    clerk.addListener(() => { void refresh(); });
    await refresh();
    return clerk;
  })();
  auth.loading.catch((error) => {
    auth.loading = null;
    // A production key on localhost is a known state of every site's dev server, not a fault.
    if (error.code === 'local-production-key') console.warn(`Neorgon auth: ${error.message}`);
    else console.error(`Neorgon auth: ${error.message}`, error);
  });
  return auth.loading;
}

async function syncClients() {
  if (!auth.clients.size) return;
  const session = auth.clerk?.session;
  let token = null;
  if (session) {
    try {
      token = await session.getToken({ template: 'convex' });
    } catch (error) {
      // Loud on purpose: a silent failure here means signed in on screen and
      // "Not authenticated" on every mutation, with nothing saying why.
      console.error('Neorgon auth: could not mint the Convex token. Check that a JWT template named "convex" exists on this Clerk instance (Clerk dashboard, JWT templates).', error);
    }
  }
  for (const client of auth.clients) {
    if (token) client.setAuth(token);
    else client.clearAuth?.();
  }
}

/** Runs on load and on every Clerk tick. Clerk ticks as it refreshes the session token. */
async function refresh() {
  const clerk = auth.clerk;
  if (!clerk) return;
  await syncClients();
  const user = clerk.session ? clerk.user : null;
  const wasSignedIn = auth.status === 'signed-in';
  const changed = commit(user
    ? { status: 'signed-in', userId: user.id, label: displayLabel(user) }
    : signedOutState('signed-out'));
  if (!changed) return;
  if (user && !wasSignedIn) {
    if (auth.signInDialog?.open) auth.signInDialog.close();
    announce(t().signedInAs(auth.label));
    void stampUsage(user);
  } else if (!user && wasSignedIn) {
    announce(t().signedOut);
    if (auth.sitesDialog?.open) auth.sitesDialog.close();
  }
}

async function writeMetadata(user, patch) {
  if (typeof user.updateMetadata === 'function') return user.updateMetadata({ unsafeMetadata: patch });
  return user.update({ unsafeMetadata: mergeMetadata(user.unsafeMetadata, patch) });
}

async function stampUsage(user) {
  const id = currentSiteId();
  if (!id) return;
  const patch = usageStamp(user.unsafeMetadata, id, todayUTC());
  if (!patch) return;
  try {
    await writeMetadata(user, patch);
  } catch (error) {
    console.warn('Neorgon auth: could not record this site in the account history.', error);
  }
}

/* ── Appearance: Clerk's components take the site's own palette ─────────── */

let colorContext;
function toRgb(value) {
  const raw = String(value ?? '').trim();
  if (!raw) return null;
  let rgb = parseColor(raw);
  if (!rgb) {
    colorContext ??= document.createElement('canvas').getContext('2d');
    if (!colorContext) return null;
    colorContext.fillStyle = '#000001';
    colorContext.fillStyle = raw;
    if (colorContext.fillStyle === '#000001') return null;
    rgb = parseColor(colorContext.fillStyle);
  }
  return rgb && rgb.a >= 0.5 ? rgb : null;
}

function readPalette() {
  const scope = signInDialog();
  const style = getComputedStyle(scope);
  const bg = toRgb(style.getPropertyValue('--auth-bg'))
    || toRgb(getComputedStyle(document.body).backgroundColor)
    || { r: 11, g: 13, b: 20, a: 1 };
  const text = toRgb(style.getPropertyValue('--auth-text')) || { r: 244, g: 244, b: 245, a: 1 };
  const accent = toRgb(style.getPropertyValue('--auth-accent')) || { r: 232, g: 121, b: 249, a: 1 };
  return { bg, text, accent, dark: luminance(bg) < 0.4, font: getComputedStyle(document.body).fontFamily };
}

function appearanceFor(kind) {
  const { bg, text, accent, dark, font } = readPalette();
  const white = { r: 255, g: 255, b: 255, a: 1 };
  const accentHex = toHex(accent);
  const onAccent = contrastText(accentHex);
  const dim = toHex(mix(text, bg, 0.26));
  const input = toHex(dark ? mix(bg, text, 0.13) : mix(bg, white, 0.7));
  const variables = {
    colorPrimary: accentHex,
    colorTextOnPrimaryBackground: onAccent,
    colorPrimaryForeground: onAccent,
    colorBackground: toHex(mix(bg, text, dark ? 0.09 : 0.03)),
    colorText: toHex(text),
    colorForeground: toHex(text),
    colorTextSecondary: dim,
    colorMutedForeground: dim,
    colorInputBackground: input,
    colorInput: input,
    colorInputText: toHex(text),
    colorInputForeground: toHex(text),
    colorNeutral: dark ? '#ffffff' : '#000000',
    colorDanger: dark ? '#f87171' : '#dc2626',
    colorSuccess: dark ? '#4ade80' : '#15803d',
    colorWarning: dark ? '#fbbf24' : '#b45309',
    borderRadius: '10px',
    fontFamily: font,
  };
  const layout = {
    socialButtonsPlacement: 'top',
    socialButtonsVariant: 'blockButton',
    shimmer: false,
    animations: !matchMedia('(prefers-reduced-motion: reduce)').matches,
  };
  const elements = kind === 'embedded'
    ? {
      rootBox: { width: '100%' },
      cardBox: { width: '100%', boxShadow: 'none', border: 'none', background: 'transparent' },
      card: { width: '100%', padding: '8px 0 4px', background: 'transparent', boxShadow: 'none', border: 'none' },
      footer: { background: 'transparent' },
      formButtonPrimary: { textTransform: 'none', fontWeight: 600 },
    }
    : kind === 'menu'
      ? { userButtonAvatarBox: { width: '32px', height: '32px' } }
      : {};
  // "layout" is the clerk-js 5 name; Core 3 renamed it "options". Both are sent so the
  // loader can move majors without this object changing.
  return { variables, elements, layout, options: layout };
}

/** Where the visible header ends, so a dialog centres in the space under it. 0 with no header in view. */
function headerOffset() {
  const bar = document.querySelector('.header-bar');
  if (!bar) return 0;
  const { top, bottom } = bar.getBoundingClientRect();
  return top <= 1 && bottom > 0 ? Math.round(bottom) : 0;
}

function paintScheme(dialog) {
  const { bg, accent } = readPalette();
  dialog.dataset.scheme = luminance(bg) < 0.4 ? 'dark' : 'light';
  dialog.style.setProperty('--auth-accent-text', contrastText(toHex(accent)));
  dialog.style.setProperty('--auth-top', `${headerOffset()}px`);
}

/* ── Header slot ─────────────────────────────────────────────────────────── */

function renderSlots() {
  if (typeof document === 'undefined') return;
  for (const slot of document.querySelectorAll('[data-neo-auth]')) renderSlot(slot);
}

function renderSlot(slot) {
  const stamp = `${auth.status}|${auth.locale}`;
  if (slot.dataset.neoAuthRendered === stamp) return;
  if (slot.neoUserHost && auth.clerk) {
    try { auth.clerk.unmountUserButton(slot.neoUserHost); } catch { /* already gone */ }
  }
  slot.neoUserHost = null;
  slot.dataset.neoAuthRendered = stamp;
  slot.hidden = auth.status === 'idle' || auth.status === 'unavailable';

  if (auth.status === 'signed-out') {
    const button = h('button', { type: 'button', class: 'neo-auth-signin', 'aria-haspopup': 'dialog', html: ICON_PERSON },
      h('span', { class: 'neo-auth-signin-label', text: t().signIn }));
    button.addEventListener('click', () => { void openSignIn({ invoker: button }); });
    slot.replaceChildren(button);
  } else if (auth.status === 'loading') {
    slot.replaceChildren(h('span', { class: 'neo-auth-pending', 'aria-hidden': 'true' }));
  } else if (auth.status === 'signed-in' && auth.clerk) {
    const host = h('div', { class: 'neo-auth-user' });
    slot.replaceChildren(host);
    slot.neoUserHost = host;
    auth.clerk.mountUserButton(host, {
      appearance: appearanceFor('menu'),
      userProfileProps: { appearance: appearanceFor('global') },
      customMenuItems: [
        {
          label: t().sitesTitle,
          onClick: () => { void openSites(); },
          mountIcon: (el) => { el.innerHTML = ICON_HEX; },
          unmountIcon: (el) => { if (el) el.innerHTML = ''; },
        },
        { label: 'manageAccount' },
        { label: 'signOut' },
      ],
    });
  } else {
    slot.replaceChildren();
  }
}

function announce(message) {
  if (!auth.live) {
    auth.live = h('div', { class: 'neo-auth-sr', role: 'status', 'aria-live': 'polite' });
    document.body.append(auth.live);
  }
  auth.live.textContent = '';
  setTimeout(() => { auth.live.textContent = message; }, 80);
}

/* ── Dialog shell ────────────────────────────────────────────────────────── */

function buildDialog(prefix) {
  const title = h('h2', { class: 'neo-auth-title', id: `${prefix}-title` });
  const lede = h('p', { class: 'neo-auth-lede', id: `${prefix}-lede` });
  const mark = h('div', { class: 'neo-auth-mark' });
  const close = h('button', { type: 'button', class: 'neo-auth-close', html: ICON_CLOSE });
  const body = h('div', { class: 'neo-auth-body' });
  const foot = h('footer', { class: 'neo-auth-foot' });
  const dialog = h('dialog', { class: 'neo-auth-dialog', 'aria-labelledby': title.id, 'aria-describedby': lede.id },
    h('header', { class: 'neo-auth-head' }, mark, h('div', {}, title, lede), close),
    body,
    foot);
  dialog.neoParts = { title, lede, mark, close, body, foot };

  close.addEventListener('click', () => dialog.close());
  // Escape is the dialog's own close request, and it closes the dialog either way.
  // Stopping it here keeps a site's document-level Escape handler from also closing
  // whatever the dialog was opened over (buyhacks' product detail, memes' lightbox).
  dialog.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') event.stopPropagation();
  });
  // Close on a click that both starts and ends on the backdrop. A text selection dragged
  // out of an input ends outside the box too, and must not throw the form away.
  let downOutside = false;
  const outside = (event) => {
    const box = dialog.getBoundingClientRect();
    return event.clientX < box.left || event.clientX > box.right || event.clientY < box.top || event.clientY > box.bottom;
  };
  dialog.addEventListener('pointerdown', (event) => { downOutside = event.target === dialog && outside(event); });
  dialog.addEventListener('click', (event) => {
    if (downOutside && event.target === dialog && outside(event)) dialog.close();
    downOutside = false;
  });
  dialog.addEventListener('close', () => {
    const target = auth.invoker?.isConnected ? auth.invoker : document.querySelector('[data-neo-auth] button');
    auth.invoker = null;
    target?.focus?.({ preventScroll: true });
  });
  document.body.append(dialog);
  return dialog;
}

function statusBlock(kind, message, onRetry) {
  const block = h('div', { class: 'neo-auth-status', 'data-kind': kind, role: kind === 'error' ? 'alert' : 'status' });
  if (kind === 'loading') block.append(h('span', { class: 'neo-auth-spinner', 'aria-hidden': 'true' }));
  block.append(h('p', { text: message }));
  if (onRetry) block.append(h('button', { type: 'button', class: 'neo-auth-retry', text: t().retry, onclick: onRetry }));
  return block;
}

function legalLinks() {
  const s = t();
  return [
    h('a', { href: PRIVACY_URL, target: '_blank', rel: 'noopener', text: s.privacy }),
    ' · ',
    h('a', { href: TERMS_URL, target: '_blank', rel: 'noopener', text: s.terms }),
  ];
}

/* ── Sign-in dialog ──────────────────────────────────────────────────────── */

function signInDialog() {
  if (auth.signInDialog) return auth.signInDialog;
  const dialog = buildDialog('neo-auth-signin');
  const status = h('div');
  const mount = h('div', { class: 'neo-auth-mount', hidden: true });
  dialog.neoParts.body.append(status, mount);
  Object.assign(dialog.neoParts, { status, mount, host: null });
  dialog.addEventListener('close', () => {
    dialog.neoObserver?.disconnect();
    unmountSignIn();
    const signedIn = auth.status === 'signed-in';
    for (const resolve of auth.waiters.splice(0)) resolve(signedIn);
  });
  auth.signInDialog = dialog;
  return dialog;
}

function paintSignInCopy(dialog) {
  const s = t();
  const { title, lede, mark, close, foot } = dialog.neoParts;
  const reason = dialog.neoReason || auth.options.reason || meta('neo-auth-reason');
  title.textContent = s.signInTo(siteName());
  lede.textContent = reason || s.lede;
  close.setAttribute('aria-label', s.close);
  const icon = document.querySelector('link[rel~="icon"][type="image/svg+xml"]')?.href;
  if (icon) {
    // A favicon that fails to load would draw a broken-image box in the dialog's title.
    // Emptying the mark instead lets .neo-auth-mark:empty take it out of the header grid.
    const img = h('img', { src: icon, alt: '', width: 40, height: 40, decoding: 'async' });
    img.addEventListener('error', () => img.remove(), { once: true });
    mark.replaceChildren(img);
  } else {
    mark.replaceChildren();
  }
  // The shared-account line appears once: as the lede, or here when a reason took the lede.
  foot.replaceChildren(h('p', {}, reason ? `${s.lede} ` : '', ...legalLinks()));
  paintScheme(dialog);
}

function unmountSignIn() {
  const dialog = auth.signInDialog;
  if (!dialog?.neoMounted) return;
  const { mount, host } = dialog.neoParts;
  try { auth.clerk?.unmountSignIn(host); } catch { /* already gone */ }
  // Detach, never empty: React removes its own nodes after unmount returns, and a host
  // emptied first makes that removal throw NotFoundError from inside clerk-js.
  host?.remove();
  dialog.neoParts.host = null;
  dialog.neoMounted = false;
  mount.hidden = true;
}

function watchSignIn(dialog) {
  const { mount, status, title } = dialog.neoParts;
  let focused = false;
  const update = () => {
    const field = mount.querySelector('input:not([type="hidden"]):not([disabled])');
    if (field && mount.hidden) {
      mount.hidden = false;
      status.replaceChildren();
    }
    if (field && !focused && matchMedia('(pointer: fine)').matches && !mount.contains(document.activeElement)) {
      focused = true;
      field.focus();
    }
    title.textContent = mount.querySelector('.cl-signUp-root')
      ? t().createAccount(siteName())
      : t().signInTo(siteName());
  };
  dialog.neoObserver?.disconnect();
  // Called directly, not through requestAnimationFrame: a tab in the background runs no
  // frames, and the form stayed hidden behind the spinner until the tab was looked at.
  dialog.neoObserver = new MutationObserver(update);
  dialog.neoObserver.observe(mount, { childList: true, subtree: true });
}

async function mountSignIn() {
  const dialog = signInDialog();
  const { status, mount } = dialog.neoParts;
  status.replaceChildren(statusBlock('loading', t().loading));
  try {
    const clerk = await loadClerk();
    if (!dialog.open) return;
    if (clerk.session) { dialog.close(); return; }
    unmountSignIn();
    // Clerk overwrites the class of the node it mounts into, so every mount gets a fresh
    // inner host and the wrapper keeps the kit's own class and hidden state.
    const host = h('div');
    mount.append(host);
    dialog.neoParts.host = host;
    watchSignIn(dialog);
    const here = location.href;
    clerk.mountSignIn(host, {
      // Virtual routing: runcible and rappel own location.hash, and Clerk's default hash
      // routing rewrites it on every step.
      routing: 'virtual',
      withSignUp: true,
      // The default is "/", which dropped people on the site's front page after signing in.
      fallbackRedirectUrl: here,
      signUpFallbackRedirectUrl: here,
      appearance: appearanceFor('embedded'),
    });
    dialog.neoMounted = true;
  } catch (error) {
    if (!dialog.open) return;
    const local = error.code === 'local-production-key';
    status.replaceChildren(statusBlock('error', local ? t().localOnly : t().loadFailed, local ? null : () => { void mountSignIn(); }));
  }
}

/* ── Sites dialog ────────────────────────────────────────────────────────── */

function sitesDialog() {
  if (auth.sitesDialog) return auth.sitesDialog;
  auth.sitesDialog = buildDialog('neo-auth-sites');
  return auth.sitesDialog;
}

async function loadCatalogue() {
  if (auth.catalogue) return auth.catalogue;
  const module = await import(new URL('./neorgon-auth-sites.js', import.meta.url).href);
  auth.catalogue = Array.isArray(module.default) ? module.default : [];
  return auth.catalogue;
}

function formatDay(day, locale) {
  try {
    return new Date(`${day}T12:00:00Z`).toLocaleDateString(locale, { year: 'numeric', month: 'short', day: 'numeric', timeZone: 'UTC' });
  } catch {
    return day;
  }
}

function siteRow(site, detail) {
  const icon = typeof site.icon === 'string' && site.icon.startsWith('data:image/')
    ? h('img', { class: 'neo-auth-site-icon', src: site.icon, alt: '', width: 32, height: 32 })
    : h('span', { class: 'neo-auth-site-icon', 'aria-hidden': 'true', html: MARK_HEX });
  const linkable = !site.current && /^https:\/\/[a-z0-9.-]+\//.test(String(site.url));
  const name = linkable
    ? h('a', { class: 'neo-auth-site-link neo-auth-site-name', href: site.url, text: site.name })
    : h('span', { class: 'neo-auth-site-name', text: site.name });
  return h('li', { class: 'neo-auth-site' },
    icon,
    h('div', {}, name, h('span', { class: 'neo-auth-site-meta', text: detail })),
    site.current ? h('span', { class: 'neo-auth-here', text: t().here }) : null);
}

function renderSites(dialog, view, preview) {
  const s = t();
  const lang = auth.locale;
  const used = h('section', { class: 'neo-auth-section', 'aria-labelledby': 'neo-auth-used' },
    h('h3', { class: 'neo-auth-section-title', id: 'neo-auth-used', text: s.usedHeading }),
    view.used.length
      ? h('ul', { class: 'neo-auth-sites' }, view.used.map((site) =>
        siteRow(site, `${s.lastUsed(formatDay(site.last, lang))}, ${s.since(formatDay(site.first, lang))}`)))
      : h('p', { class: 'neo-auth-empty', text: s.none }));
  const sections = [used];
  if (view.others.length) {
    sections.push(h('section', { class: 'neo-auth-section', 'aria-labelledby': 'neo-auth-others' },
      h('h3', { class: 'neo-auth-section-title', id: 'neo-auth-others', text: s.othersHeading }),
      h('ul', { class: 'neo-auth-sites' }, view.others.map((site) =>
        siteRow(site, site.description || String(site.url).replace(/^https:\/\//, '').replace(/\/$/, ''))))));
  }
  if (view.used.length) sections.push(clearButton(dialog, preview));
  dialog.neoParts.body.replaceChildren(...sections);
}

function clearButton(dialog, preview) {
  const s = t();
  const button = h('button', { type: 'button', class: 'neo-auth-clear', text: s.clear });
  const disarm = () => {
    if (button.disabled) return;
    button.removeAttribute('data-armed');
    button.textContent = s.clear;
  };
  button.addEventListener('blur', disarm);
  button.addEventListener('click', async () => {
    if (!button.hasAttribute('data-armed')) {
      button.setAttribute('data-armed', '');
      button.textContent = s.confirmClear;
      return;
    }
    button.disabled = true;
    try {
      if (preview) preview.metadata = null;
      else await writeMetadata(auth.clerk.user, { neorgon: { sites: null } });
      announce(s.cleared);
      await openSites({ preview });
      dialog.neoParts.close.focus();
    } catch (error) {
      console.error('Neorgon auth: could not clear the account history.', error);
      button.disabled = false;
      disarm();
    }
  });
  return button;
}

/* ── Public API ──────────────────────────────────────────────────────────── */

/**
 * Idempotent: every call returns the first call's promise, so a site that re-runs its
 * setup (runcible does, per book) cannot stack listeners. Resolves with the settled state.
 */
export function start(options = {}) {
  if (options.convex) bindConvex(options.convex);
  if (auth.started) return auth.started;
  auth.options = options;
  auth.locale = localeFor(document.documentElement.lang);
  auth.started = (async () => {
    new MutationObserver(() => {
      const next = localeFor(document.documentElement.lang);
      if (next === auth.locale) return;
      auth.locale = next;
      renderSlots();
      if (auth.signInDialog?.open) paintSignInCopy(auth.signInDialog);
      if (auth.sitesDialog?.open) void openSites({ preview: auth.sitesDialog.neoPreview });
    }).observe(document.documentElement, { attributes: true, attributeFilter: ['lang'] });

    auth.key = resolveKey(options);
    if (!hostFromPublishableKey(auth.key)) {
      if (auth.key) console.error('Neorgon auth: clerk-publishable-key is not a Clerk publishable key (pk_test_ or pk_live_).');
      commit(signedOutState('unavailable'));
      return snapshot();
    }
    const uat = readClientUat(document.cookie);
    if (options.eager || uat > 0) {
      commit(signedOutState('loading'));
      try { await loadClerk(); } catch { commit(signedOutState('signed-out')); }
    } else {
      commit(signedOutState('signed-out'));
    }
    return snapshot();
  })();
  return auth.started;
}

/** Keep a ConvexHttpClient on the current Clerk token. Safe to call more than once. */
export function bindConvex(client) {
  if (typeof client?.setAuth !== 'function' || auth.clients.has(client)) return;
  auth.clients.add(client);
  if (auth.clerk) void syncClients();
}

/** Called now with the settled state, then on every real change. Returns an unsubscribe. */
export function onChange(listener) {
  auth.listeners.add(listener);
  if (SETTLED.has(auth.status)) {
    queueMicrotask(() => { if (auth.listeners.has(listener)) listener(snapshot()); });
  }
  return () => auth.listeners.delete(listener);
}

/** Open the sign-in dialog. Resolves true once signed in, false if it is dismissed. */
export async function openSignIn({ reason, invoker } = {}) {
  await start();
  if (auth.status === 'signed-in') return true;
  if (auth.status === 'unavailable') return false;
  const dialog = signInDialog();
  auth.invoker = invoker || document.activeElement;
  dialog.neoReason = reason || '';
  paintSignInCopy(dialog);
  const settled = new Promise((resolve) => auth.waiters.push(resolve));
  if (!dialog.open) {
    dialog.showModal();
    void mountSignIn();
  }
  return settled;
}

/** For gated actions: true straight away when signed in, otherwise the dialog decides. */
export async function requireSignIn(options = {}) {
  await start();
  if (auth.status === 'loading') await auth.loading?.catch(() => {});
  if (auth.status === 'signed-in') return true;
  return openSignIn(options);
}

/**
 * "Your Neorgon sites". Pass { preview: { catalogue, metadata, currentId } } to render
 * fixture data without a session, which is how the showcase and its checks exercise it.
 */
export async function openSites({ invoker, preview } = {}) {
  if (!preview) {
    await start();
    if (auth.status !== 'signed-in') return requireSignIn();
  }
  const s = t();
  const dialog = sitesDialog();
  const { title, lede, mark, close, body, foot } = dialog.neoParts;
  dialog.neoPreview = preview;
  if (!dialog.open) auth.invoker = invoker || document.activeElement;
  title.textContent = s.sitesTitle;
  lede.textContent = s.sitesLede;
  close.setAttribute('aria-label', s.close);
  mark.innerHTML = MARK_HEX;
  foot.replaceChildren(h('p', {}, ...legalLinks()));
  paintScheme(dialog);
  if (!body.childElementCount) body.append(statusBlock('loading', s.sitesLoading));
  if (!dialog.open) dialog.showModal();
  try {
    const catalogue = preview?.catalogue ?? await loadCatalogue();
    let metadata = preview?.metadata;
    if (!preview) {
      const user = auth.clerk.user;
      try { await user.reload(); } catch { /* render what the session already holds */ }
      metadata = user.unsafeMetadata;
    }
    renderSites(dialog, sitesView(catalogue, metadata, preview?.currentId ?? currentSiteId()), preview);
  } catch (error) {
    console.error('Neorgon auth: could not load the sites list.', error);
    body.replaceChildren(statusBlock('error', s.sitesFailed));
  }
  return undefined;
}

export async function signOut() {
  await auth.clerk?.signOut();
}

/** A fresh Convex token, for a site that calls Convex over plain fetch. */
export async function convexToken() {
  const session = auth.clerk?.session;
  return session ? session.getToken({ template: 'convex' }) : null;
}

export const NeoAuth = {
  start,
  bindConvex,
  onChange,
  openSignIn,
  requireSignIn,
  openSites,
  signOut,
  convexToken,
  get state() { return snapshot(); },
};

if (typeof window !== 'undefined') window.NeoAuth = NeoAuth;
