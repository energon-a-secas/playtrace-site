import { state } from './state.js';
import { categoryChoices, categoryLabel, sourceHeadline, sourceOnlySummary, projectPlatforms, selectGames, collectionPulse, label, dateLabel, money } from './collection.js';
import { CONFIG } from './config.js';
import { $, escHtml as e } from './utils.js';
import { icon, playLink } from './icons.js';
import { syncMakers } from './maker-combobox.js';

const arrow = '<span aria-hidden="true">↗</span>';
const genre = id => categoryLabel(id, state.catalog);
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
let platformCounts = new Map(), platformSelection;
export function render() {
  if (optionsGames !== state.games) {
    optionsGames = state.games;
    $('categorySelect').innerHTML = '<option value="all">All genres</option>' + categoryChoices(state.catalog).filter(category => state.games.some(game => game.category === category.id) || category.id===state.category).map(category => `<option value="${e(category.id)}">${e(category.label)}</option>`).join('');
    platformCounts = new Map();
    for (const game of state.games) { const id = game.distribution?.id || 'unlisted'; platformCounts.set(id, (platformCounts.get(id) || 0) + 1); }
    platformSelection = undefined;
  }
  if (platformSelection !== state.platform) {
    platformSelection = state.platform;
    $('platformSelect').innerHTML = '<option value="all">All platforms</option>' + projectPlatforms
      .filter(platform => platformCounts.has(platform.id) || platform.id === state.platform)
      .map(platform => `<option value="${platform.id}">${e(platform.label)} (${platformCounts.get(platform.id) || 0})</option>`).join('');
  }
  if ($('searchInput').value !== state.query) $('searchInput').value = state.query;
  $('categorySelect').value = state.category; $('platformSelect').value = state.platform; $('sortSelect').value = state.sort; syncMakers(state.games, state.author);
  document.querySelectorAll('button[data-view]').forEach(button => button.setAttribute('aria-pressed', String(button.dataset.view === state.view)));
  document.querySelectorAll('[data-stage], [data-stage-target]').forEach(button => button.setAttribute('aria-pressed', String((button.dataset.stage || button.dataset.stageTarget) === state.stage)));
  const filtered = Boolean(state.query.trim() || state.category !== 'all' || state.platform !== 'all' || state.stage !== 'all' || state.author || state.following);
  $('clearFilters').disabled = !filtered;
  const loading = state.status === 'loading';
  $('collectionResults').setAttribute('aria-busy', String(loading));
  $('collectionLoading').hidden = state.loaded || !loading;
  $('collectionError').hidden = state.status !== 'error';
  $('collectionErrorText').textContent = state.status !== 'error' ? '' : state.catalogSnapshot
    ? `Browsing a saved collection from ${dateLabel(state.catalog.snapshotAt)}. Live feedback and account updates are temporarily unavailable.` : state.catalogPartial
    ? 'Older projects could not be loaded. Search and filters currently cover the loaded projects. Retry to load the full collection.'
    : state.loaded ? 'Could not refresh. The last loaded collection is still here.' : 'The collection could not be loaded. Please try again.';
  const games = selectGames(state.games, state);
  const filters = JSON.stringify([state.query, state.category, state.platform, state.stage, state.author, state.following, state.sort]);
  if (filters !== filterVersion) { filterVersion = filters; state.visibleLimit = 60; }
  const visible = games.slice(0, state.visibleLimit || 60);
  $('resultCount').textContent = !state.loaded ? loading ? 'Loading collection…' : 'Collection unavailable'
    : state.catalogPartial ? `${games.length} matches · ${state.games.length} of ${state.catalogTotal} projects loaded${loading ? ' · Loading older projects…' : ''}`
      : `${games.length} of ${state.games.length} projects${loading ? ' · Refreshing…' : ''}`;
  const list = $('itemList'); list.hidden = !state.loaded || !games.length; list.dataset.view = state.view;
  // Background pages must not replace unchanged cards and steal keyboard focus.
  // Full records still invalidate same-ID edits, even at the same timestamp.
  const nextList = JSON.stringify([visible, state.isAdmin, state.follows]);
  if (nextList !== listVersion) { listVersion = nextList; list.innerHTML = visible.map(card).join(''); }
  $('collectionMore').hidden = visible.length >= games.length;
  $('collectionShown').textContent = `Showing ${visible.length} of ${games.length} matching projects`;
  $('showMoreGames').textContent = `Show ${Math.min(60, games.length - visible.length)} more projects`;
  $('collectionEmpty').hidden = !state.loaded || Boolean(games.length);
  $('emptyTitle').textContent = state.following ? 'Your next find is waiting' : 'No projects match this view';
  $('emptyDescription').textContent = state.following ? 'Tap the star on a game to save it here.' : 'Try another genre, maker or search. The whole collection is one reset away.';
  if (state.catalogPartial && !state.following) {
    $('emptyTitle').textContent = 'No matches in the projects loaded so far';
    $('emptyDescription').textContent = loading ? 'Older projects are still loading. Results will update as they arrive.' : 'Retry loading the archive to search all projects.';
  }
  $('emptyReset').hidden = !filtered;
  $('authorContext').hidden = !state.author;
  $('authorContext').textContent = state.author ? `Following the work of u/${state.author}. Each project keeps its own source timeline.` : '';
  $('followingFilter').setAttribute('aria-pressed', String(state.following));
  $('followingCount').hidden = !state.follows.length; $('followingCount').textContent = String(state.follows.length);
  if (state.loaded) renderOverview();
  if ($('profileSignIn')) { $('profileSignIn').hidden = state.signedIn || CONFIG.accountsReady !== true; $('profileStatus').textContent = state.accountError || `${state.follows.length} favorites saved${state.signedIn ? '' : ' on this device'}`; }
  renderAccount();
}

