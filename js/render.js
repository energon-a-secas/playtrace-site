import { state } from './state.js';
import { categories, selectGames, collectionPulse, label, dateLabel, money } from './collection.js';
import { CONFIG } from './config.js';
import { $, escHtml as e } from './utils.js';
import { storeLabel } from './project.js';

const arrow = '<span aria-hidden="true">↗</span>';
const stageBadge = game => `<span class="stage-badge stage-badge--${e(game.stage)}"><span class="status-dot" aria-hidden="true"></span>${e(label(game.stage))}</span>`;
const sourceLink = (url, text, className = 'text-link') => `<a class="${className}" href="${e(url)}" target="_blank" rel="noopener noreferrer">${e(text)} ${arrow}<span class="sr-only"> (opens in a new tab)</span></a>`;

function image(game, priority = false) {
  const url = game.preview.posterUrl || (game.preview.kind === 'image' ? game.preview.url : null);
  return `<div class="game-image${url ? '' : ' game-image--missing'}" data-preview-kind="${e(game.preview.kind)}">${url ? `<img src="${e(url)}" alt="${e(game.preview.alt || game.title)}" width="640" height="400" ${priority ? 'fetchpriority="high"' : 'loading="lazy"'} decoding="async" referrerpolicy="no-referrer">` : ''}<span class="image-fallback">Preview on the original post ${arrow}</span></div>`;
}

let optionsGames;
let featureVersion = '';
let listVersion = '';
let filterVersion = '';
export function render() {
  if (optionsGames !== state.games) {
    optionsGames = state.games;
    $('categorySelect').innerHTML = '<option value="all">All genres</option>' + categories.filter(category => state.games.some(game => game.category === category)).map(category => `<option value="${category}">${e(label(category))}</option>`).join('');
    const authors = [...new Set(state.games.map(game => game.author.name))].sort((a, b) => a.localeCompare(b));
    if (state.author && !authors.includes(state.author)) authors.push(state.author);
    $('authorSelect').innerHTML = '<option value="">All makers</option>' + authors.map(author => `<option value="${e(author)}">u/${e(author)}</option>`).join('');
  }
  if ($('searchInput').value !== state.query) $('searchInput').value = state.query;
  $('categorySelect').value = state.category; $('sortSelect').value = state.sort; $('authorSelect').value = state.author;
  document.querySelectorAll('button[data-view]').forEach(button => button.setAttribute('aria-pressed', String(button.dataset.view === state.view)));
  document.querySelectorAll('[data-stage], [data-stage-target]').forEach(button => button.setAttribute('aria-pressed', String((button.dataset.stage || button.dataset.stageTarget) === state.stage)));
  const filtered = Boolean(state.query.trim() || state.category !== 'all' || state.stage !== 'all' || state.author || state.following);
  $('clearFilters').disabled = !filtered;
  const loading = state.status === 'loading';
  $('featuredGame').closest('.feature-grid').hidden = (!state.loaded && state.status === 'error') || (state.loaded && !state.games.length);
  $('featuredGame').setAttribute('aria-busy', String(!state.loaded && loading));
  $('collectionResults').setAttribute('aria-busy', String(loading)); $('refreshCollection').disabled = loading;
  $('collectionLoading').hidden = state.loaded || !loading;
  $('collectionError').hidden = state.status !== 'error';
  $('collectionErrorText').textContent = state.status !== 'error' ? '' : state.catalogPartial
    ? 'Older projects could not be loaded. Search and filters currently cover the loaded projects. Retry to load the full collection.'
    : state.loaded ? 'Could not refresh. The last loaded collection is still here.' : 'The collection could not be loaded. Please try again.';
  const games = selectGames(state.games, state);
  const filters = JSON.stringify([state.query, state.category, state.stage, state.author, state.following, state.sort]);
  if (filters !== filterVersion) { filterVersion = filters; state.visibleLimit = 60; }
  const visible = games.slice(0, state.visibleLimit || 60);
  $('resultCount').textContent = !state.loaded ? loading ? 'Loading collection…' : 'Collection unavailable'
    : state.catalogPartial ? `${games.length} matches · ${state.games.length} of ${state.catalogTotal} projects loaded${loading ? ' · Loading older projects…' : ''}`
      : `${games.length} of ${state.games.length} projects${loading ? ' · Refreshing…' : ''}`;
  const list = $('itemList'); list.hidden = !state.loaded || !games.length; list.dataset.view = state.view;
  // Background pages must not replace unchanged cards and steal keyboard focus.
  // Full records still invalidate same-ID edits, even at the same timestamp.
  const nextList = JSON.stringify(visible);
  if (nextList !== listVersion) { listVersion = nextList; list.innerHTML = visible.map(card).join(''); }
  $('collectionMore').hidden = visible.length >= games.length;
  $('collectionShown').textContent = `Showing ${visible.length} of ${games.length} matching projects`;
  $('showMoreGames').textContent = `Show ${Math.min(60, games.length - visible.length)} more projects`;
  $('collectionEmpty').hidden = !state.loaded || Boolean(games.length);
  $('emptyTitle').textContent = state.following ? state.signedIn ? 'Your next find is waiting' : 'Your following list lives with your account' : 'No projects match this view';
  $('emptyDescription').textContent = state.following ? state.signedIn ? 'Follow a game to collect its progress here. New source posts stay together on its timeline.' : 'Sign in with the account you use to follow games, or explore the public collection.' : 'Try another genre, maker or search. The whole collection is one reset away.';
  if (state.following && CONFIG.accountsReady !== true) {
    $('emptyTitle').textContent = 'Following is not available yet';
    $('emptyDescription').textContent = 'Reset this filter to explore the public collection.';
  }
  if (state.catalogPartial && !state.following) {
    $('emptyTitle').textContent = 'No matches in the projects loaded so far';
    $('emptyDescription').textContent = loading ? 'Older projects are still loading. Results will update as they arrive.' : 'Retry loading the archive to search all projects.';
  }
  $('emptyReset').hidden = !filtered;
  $('authorContext').hidden = !state.author;
  $('authorContext').textContent = state.author ? `Following the work of u/${state.author}. Each project keeps its own source timeline.` : '';
  $('followingFilter').setAttribute('aria-pressed', String(state.following));
  $('followingCount').hidden = !state.signedIn || !state.follows.length; $('followingCount').textContent = String(state.follows.length);
  if (state.loaded) renderOverview();
  renderAccount();
}

