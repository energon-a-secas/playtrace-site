import { safeGetJSON, safeSetJSON } from './neorgon-persist.js';

const validId = value => typeof value === 'string' && /^g_[a-z0-9]{5,12}$/.test(value);
export function createFavoritesStore(read = safeGetJSON, write = safeSetJSON) {
  const memory = new Map(), unsaved = new Set();
  let aliases=new Map();
  const canonical=id=>aliases.get(id)||id;
  const key = user => `playtrace.favorites.v1:${user || 'guest'}`;
  function load(user) {
    const stored = (unsaved.has(key(user)) ? memory.get(key(user)) : read(key(user), null) || memory.get(key(user))) || {};
    const ids = [...new Set((Array.isArray(stored.ids) ? stored.ids : []).filter(validId))].slice(0, 2000);
    const changes = Object.fromEntries(Object.entries(stored.changes || {}).filter(([id, value]) => validId(id)
      && typeof value?.saved === 'boolean' && typeof value.revision === 'string').slice(0, 2000));
    const value={ids:[...new Set(ids.map(canonical))],changes:{}};
    // Newer intent wins when old and current IDs both have pending changes.
    // On a timestamp tie, prefer the action on the current project.
    for(const [id,change] of Object.entries(changes).sort(([a,x],[b,y])=>(x.updatedAt||0)-(y.updatedAt||0)||Number(!aliases.has(a))-Number(!aliases.has(b))))value.changes[canonical(id)]=change;
    for(const [id,change] of Object.entries(value.changes))if(!change.saved)value.ids=value.ids.filter(item=>item!==id);
    if(JSON.stringify(value)!==JSON.stringify({ids,changes}))save(user,value);
    return value;
  }
  function save(user, value) {
    memory.set(key(user), value); const persisted = write(key(user), value);
    persisted ? unsaved.delete(key(user)) : unsaved.add(key(user)); return persisted;
  }
  function reconcile(user, remote) {
    const value = load(user), ids = new Set(remote.filter(validId).map(canonical));
    for (const [id, change] of Object.entries(value.changes)) change.saved ? ids.add(id) : ids.delete(id);
    value.ids = [...ids].slice(0, 2000); save(user, value); return value.ids;
  }
  return {
    setAliases(games) {
      const current=new Set(games.map(game=>game.id)),next=new Map();
      for(const game of games)for(const id of game.aliases||[])if(validId(id)&&validId(game.id)&&!current.has(id))next.set(id,game.id);
      aliases=next;
    },
    ids: user => load(user).ids,
    pending: user => Object.entries(load(user).changes).map(([gameId, change]) => ({ gameId, ...change })),
    toggle(user, id) {
      if (!validId(id)) return null;
      id=canonical(id);
      const value = load(user), saved = !value.ids.includes(id);
      if (saved && value.ids.length >= 2000) return null;
      value.ids = saved ? [...value.ids, id] : value.ids.filter(item => item !== id);
      value.changes[id] = { saved, revision: crypto.randomUUID(), updatedAt: Date.now() };
      return { saved, persisted: save(user, value), ids: value.ids };
    },
    adoptGuest(user) {
      if (!user) return;
      const guest = load(null), account = load(user);
      for (const id of guest.ids) if ((account.ids.includes(id) || account.ids.length < 2000)
        && (!account.changes[id] || (guest.changes[id]?.updatedAt || 0) >= (account.changes[id].updatedAt || 0))) {
        if (!account.ids.includes(id)) account.ids.push(id);
        account.changes[id] = { saved: true, revision: crypto.randomUUID(), updatedAt: guest.changes[id]?.updatedAt || Date.now() };
      }
      // Handoff is durable before the anonymous copy is cleared. Account caches
      // stay separate on shared devices; signing out never exposes them.
      if (save(user, account)) {
        const remaining = guest.ids.filter(id => !account.ids.includes(id) && !account.changes[id]);
        save(null, { ids: remaining, changes: Object.fromEntries(Object.entries(guest.changes).filter(([id]) => remaining.includes(id))) });
      }
    },
    reconcile,
    acknowledge(user, sent, remote) {
      const value = load(user);
      for (const item of sent) if (value.changes[canonical(item.gameId)]?.revision === item.revision) delete value.changes[canonical(item.gameId)];
      save(user, value); return reconcile(user, remote);
    },
    clear(user) { save(user, { ids: [], changes: {} }); },
  };
}
export const favorites = createFavoritesStore();
