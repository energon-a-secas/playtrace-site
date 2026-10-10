import { state } from './state.js';
import { categories, selectGames, collectionPulse, label, dateLabel, money } from './collection.js';
import { CONFIG } from './config.js';
import { $, escHtml as e } from './utils.js';

const arrow = '<span aria-hidden="true">↗</span>';
const stageBadge = game => `<span class="stage-badge stage-badge--${e(game.stage)}"><span class="status-dot" aria-hidden="true"></span>${e(label(game.stage))}</span>`;
const sourceLink = (url, text, className = 'text-link') => `<a class="${className}" href="${e(url)}" target="_blank" rel="noopener noreferrer">${e(text)} ${arrow}<span class="sr-only"> (opens in a new tab)</span></a>`;

function image(game, priority = false) {
  const url = game.preview.posterUrl || (game.preview.kind === 'image' ? game.preview.url : null);
  return `<div class="game-image${url ? '' : ' game-image--missing'}" data-preview-kind="${e(game.preview.kind)}">${url ? `<img src="${e(url)}" alt="${e(game.preview.alt || game.title)}" width="640" height="400" ${priority ? 'fetchpriority="high"' : 'loading="lazy"'} decoding="async" referrerpolicy="no-referrer">` : ''}<span class="image-fallback">Preview on the original post ${arrow}</span></div>`;
}