function card(game) {
  return `<li><article class="collection-item"><button class="collection-item__preview" type="button" data-item="${e(game.id)}" aria-label="Explore ${e(game.title)}">${image(game)}<span class="preview-label">${game.preview.kind === 'video' ? 'View preview' : 'Explore project'} ${arrow}</span></button>
    <div class="collection-item__body"><div class="game-meta"><span>${e(label(game.category))}</span>${stageBadge(game)}</div><h3><button type="button" data-item="${e(game.id)}">${e(game.title)}</button></h3><button class="maker-link" type="button" data-author="${e(game.author.name)}">by u/${e(game.author.name)}</button><p class="collection-item__description">${e(game.summary)}</p>${game.steam ? `<div class="card-store">${storeLabel(game.steam)}</div>` : ''}<div class="collection-item__foot"><div class="project-date"><time datetime="${e(game.updatedAt)}">${e(dateLabel(game.updatedAt))}</time><span>${game.posts.length > 1 ? `${game.posts.length - 1} ${game.posts.length === 2 ? 'update' : 'updates'}` : 'First post'}</span></div><button class="text-button" type="button" data-item="${e(game.id)}">Feedback &amp; history ${arrow}</button></div>${game.reviewStatus === 'source-described' ? '<span class="review-label">Source-described</span>' : ''}</div></article></li>`;
}