function card(game) {
  const headline = sourceHeadline(game);
  const price = game.steam?.type !== 'demo' && game.steam?.state === 'released' && Date.now()-Date.parse(game.steam.checkedAt)<36*3600000 && game.steam.priceCents !== null ? (game.steam.isFree ? 'Free to play' : `${money(game.steam.priceCents)} USD`) : '';
  const availability = playLink(game) + (price ? `<span class="card-price">${e(price)}</span>` : '');
  const latest = [...game.posts].sort((a,b) => b.createdAt.localeCompare(a.createdAt) || b.id.localeCompare(a.id))[0];
  return `<li><article class="collection-item"><div class="collection-item__preview">${image(game)}<span class="preview-label">Explore project ${arrow}</span><button type="button" class="card-favorite favorite-star" data-favorite="${e(game.id)}" aria-label="${state.follows.includes(game.id) ? 'Remove from' : 'Save to'} favorites: ${e(game.title)}" aria-pressed="${state.follows.includes(game.id)}" title="Save to favorites">${icon('star')}</button>${state.isAdmin ? `<button type="button" class="card-edit" data-edit-project="${e(game.id)}" aria-label="Edit project: ${e(game.title)}" title="Edit project">${icon('edit')}<span>Edit</span></button>` : ''}</div>
    <div class="collection-item__body"><div class="game-meta"><button class="genre-chip" type="button" data-category="${e(game.category)}" aria-label="Filter by ${e(genre(game.category))}">${e(genre(game.category))}</button>${stageBadge(game)}</div><h3><button class="card-open" type="button" data-item="${e(game.id)}" aria-label="Explore ${e(game.title)}">${e(game.title)}</button></h3><div class="card-byline"><button class="maker-link" type="button" data-author="${e(game.author.name)}">by u/${e(game.author.name)}</button><time datetime="${e(game.updatedAt)}">${e(dateLabel(game.updatedAt))}</time></div>${headline ? `<p class="project-headline collection-item__headline">${e(headline)}</p>` : ''}${sourceOnlySummary(game) ? '' : `<p class="collection-item__description">${e(game.summary)}</p>`}<p class="card-update">${game.availability?.status === 'broken' ? 'Link needs attention · ' : ''}${game.posts.length > 1 ? `${game.posts.length - 1} ${game.posts.length === 2 ? 'update' : 'updates'}` : 'First post'}</p><div class="collection-item__foot"><div class="card-store">${availability}</div><a class="card-shortcut brand-action" data-brand="reddit" href="${e(latest.url)}" target="_blank" rel="noopener noreferrer" aria-label="Latest Reddit post for ${e(game.title)} (opens in a new tab)" title="Latest Reddit post">${icon('reddit')}</a></div></div></article></li>`;
}

function renderOverview() {
  const pulse = collectionPulse(state.games);
  for (const node of document.querySelectorAll('[data-stage-count]')) node.textContent = String(node.dataset.stageCount === 'all' ? pulse.games : state.games.filter(game => game.stage === node.dataset.stageCount).length);
  for (const node of document.querySelectorAll('[data-stage-bar]')) node.style.width = `${pulse.games ? 100 * state.games.filter(game => game.stage === node.dataset.stageBar).length / pulse.games : 0}%`;
  const source = state.catalog.source;
  const history = state.service?.history;
  $('historyStatus').textContent = history?.state === 'ok'
    ? `Available history checked from ${dateLabel(history.communityCreatedAt)}. Newest updates appear first.`
    : history?.scannedThrough ? `History checked from ${dateLabel(history.communityCreatedAt)} through ${dateLabel(history.scannedThrough)}. Historical projects are being added alongside new updates.`
      : 'Newest updates first. Collecting the community’s history from December 2022.';
  const stamp = `${source.mode === 'scheduled' && source.lastSuccessfulIngestAt ? 'Archive refreshed' : 'Archive snapshot'} ${dateLabel(source.retrievedAt)} · ${pulse.posts} source posts`;
  $('collectionProvenance').textContent = state.catalogSnapshot ? `Saved collection · ${dateLabel(state.catalog.snapshotAt)} · ${pulse.posts} source posts` : stamp;
  $('sourceDetails').textContent = `Retrieved ${new Date(source.retrievedAt).toLocaleString('en-US', { timeZone: 'UTC' })} UTC. ${source.coverageThrough ? `Latest included source date: ${dateLabel(source.coverageThrough)}.` : 'Archive coverage is not yet confirmed.'}`;
  const removalUrl = new URL(CONFIG.removalContact || 'https://balise.neorgon.com/report/');
  if (removalUrl.hostname === 'balise.neorgon.com') {
    removalUrl.pathname = '/report/'; removalUrl.hash = encodeURIComponent(JSON.stringify({ v: 1, site: 'playtrace-site', url: location.href, target: null }));
  }
  $('removalLink').href = removalUrl.href;

}

