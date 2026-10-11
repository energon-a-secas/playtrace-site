// Retain decoded images for this round, including the next clue. Reusing the
// actual element avoids a second request when a preloaded clue becomes visible.
export function createQuizImages() {
  const cache = new Map();
  function get(question, { priority = 'high', retry = false } = {}) {
    const key = `${question.image}\n${question.fallbackImage || ''}`;
    let entry = cache.get(key);
    if (entry && (retry || entry.state === 'error')) { entry.cancel(); cache.delete(key); entry = null; }
    if (entry) { entry.image.fetchPriority = priority; return entry; }

    const image = new Image();
    image.decoding = 'async'; image.referrerPolicy = 'no-referrer'; image.fetchPriority = priority;
    const sources = [...new Set([question.image, question.fallbackImage].filter(Boolean))];
    let timer, attempt = 0, settled = false, resolve, reject;
    const loaded = new Promise((yes, no) => { resolve = yes; reject = no; });
    const cleanup = () => { clearTimeout(timer); image.onload = null; image.onerror = null; };
    const finish = error => {
      if (settled) return;
      settled = true; cleanup(); entry.state = error ? 'error' : 'ready';
      if (error) reject(error); else resolve(image);
    };
    entry = { image, loaded, state: 'loading', cancel() {
      if (!settled) { finish(new Error('Image cancelled')); image.removeAttribute('src'); }
    } };
    cache.set(key, entry);
    // A speculative preload can fail before anything awaits it.
    loaded.catch(() => {});
    const trySource = () => {
      if (settled) return;
      cleanup();
      const current = ++attempt;
      const failed = () => {
        if (settled || current !== attempt) return;
        if (attempt < sources.length) trySource(); else finish(new Error('Screenshot unavailable'));
      };
      image.onload = async () => {
        try { await image.decode(); } catch { failed(); return; }
        if (!settled && current === attempt) finish();
      };
      image.onerror = failed;
      timer = setTimeout(failed, 12000);
      image.src = sources[attempt - 1];
    };
    trySource();
    return entry;
  }
  return {
    get,
    preload(question) {
      const connection = navigator.connection;
      if (question && !connection?.saveData && !/2g/.test(connection?.effectiveType || '')) get(question, { priority: 'low' });
    },
    clear() { for (const entry of cache.values()) entry.cancel(); cache.clear(); },
  };
}
