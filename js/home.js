import { request } from './api.js';
import { validateCatalog } from './collection.js';
import { CONFIG } from './config.js';
import { NeoAuth } from './neorgon-auth.js';

// Preserve every previously shared project/filter URL when moving the collection.
const current = new URL(location.href);
if (['game','q','cat','platform','stage','maker','author','following','view','sort'].some(key => current.searchParams.has(key)) || current.hash === '#discover') {
  current.pathname = current.pathname.replace(/(?:index\.html)?$/, 'browse.html'); location.replace(current.href);
} else {
  NeoAuth.start();
  try {
    const catalog = validateCatalog(await request('/catalog?pageSize=200'));
    const game = catalog.games.find(entry => entry.id === CONFIG.featuredGameId);
    if (game) {
      document.getElementById('homeFeatureTitle').textContent = game.title;
      document.getElementById('homeFeatureMaker').textContent = `Shared by u/${game.author.name}`;
      document.getElementById('homeFeature').href = `browse.html?game=${game.id}`;
      const url = game.preview.posterUrl || (game.preview.kind === 'image' ? game.preview.url : null);
      if (url) { const image = new Image(); image.src = url; image.alt = game.preview.alt; image.fetchPriority = 'high'; image.decoding = 'async'; document.getElementById('homeArtwork').append(image); }
    }
  } catch { /* The static destinations remain useful if the catalogue is offline. */ }
}