let optionsGames;
let featureGames;
let listGames;
let listVersion = '';
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
  $('collectionErrorText').textContent = state.status !== 'error' ? '' : state.loaded ? 'Could not refresh. The last loaded collection is still here.' : 'The collection could not be loaded. Please try again.';
  const games = selectGames(state.games, state);
  $('resultCount').textContent = !state.loaded ? loading ? 'Loading collection…' : 'Collection unavailable' : `${games.length} of ${state.games.length} projects${loading ? ' · Refreshing…' : ''}`;
  const list = $('itemList'); list.hidden = !state.loaded || !games.length; list.dataset.view = state.view;
  const nextList = games.map(game => game.id).join(',');
  if (listGames !== state.games || nextList !== listVersion) { listGames = state.games; listVersion = nextList; list.innerHTML = games.map(card).join(''); }
  $('collectionEmpty').hidden = !state.loaded || Boolean(games.length);
  $('emptyTitle').textContent = state.following ? state.signedIn ? 'Your next find is waiting' : 'Your following list lives with your account' : 'No projects match this view';
  $('emptyDescription').textContent = state.following ? state.signedIn ? 'Follow a game to collect its progress here. New source posts stay together on its timeline.' : 'Sign in with the account you use to follow games, or explore the public collection.' : 'Try another genre, maker or search. The whole collection is one reset away.';
  if (state.following && CONFIG.accountsReady !== true) {
    $('emptyTitle').textContent = 'Following is not available yet';
    $('emptyDescription').textContent = 'Reset this filter to explore the public collection.';
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
    <div class="collection-item__body"><div class="game-meta"><span>${e(label(game.category))}</span>${stageBadge(game)}</div><h3><button type="button" data-item="${e(game.id)}">${e(game.title)}</button></h3><button class="maker-link" type="button" data-author="${e(game.author.name)}">by u/${e(game.author.name)}</button><p class="collection-item__description">${e(game.summary)}</p><div class="collection-item__foot"><time datetime="${e(game.updatedAt)}">${e(dateLabel(game.updatedAt))}</time><button class="text-button" type="button" data-item="${e(game.id)}">${game.posts.length > 1 ? `${game.posts.length} source posts` : 'Project notes'} ${arrow}</button></div>${game.reviewStatus === 'source-described' ? '<span class="review-label">Source-described</span>' : ''}</div></article></li>`;
}

function renderOverview() {
  const pulse = collectionPulse(state.games);
  $('snapshotCount').textContent = `${pulse.games} projects · ${pulse.authors} makers`;
  const concepts = state.games.filter(game => game.stage === 'concept').length;
  const unspecified = state.games.filter(game => game.stage === 'unknown').length;
  const snapshotNote = $('snapshotCount').nextElementSibling;
  snapshotNote.textContent = [concepts ? `${concepts} ${concepts === 1 ? 'concept' : 'concepts'}` : '', unspecified ? `${unspecified} unspecified stages` : ''].filter(Boolean).join(' · ') || 'Explore a stage ↑';
  for (const node of document.querySelectorAll('[data-stage-count]')) node.textContent = String(node.dataset.stageCount === 'all' ? pulse.games : state.games.filter(game => game.stage === node.dataset.stageCount).length);
  for (const node of document.querySelectorAll('[data-stage-bar]')) node.style.width = `${pulse.games ? 100 * state.games.filter(game => game.stage === node.dataset.stageBar).length / pulse.games : 0}%`;
  const source = state.catalog.source;
  const stamp = `${source.mode === 'scheduled' && source.lastSuccessfulIngestAt ? 'Archive refreshed' : 'Archive snapshot'} ${dateLabel(source.retrievedAt)} · ${pulse.posts} source posts`;
  $('collectionProvenance').textContent = stamp;
  $('sourceDetails').textContent = `Retrieved ${new Date(source.retrievedAt).toLocaleString('en-US', { timeZone: 'UTC' })} UTC. ${source.coverageThrough ? `Latest included source date: ${dateLabel(source.coverageThrough)}.` : 'Archive coverage is not yet confirmed.'}`;
  const removalUrl = new URL(CONFIG.removalContact || 'https://balise.neorgon.com/report/');
  if (removalUrl.hostname === 'balise.neorgon.com') {
    removalUrl.pathname = '/report/'; removalUrl.hash = encodeURIComponent(JSON.stringify({ v: 1, site: 'playtrace-site', url: location.href, target: null }));
  }
  $('removalLink').href = removalUrl.href;
  document.querySelector('.collection-notes__fine').textContent = 'An archive snapshot, with original source dates. Collection can lag behind Reddit. Stages reflect the maker’s post; availability may change. Previews belong to their creators.';
  if (featureGames === state.games) return;
  featureGames = state.games;
  const featured = [...state.games].sort((a, b) => b.posts.length - a.posts.length).find(game => game.preview.posterUrl || game.preview.kind === 'image') || state.games[0];
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
  $('itemDialogSource').textContent = `${game.preview.storage === 'r2' ? 'Preview stored with creator permission.' : 'Preview hosted at its original source.'} Listing does not imply creator verification or an offer for sale.`;
  const own = state.prices.find(price => price.gameId === game.id);
  $('priceAmount').value = own ? (own.amountCents / 100).toFixed(2) : '';
  $('priceAmount').removeAttribute('aria-invalid'); $('priceMessage').textContent = '';
  renderAccount(); renderSignals();
}

export function renderAccount() {
  if (!$('submitPrice')) return;
  const accountsReady = CONFIG.accountsReady === true;
  const mode = state.service?.signalProtection;
  const signals = accountsReady && state.service?.capabilities?.signals && (mode === 'account-rate-limit' || (mode === 'turnstile' && CONFIG.turnstileSiteKey));
  const own = accountsReady && state.prices.find(price => price.gameId === state.detail?.id);
  const following = accountsReady && state.follows.includes(state.detail?.id);
  $('followGame').textContent = following ? 'Following this game ✓' : 'Follow this game';
  $('followGame').disabled = !accountsReady || state.accountBusy || !state.service?.capabilities?.following;
  $('followGame').setAttribute('aria-pressed', String(following));
  $('followingFilter').disabled = !accountsReady || !state.service?.capabilities?.following;
  $('followingFilter').title = accountsReady ? 'Show followed games' : 'Following is not available yet.';
  $('submitPrice').disabled = state.accountBusy || !signals;
  $('submitPrice').textContent = !accountsReady ? 'Price responses unavailable' : state.accountBusy ? 'Please wait…' : own ? 'Update your price' : state.signedIn ? 'Share your price' : 'Sign in to share your price';
  $('priceAmount').disabled = state.accountBusy || !signals;
  $('withdrawPrice').hidden = !own; $('withdrawPrice').disabled = !accountsReady || state.accountBusy;
  $('accountAvailability').textContent = !accountsReady ? 'Following and price responses are not available yet. You can still explore games and public price signals.' : signals ? mode === 'account-rate-limit' ? 'Signed-in accounts, one estimate each.' : 'Signed-in accounts, with a bot challenge for submissions.' : state.serviceError || 'Price responses are temporarily unavailable. You can still explore the project.';
  $('deleteMyData').disabled = !accountsReady || state.accountBusy || !state.service?.capabilities?.following;
  $('confirmDelete').disabled = !accountsReady || state.accountBusy;
  if (!accountsReady) { $('deleteConfirm').hidden = true; $('privacyMessage').textContent = 'Account features are not available yet.'; }
}

export function renderSignals() {
  const summary = state.detailSignals;
  $('retrySignals').hidden = !state.detailSignalError || !state.service?.capabilities?.signals;
  if (state.detailSignalError) { $('priceSignals').textContent = state.detailSignalError; return; }
  if (!summary) { $('priceSignals').textContent = 'Loading price signals…'; return; }
  if (summary.state === 'insufficient') { $('priceSignals').innerHTML = '<p>A distribution appears after five accounts respond. Individual estimates stay private.</p>'; return; }
  const buckets = summary.buckets.filter(bucket => Number.isInteger(bucket.count) && bucket.count >= 0 && Number.isInteger(bucket.minCents) && Number.isInteger(bucket.maxCents));
  if (buckets.length !== 5 || buckets.reduce((sum, bucket) => sum + bucket.count, 0) !== summary.count) { $('priceSignals').textContent = 'Price signals could not be read. Please try again.'; return; }
  $('priceSignals').innerHTML = `<p class="signal-summary"><strong>${e(money(summary.medianCents))}</strong> median · ${summary.count} accounts</p><ul class="histogram" aria-label="Willingness to pay in USD">${buckets.map(bucket => `<li><span>${bucket.maxCents === 0 ? '$0' : `${money(bucket.minCents)}–${money(bucket.maxCents)}`}</span><meter min="0" max="${summary.count}" value="${bucket.count}" aria-label="${e(money(bucket.minCents))} to ${e(money(bucket.maxCents))}: ${bucket.count} accounts"></meter><span>${bucket.count}</span></li>`).join('')}</ul><p class="field__hint">Nonbinding research, not sales or purchase commitments.</p>`;
}
