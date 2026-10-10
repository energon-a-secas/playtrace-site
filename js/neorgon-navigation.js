/** Change only the query keys owned by a feature. Arrays are repeated values;
 * empty strings, null and empty arrays remove that feature's key. */
export function updateQuery(href, values) {
  const url = new URL(href);
  for (const [key, value] of Object.entries(values)) {
    url.searchParams.delete(key);
    for (const item of Array.isArray(value) ? value : [value]) {
      if (item !== '' && item != null) url.searchParams.append(key, String(item));
    }
  }
  return url;
}

/** History for filterable pages, not a router. Sites own their schema, state
 * and rendering. Only explicit visitor actions call schedule/replace/push. */
export function createQueryHistory(urlForState, { delay = 250, window: target = globalThis.window } = {}) {
  let timer;
  function commit(replace) {
    const next = urlForState(target.location.href);
    if (next.href !== target.location.href) {
      target.history[replace ? 'replaceState' : 'pushState'](target.history.state, '', next);
    }
  }
  function cancel() { clearTimeout(timer); timer = undefined; }
  function flush() {
    if (timer === undefined) return;
    cancel();
    commit(true);
  }
  return {
    cancel,
    flush,
    schedule() { cancel(); timer = setTimeout(flush, delay); },
    replace() { cancel(); commit(true); },
    // Flush the search before changing another filter, so Back can restore it.
    push(change = () => {}) { flush(); change(); commit(false); },
    listen(restore) {
      const onPop = () => { cancel(); restore(target.location.href); };
      target.addEventListener('popstate', onPop);
      return () => { cancel(); target.removeEventListener('popstate', onPop); };
    },
  };
}