function renderOverview() {
  const pulse = collectionPulse(state.games);
  $('snapshotCount').textContent = `${pulse.games}${state.catalogPartial ? ' loaded' : ''} projects · ${pulse.authors} makers`;
  const concepts = state.games.filter(game => game.stage === 'concept').length;
  const unspecified = state.games.filter(game => game.stage === 'unknown').length;
  const snapshotNote = $('snapshotCount').nextElementSibling;
  snapshotNote.textContent = [concepts ? `${concepts} ${concepts === 1 ? 'concept' : 'concepts'}` : '', unspecified ? `${unspecified} unspecified stages` : ''].filter(Boolean).join(' · ') || 'Explore a stage ↑';
  for (const node of document.querySelectorAll('[data-stage-count]')) node.textContent = String(node.dataset.stageCount === 'all' ? pulse.games : state.games.filter(game => game.stage === node.dataset.stageCount).length);
  for (const node of document.querySelectorAll('[data-stage-bar]')) node.style.width = `${pulse.games ? 100 * state.games.filter(game => game.stage === node.dataset.stageBar).length / pulse.games : 0}%`;
  const source = state.catalog.source;
  const history = state.service?.history;
  $('historyStatus').textContent = history?.state === 'ok'
    ? `Available history checked from ${dateLabel(history.communityCreatedAt)}. Newest updates appear first.`
    : history?.scannedThrough ? `History checked from ${dateLabel(history.communityCreatedAt)} through ${dateLabel(history.scannedThrough)}. Historical projects are being added alongside new updates.`
      : 'Newest updates first. Collecting the community’s history from December 2022.';
  const stamp = `${source.mode === 'scheduled' && source.lastSuccessfulIngestAt ? 'Archive refreshed' : 'Archive snapshot'} ${dateLabel(source.retrievedAt)} · ${pulse.posts} source posts`;
  $('collectionProvenance').textContent = stamp;
  $('sourceDetails').textContent = `Retrieved ${new Date(source.retrievedAt).toLocaleString('en-US', { timeZone: 'UTC' })} UTC. ${source.coverageThrough ? `Latest included source date: ${dateLabel(source.coverageThrough)}.` : 'Archive coverage is not yet confirmed.'}`;
  const removalUrl = new URL(CONFIG.removalContact || 'https://balise.neorgon.com/report/');
  if (removalUrl.hostname === 'balise.neorgon.com') {
    removalUrl.pathname = '/report/'; removalUrl.hash = encodeURIComponent(JSON.stringify({ v: 1, site: 'playtrace-site', url: location.href, target: null }));
  }
  $('removalLink').href = removalUrl.href;
  const featured = [...state.games].sort((a, b) => b.posts.length - a.posts.length).find(game => game.preview.posterUrl || game.preview.kind === 'image') || state.games[0];
  const nextFeature = JSON.stringify(featured || null);
  if (featureVersion === nextFeature) return;
  featureVersion = nextFeature;
  $('featuredGame').classList.remove('spotlight--loading'); $('featuredGame').setAttribute('aria-busy', 'false');
  if (!featured) { $('featuredGame').hidden = true; $('featuredGame').innerHTML = ''; return; }
  $('featuredGame').hidden = false;
  $('featuredGame').innerHTML = `${image(featured, true)}<div class="spotlight__shade"></div><div class="spotlight__top"><span class="spotlight__label">IN FOCUS</span>${stageBadge(featured)}</div><div class="spotlight__body"><p class="eyebrow">${e(label(featured.category))} · ${featured.posts.length} SOURCE ${featured.posts.length === 1 ? 'POST' : 'POSTS'}</p><h3>${e(featured.title)}</h3><p>${e(featured.summary)}</p><div class="spotlight__foot"><span>by u/${e(featured.author.name)}</span><button class="btn btn--primary" type="button" data-item="${e(featured.id)}">Follow the story ${arrow}</button></div></div>`;
}

