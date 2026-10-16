import { exactReleaseDate } from './release-evidence.js';

export const storeStates = { released: 'Released game', demo: 'Released demo', upcoming: 'Upcoming', development: 'In development', prototype: 'Prototype', 'on-hold': 'On hold', canceled: 'Canceled', unknown: 'Status not checked' };
export const priceStates = { free: 'Free / no minimum price', paid: 'Listed price', unknown: 'Price not known' };

export function releaseWindow(label) {
  const date = exactReleaseDate(label);
  if (date) return { precision: 'day', date, month: date.slice(0,7), label };
  const names = ['january','february','march','april','may','june','july','august','september','october','november','december'];
  let match = /^([A-Za-z]+)\s+(20\d{2})$/.exec(label || '');
  if (match) {
    const month = names.findIndex(name => name === match[1].toLowerCase() || name.slice(0,3) === match[1].toLowerCase());
    if (month >= 0) return { precision: 'month', month: `${match[2]}-${String(month+1).padStart(2,'0')}`, label };
  }
  if ((match = /^Q([1-4])\s+(20\d{2})$/i.exec(label || ''))) return { precision: 'quarter', year: +match[2], quarter: +match[1], label };
  if (/^20\d{2}$/.test(label || '')) return { precision: 'year', year: +label, label };
  return { precision: 'unspecified', label: label || 'Not announced' };
}

export function storeListings(games) {
  const entries = new Map();
  for (const game of games) {
    let url; try { url = new URL(game.projectUrl); } catch { continue; }
    const steamId = url.hostname === 'store.steampowered.com' && /^\/app\/(\d+)/.exec(url.pathname)?.[1];
    const itch = url.hostname.endsWith('.itch.io') && url.hostname.split('.').length === 3;
    if (!steamId && !itch) continue;
    const key = steamId ? `steam:${steamId}` : `itch:${url.hostname}/${url.pathname.split('/').filter(Boolean)[0] || ''}`;
    const previous = entries.get(key), gamesForListing = [...(previous?.games || []), game];
    if (previous && (previous.game.storeCheckedAt || '') > (game.storeCheckedAt || '')) { previous.games = gamesForListing; continue; }
    const provider = steamId ? 'Steam' : 'itch.io';
    let state = 'unknown';
    if (steamId) state = game.storeState === 'coming-soon' ? 'upcoming' : game.storeState === 'released' ? (game.releaseKind || game.storeRelease?.kind) === 'demo' ? 'demo' : 'released' : 'unknown';
    else state = ({Released:'released','In development':'development',Prototype:'prototype','On hold':'on-hold',Canceled:'canceled'})[game.listingStatus] || 'unknown';
    const price = game.storePrice || (Number.isInteger(game.priceCents) ? {cents:game.priceCents,currency:'USD'} : null);
    const pricing = game.storeIsFree === true || price?.cents === 0 ? 'free' : price?.cents > 0 ? 'paid' : 'unknown';
    entries.set(key,{key,game,games:gamesForListing,provider,state,price,pricing,url:game.storeUrl || url.href,
      planned:state === 'upcoming' ? releaseWindow(game.storeRelease?.label) : null});
  }
  return [...entries.values()].sort((a,b)=>a.game.title.localeCompare(b.game.title));
}

export function releaseCalendar(entries, month, today = new Date().toISOString().slice(0,10)) {
  const upcoming = entries.filter(entry => entry.provider === 'Steam' && entry.state === 'upcoming');
  const scheduled = upcoming.filter(entry => entry.planned.month === month && (!entry.planned.date || entry.planned.date >= today))
    .sort((a,b)=>(a.planned.date||month+'-99').localeCompare(b.planned.date||month+'-99')||(a.game?.title||'').localeCompare(b.game?.title||''));
  const past = entry => entry.planned.date ? entry.planned.date < today : entry.planned.month ? entry.planned.month < today.slice(0,7) : entry.planned.year ? entry.planned.year < +today.slice(0,4) || entry.planned.year === +today.slice(0,4) && entry.planned.quarter && entry.planned.quarter < Math.ceil(+today.slice(5,7)/3) : false;
  return { scheduled, broader: upcoming.filter(entry => !entry.planned.month && !past(entry)), overdue: upcoming.filter(past) };
}