export function renderDetail(game) {
  state.detail = game; state.detailSignals = null; state.detailSignalError = '';
  $('itemDialogTitle').textContent = game.title;
  $('itemDialogHeadline').textContent = sourceHeadline(game);
  $('itemDialogHeadline').hidden = !sourceHeadline(game);
  $('projectRepository').hidden = !game.repositoryUrl;
  if (game.repositoryUrl) $('projectRepository').href = game.repositoryUrl; else $('projectRepository').removeAttribute('href');
  $('itemDialogMedia').innerHTML = image(game);
  $('itemDialogCategory').textContent = `${genre(game.category)} · ${label(game.stage)}${game.reviewStatus === 'source-described' ? ' · Source-described' : ''}`;
  $('itemDialogAuthor').innerHTML = `Shared by <button class="text-button" type="button" data-author="${e(game.author.name)}">u/${e(game.author.name)}</button>`;
  $('itemDialogDescription').textContent = game.summary;
  $('itemDialogDescription').hidden = Boolean(sourceHeadline(game)) && sourceOnlySummary(game);
  $('itemDialogFacts').innerHTML = `<div><dt>First shared</dt><dd>${e(dateLabel(game.firstSeenAt))}</dd></div><div><dt>Latest update</dt><dd>${e(dateLabel(game.updatedAt))}</dd></div>${game.distribution ? `<div><dt>Project platform</dt><dd>${sourceLink(game.distribution.url, game.distribution.label)}</dd></div>` : ''}${game.platforms.length ? `<div><dt>Runs on</dt><dd>${e(game.platforms.join(', '))}</dd></div>` : ''}`;
  $('itemDialogTags').innerHTML = (game.distribution ? `<li class="platform-badge">${icon(game.distribution.id)}${e(game.distribution.label)}</li>` : '') + game.tags.map(tag => `<li>${e(tag)}</li>`).join('');
  $('itemDialogLinks').innerHTML = playLink(game);
  $('projectSource').href = [...game.posts].sort((a,b)=>b.createdAt.localeCompare(a.createdAt))[0].url;
  $('projectSource').dataset.brand = 'reddit'; $('projectSource').classList.add('brand-action');
  $('projectSource').innerHTML = `${icon('reddit')}<span class="project-icon__label" aria-hidden="true">Latest Reddit post</span>`;
  $('projectResearch').href = `research.html?game=${game.id}`;
  $('inlineProjectEditor').hidden = true; $('quickImagePanel').hidden = true; $('fullImageEditor').href = `admin.html?game=${game.id}#projectImageTitle`;
  $('editThumbnail').hidden = !state.isAdmin; $('editProject').hidden = !state.isAdmin; if (!state.isAdmin) $('inlineProjectEditor').hidden = true;
  $('projectSource').setAttribute('aria-label', `${game.preview.kind === 'video' ? 'Watch original post on Reddit' : 'Original post'} (opens in a new tab)`);
  $('gameTimeline').innerHTML = game.posts.map(post => `<li><div class="timeline__date"><time datetime="${e(post.createdAt)}">${e(dateLabel(post.createdAt))}</time><span>${e(label(post.kind))}</span></div><h4>${sourceLink(post.url, post.title)}</h4><p>${e(post.excerpt)}</p></li>`).join('');
  $('itemDialogSource').textContent = `${game.preview.storage === 'r2' ? 'Preview stored with permission recorded.' : 'Preview hosted at its original source.'} Listing does not imply creator verification or an offer for sale.`;
  $('timelineCount').textContent = `${game.posts.length} source ${game.posts.length === 1 ? 'post' : 'posts'}`;
  renderAccount();
}

export function renderAccount() {
  const accountsReady = CONFIG.accountsReady === true;
  const following = state.follows.includes(state.detail?.id);
  $('followGame').setAttribute('aria-label', following ? 'Remove from favorites' : 'Save to favorites');
  $('followGame').querySelector('.project-icon__label').textContent = following ? 'Saved' : 'Favorite';
  $('editThumbnail').hidden = !state.isAdmin; $('editProject').hidden = !state.isAdmin; if (!state.isAdmin) $('inlineProjectEditor').hidden = true;
  $('followGame').disabled = false;
  $('followGame').setAttribute('aria-pressed', String(following));
  $('followGame').hidden = false;
  $('followingFilter').disabled = false;
  $('followingFilter').title = 'Show favorite games';
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
