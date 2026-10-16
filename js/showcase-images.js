// Fetch in parallel, decode before showing, then reveal in reading order.
// A slow or broken image cannot hold the rest of the wall indefinitely.
export function bindShowcaseImages(wall) {
  const reduced = matchMedia('(prefers-reduced-motion: reduce)');
  const states = new Map();
  let timer, lastReveal = -Infinity, disposed = false;
  document.documentElement.dataset.showcaseLoading = 'active';

  function reveal(state, now) {
    state.shown = true;
    state.image.classList.add('is-ready');
    lastReveal = now;
  }
  function flush() {
    clearTimeout(timer);
    if (disposed) return;
    const now = performance.now();
    for (const image of wall.querySelectorAll('.showcase-art img')) {
      const state = states.get(image);
      if (!state || state.shown || state.failed) continue;
      if (reduced.matches) { if (state.ready) reveal(state, now); continue; }
      if (!state.ready) {
        // Lazy offscreen images should not delay something the reader scrolled to.
        const box = image.getBoundingClientRect();
        if (box.bottom <= 0 || box.top >= innerHeight || now >= state.deadline) continue;
        timer = setTimeout(flush, state.deadline - now); return;
      }
      const remaining = 90 - (now - lastReveal);
      if (remaining > 0) { timer = setTimeout(flush, remaining); return; }
      reveal(state, now);
    }
  }
  function refresh() {
    for (const image of wall.querySelectorAll('.showcase-art img')) {
      if (states.has(image)) continue;
      const state = { image, deadline: performance.now() + 1800, ready: false, failed: false, shown: false };
      states.set(image, state);
      state.fail = () => {
        if (disposed) return;
        state.failed = true; image.hidden = true;
        image.parentElement?.classList.add('showcase-art--missing'); flush();
      };
      state.load = async () => {
        try { await image.decode(); } catch { /* A loaded image can still be displayed if decoding was interrupted. */ }
        if (disposed || !image.isConnected) return;
        if (!image.naturalWidth) return state.fail();
        state.ready = true; flush();
      };
      image.addEventListener('load', state.load);
      image.addEventListener('error', state.fail);
      if (image.complete) image.naturalWidth ? state.load() : state.fail();
    }
    for (const [image, state] of states) if (!wall.contains(image)) {
      image.removeEventListener('load', state.load); image.removeEventListener('error', state.fail); states.delete(image);
    }
    flush();
  }
  const observer = new MutationObserver(refresh);
  observer.observe(wall, { childList: true });
  reduced.addEventListener('change', flush);
  refresh();
  return () => {
    disposed = true; clearTimeout(timer); observer.disconnect(); reduced.removeEventListener('change', flush);
    for (const [image, state] of states) {
      image.removeEventListener('load', state.load); image.removeEventListener('error', state.fail); image.classList.add('is-ready');
    }
    states.clear();
  };
}

if (typeof document !== 'undefined') {
  const wall = document.getElementById('weeklyHighlights');
  if (wall) bindShowcaseImages(wall);
}
