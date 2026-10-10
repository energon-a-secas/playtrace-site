/**
 * Neorgon Persist Kit
 * Canonical source: packages/neorgon-ui/persist/persist.js
 * Vendored per site as js/neorgon-persist.js by packages/neorgon-ui/sync-persist.sh
 *
 * 50 sites read and write localStorage directly, 546 call sites in total.
 * Exactly half wrap those calls in try/catch. The other half throw in private
 * browsing, where localStorage exists but every access raises, and throw again
 * when a quota is exceeded.
 *
 * A store here never throws. A read failure returns the fallback, a write
 * failure returns false. Losing a saved layout is bad; a blank page because a
 * setItem raised during render is worse.
 *
 * Do not edit a vendored copy. Edit here and run sync-persist.sh.
 */


/**
 * Drop-in replacements for raw localStorage calls that never throw.
 *
 * Use these when a site already has its own storage format and changing it
 * would orphan data visitors have saved. createStore is for new stores.
 *
 *   localStorage.getItem(k)      ->  safeGet(k)
 *   localStorage.setItem(k, v)   ->  safeSet(k, v)
 *   localStorage.removeItem(k)   ->  safeRemove(k)
 */
export function safeGet(key, fallback = null) {
  try {
    const v = localStorage.getItem(key);
    return v === null ? fallback : v;
  } catch {
    return fallback;
  }
}

export function safeSet(key, value) {
  try {
    localStorage.setItem(key, value);
    return true;
  } catch {
    return false;
  }
}

export function safeRemove(key) {
  try {
    localStorage.removeItem(key);
    return true;
  } catch {
    return false;
  }
}

/** JSON convenience over safeGet, returning the fallback on any parse failure. */
export function safeGetJSON(key, fallback = null) {
  const raw = safeGet(key);
  if (raw === null) return fallback;
  try {
    return JSON.parse(raw);
  } catch {
    return fallback;
  }
}

export function safeSetJSON(key, value) {
  try {
    return safeSet(key, JSON.stringify(value));
  } catch {
    return false;   // circular structure, BigInt, and friends
  }
}

/** True when localStorage is present AND usable. Safari private mode fails the write. */
export function storageAvailable() {
  try {
    const probe = '__neo_probe__';
    localStorage.setItem(probe, '1');
    localStorage.removeItem(probe);
    return true;
  } catch {
    return false;
  }
}

/**
 * A namespaced, versioned store.
 *
 *   const store = createStore({ key: 'proctor_v1', version: 2, migrate });
 *   const state = store.load({ items: [] });
 *   store.save(state);
 *
 * The version is written alongside the data. When it differs, `migrate(data,
 * from)` is called; returning null or undefined discards the old value rather
 * than handing the app a shape it cannot read.
 */
export function createStore({ key, version = 1, migrate = null } = {}) {
  if (!key) throw new Error('createStore needs a key');

  function load(fallback = null) {
    let raw;
    try {
      raw = localStorage.getItem(key);
    } catch {
      return fallback;              // private mode, or storage disabled
    }
    if (raw === null) return fallback;

    let parsed;
    try {
      parsed = JSON.parse(raw);
    } catch {
      return fallback;              // corrupted, half-written, or hand-edited
    }

    // Unwrapped legacy value from before this store existed.
    if (!parsed || typeof parsed !== 'object' || !('__v' in parsed)) {
      if (!migrate) return parsed ?? fallback;
      const out = migrate(parsed, 0);
      return out === null || out === undefined ? fallback : out;
    }

    if (parsed.__v !== version) {
      if (!migrate) return fallback;
      const out = migrate(parsed.data, parsed.__v);
      return out === null || out === undefined ? fallback : out;
    }
    return parsed.data;
  }

  function save(data) {
    try {
      localStorage.setItem(key, JSON.stringify({ __v: version, data }));
      return true;
    } catch {
      return false;                 // quota exceeded, or storage disabled
    }
  }

  function clear() {
    try {
      localStorage.removeItem(key);
      return true;
    } catch {
      return false;
    }
  }

  return { key, version, load, save, clear };
}