export function renderDetail(game) {
  state.detail = game; state.detailSignals = null; state.detailSignalError = '';
  $('itemDialogTitle').textContent = game.title;
  $('itemDialogMedia').innerHTML = image(game);
  $('itemDialogCategory').textContent = `${label(game.category)} · ${label(game.stage)}${game.reviewStatus === 'source-described' ? ' · Source-described' : ''}`;
  $('itemDialogAuthor').innerHTML = `Shared by <button class="text-button" type="button" data-author="${e(game.author.name)}">u/${e(game.author.name)}</button>`;
  $('itemDialogDescription').textContent = game.summary;
  $('itemDialogFacts').innerHTML = `<div><dt>First shared</dt><dd>${e(dateLabel(game.firstSeenAt))}</dd></div><div><dt>Latest update</dt><dd>${e(dateLabel(game.updatedAt))}</dd></div>${game.platforms.length ? `<div><dt>Platform</dt><dd>${e(game.platforms.join(', '))}</dd></div>` : ''}`;
  $('itemDialogTags').innerHTML = game.tags.map(tag => `<li>${e(tag)}</li>`).join('');
  $('itemDialogLinks').innerHTML = (game.projectUrl ? sourceLink(game.projectUrl, 'Visit game page', 'btn btn--primary') : '') + sourceLink(game.posts[0].url, game.preview.kind === 'video' ? 'Watch on Reddit' : 'Original post', 'btn btn--secondary') + '<button type="button" class="text-button" id="shareGame">Copy project link</button>';
  $('gameTimeline').innerHTML = game.posts.map(post => `<li><div class="timeline__date"><time datetime="${e(post.createdAt)}">${e(dateLabel(post.createdAt))}</time><span>${e(label(post.kind))}</span></div><h4>${sourceLink(post.url, post.title)}</h4><p>${e(post.excerpt)}</p></li>`).join('');
  $('itemDialogSource').textContent = `${game.preview.storage === 'r2' ? 'Preview stored with permission recorded.' : 'Preview hosted at its original source.'} Listing does not imply creator verification or an offer for sale.`;
  $('timelineCount').textContent = `${game.posts.length} source ${game.posts.length === 1 ? 'post' : 'posts'}`;
  renderAccount();
}

export function renderAccount() {
  const accountsReady = CONFIG.accountsReady === true;
  const following = accountsReady && state.follows.includes(state.detail?.id);
  $('followGame').textContent = following ? 'Following this game ✓' : 'Follow this game';
  $('followGame').disabled = !accountsReady || state.accountBusy || !state.service?.capabilities?.following;
  $('followGame').setAttribute('aria-pressed', String(following));
  $('followGame').hidden = !accountsReady;
  $('followHint').hidden = !accountsReady;
  $('followingFilter').disabled = !accountsReady || !state.service?.capabilities?.following;
  $('followingFilter').title = accountsReady ? 'Show followed games' : 'Following is not available yet.';
  $('deleteMyData').disabled = !accountsReady || state.accountBusy || !state.service?.capabilities?.following;
  $('confirmDelete').disabled = !accountsReady || state.accountBusy;
  if (!accountsReady) { $('deleteConfirm').hidden = true; $('privacyMessage').textContent = 'Account features are not available yet.'; }
}

export function renderSignals() {
  if (!$('priceSignals')) return;
  const summary = state.detailSignals;
  $('retrySignals').hidden = !state.detailSignalError || !state.service?.capabilities?.signals;
  if (state.detailSignalError) { $('priceSignals').textContent = state.detailSignalError; return; }
  if (!summary) { $('priceSignals').textContent = 'Loading price signals…'; return; }
  if (summary.state === 'insufficient') { $('priceSignals').innerHTML = '<p>A distribution appears after five accounts respond. Individual estimates stay private.</p>'; return; }
  const buckets = summary.buckets.filter(bucket => Number.isInteger(bucket.count) && bucket.count >= 0 && Number.isInteger(bucket.minCents) && Number.isInteger(bucket.maxCents));
  if (buckets.length !== 5 || buckets.reduce((sum, bucket) => sum + bucket.count, 0) !== summary.count) { $('priceSignals').textContent = 'Price signals could not be read. Please try again.'; return; }
  $('priceSignals').innerHTML = `<p class="signal-summary"><strong>${e(money(summary.medianCents))}</strong> median · ${summary.count} accounts</p><ul class="histogram" aria-label="Willingness to pay in USD">${buckets.map(bucket => `<li><span>${bucket.maxCents === 0 ? '$0' : `${money(bucket.minCents)}–${money(bucket.maxCents)}`}</span><meter min="0" max="${summary.count}" value="${bucket.count}" aria-label="${e(money(bucket.minCents))} to ${e(money(bucket.maxCents))}: ${bucket.count} accounts"></meter><span>${bucket.count}</span></li>`).join('')}</ul><p class="field__hint">Nonbinding research, not sales or purchase commitments.</p>`;
}
