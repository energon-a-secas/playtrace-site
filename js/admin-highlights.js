import { $, escHtml as e } from './utils.js';
import { dateLabel } from './collection.js';
let api, saved, items = [], excluded = [], epoch = 0, loading = false;
export function resetHighlights() { epoch++; saved = null; items = []; excluded = []; loading = false; $('highlightSlots').textContent = ''; $('highlightSearch').value = ''; $('highlightMatches').textContent = ''; $('highlightSave').disabled = true; }
const gameFor = id => api.games().find(game => game.id === id) || saved?.items.find(item => item.gameId === id)?.game;
function paint() {
  $('highlightSlots').innerHTML = items.map((item, i) => {
    const game = gameFor(item.gameId), url = game?.preview.posterUrl || (game?.preview.kind === 'image' ? game.preview.url : '');
    return `<li><span class="highlight-position">0${i + 1}</span>${url ? `<img src="${e(url)}" alt="" width="104" height="64" loading="lazy">` : ''}<div class="highlight-game"><strong>${e(game?.title || item.gameId)}</strong><span>u/${e(game?.author.name || '')}</span><label><input type="checkbox" data-pin="${i}" ${item.pinned ? 'checked' : ''}> Keep next Saturday</label></div><div class="highlight-actions"><button type="button" class="btn btn--secondary" data-move="${i}" data-direction="-1" aria-label="Move ${e(game?.title)} up" ${i === 0 ? 'disabled' : ''}>↑</button><button type="button" class="btn btn--secondary" data-move="${i}" data-direction="1" aria-label="Move ${e(game?.title)} down" ${i === items.length - 1 ? 'disabled' : ''}>↓</button><button type="button" class="text-button" data-drop="${i}">Remove</button></div></li>`;
  }).join('');
  $('highlightCount').textContent = `${items.length} of 5 picks · ${items.filter(item => item.pinned).length} kept for next week`;
  $('highlightSave').disabled = !saved || items.length !== 5 || loading;
  $('highlightExcluded').innerHTML = excluded.map(id => `<li><span>${e(gameFor(id)?.title || id)}</span><button class="text-button" type="button" data-allow="${e(id)}">Allow again</button></li>`).join('');
  $('highlightExclusions').hidden = excluded.length === 0;
  search();
}
function search() {
  const term = $('highlightSearch').value.trim().toLowerCase();
  const matches = term ? api.games().filter(game => !items.some(item => item.gameId === game.id) && `${game.title} ${game.author.name}`.toLowerCase().includes(term)).slice(0, 12) : [];
  $('highlightMatches').innerHTML = matches.map(game => `<li><span><strong>${e(game.title)}</strong><small>u/${e(game.author.name)}</small></span><button type="button" class="btn btn--secondary" data-add-highlight="${e(game.id)}" ${items.length >= 5 ? 'disabled' : ''}>Add</button></li>`).join('');
  $('highlightSearchHint').textContent = items.length === 5 ? 'Remove a pick to make room for another game.' : term && !matches.length ? 'No matching projects. Try a game title or maker.' : 'Search by title or maker. Choose five, then save the selection.';
}
export async function loadHighlightsAdmin() {
  if (loading) return; const version = ++epoch; loading = true; $('highlightMessage').textContent = 'Loading weekly picks…'; $('highlightSave').disabled = true;
  try {
    const result = await api.request('/admin/highlights'); if (version !== epoch) return;
    saved = result; items = result.items.map(({ gameId, pinned }) => ({ gameId, pinned })); excluded = [...result.excluded];
    $('highlightEdition').textContent = result.week ? `Week of ${dateLabel(result.week + 'T12:00:00Z')} · Santiago time` : 'Create the first weekly selection';
    $('highlightMessage').textContent = ''; $('highlightReload').hidden = true;
  } catch (error) { if (version === epoch) { $('highlightMessage').textContent = error.message; $('highlightReload').hidden = false; } }
  finally { if (version === epoch) { loading = false; paint(); } }
}
export function initHighlights(hooks) {
  api = hooks;
  $('highlightSearch').addEventListener('input', search);
  $('highlightReload').addEventListener('click', loadHighlightsAdmin);
  $('highlightSlots').addEventListener('change', event => { if (event.target.matches('[data-pin]')) { items[Number(event.target.dataset.pin)].pinned = event.target.checked; $('highlightCount').textContent = `${items.length} of 5 picks · ${items.filter(item => item.pinned).length} kept for next week`; } });
  $('highlightsPanel').addEventListener('click', event => {
    if (loading) return;
    const move = event.target.closest('[data-move]'), drop = event.target.closest('[data-drop]'), add = event.target.closest('[data-add-highlight]'), allow = event.target.closest('[data-allow]');
    if (move) { const from = Number(move.dataset.move), to = from + Number(move.dataset.direction); if (to < 0 || to >= items.length) return; [items[from], items[to]] = [items[to], items[from]]; paint(); $('highlightSlots').querySelector(`[data-move="${to}"][data-direction="${move.dataset.direction}"]`)?.focus(); }
    if (drop) { const [removed] = items.splice(Number(drop.dataset.drop), 1); if (!excluded.includes(removed.gameId)) excluded.push(removed.gameId); paint(); $('highlightSearch').focus(); }
    if (add && items.length < 5) { const gameId = add.dataset.addHighlight; if (items.some(item => item.gameId === gameId)) return; items.push({ gameId, pinned: false }); excluded = excluded.filter(id => id !== gameId); $('highlightSearch').value = ''; paint(); $('highlightSearch').focus(); }
    if (allow) { excluded = excluded.filter(id => id !== allow.dataset.allow); paint(); }
  });
  $('highlightsForm').addEventListener('submit', async event => {
    event.preventDefault(); if (loading || items.length !== 5 || !saved) return;
    const version = epoch; loading = true; $('highlightSave').disabled = true; $('highlightMessage').textContent = 'Saving weekly highlights…';
    try {
      const value = await api.request('/admin/highlights', { method: 'PUT', body: { revision: saved.revision, items, excluded } }); if (version !== epoch) return;
      saved = value; $('highlightMessage').textContent = 'Saved. The five highlights are now on the home page.'; $('highlightReload').hidden = true;
    } catch (error) { if (version === epoch) { $('highlightMessage').textContent = error.message; $('highlightReload').hidden = false; } }
    finally { if (version === epoch) { loading = false; paint(); } }
  });
}
