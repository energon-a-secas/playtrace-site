import { request } from './api.js';
import { NeoAuth } from './neorgon-auth.js';
import { updateHighlightPanels } from './highlight-view.js';
import { dateLabel } from './collection.js';
import { bindShowcase } from './showcase-motion.js';

const current = new URL(location.href);
if (['game','q','cat','platform','stage','maker','author','following','view','sort'].some(key => current.searchParams.has(key)) || current.hash === '#discover') {
  current.pathname = '/browse/'; location.replace(current.href);
} else {
  const refreshShowcase = bindShowcase(document.getElementById('weeklyHighlights'));
  NeoAuth.onChange(async auth => {
    const user = auth.userId;
    document.getElementById('editHighlights').hidden = true;
    if (!auth.signedIn) return;
    try {
      const token = await auth.clerk.session.getToken();
      await request('/admin/me', { token });
      if (NeoAuth.state.signedIn && NeoAuth.state.userId === user) document.getElementById('editHighlights').hidden = false;
    } catch { /* Curation is available only after server-verified admin access. */ }
  });
  NeoAuth.start();
  try {
    let picks, saved = false;
    try { picks = await request('/highlights'); }
    catch (error) {
      if (error.code !== 'SERVICE_UNAVAILABLE' && !(error instanceof TypeError)) throw error;
      const response = await fetch('/data/highlights.json', { cache: 'no-cache' });
      if (!response.ok) throw error;
      picks = await response.json(); saved = true;
      const age = Date.now() - Date.parse(picks.updatedAt);
      if (!Number.isFinite(age) || age < 0 || age > 7 * 86400000) throw error;
    }
    const items = picks.items;
    if (!Array.isArray(items) || !items.length || items.length > 5) throw new Error('No highlights yet');
    const communityPicks = items.filter(item => item.basis === 'community').length;
    document.getElementById('highlightWeek').textContent = `Week of ${dateLabel(picks.week + 'T12:00:00Z')}${communityPicks ? ` · ${communityPicks} community ${communityPicks === 1 ? 'pick' : 'picks'}` : ''}${saved ? ' · Saved picks' : ''}`;
    updateHighlightPanels(document.getElementById('weeklyHighlights'), items, picks.editorPick);
    document.getElementById('weeklyHighlights').setAttribute('aria-busy', 'false');
    refreshShowcase();
  } catch {
    // The published selection remains useful when the live service is slow.
    if (!document.querySelector('#weeklyHighlights .showcase-game')) document.getElementById('weeklyHighlights').innerHTML = '<li class="highlights-empty">Weekly picks are taking a break. <a href="/browse/">Explore the collection ↗</a></li>';
    document.getElementById('weeklyHighlights').setAttribute('aria-busy', 'false');
  }
}
