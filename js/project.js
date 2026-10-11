import { request } from './api.js';
import { state } from './state.js';
import { editKey } from './guest-key.js';
import { money, dateLabel, safeUrl, validateSteam } from './collection.js';
import { $, escHtml as e } from './utils.js';

let generation = 0, controller, pending = false, projectId = '', mediaVersion = '';
const fresh = steam => Date.now() - Date.parse(steam.checkedAt) < 36 * 3600000;
export function storeLabel(steam) {
  if (!steam) return '';
  const stateLabel = steam.state === 'released' ? 'Released on Steam' : steam.state === 'coming-soon' ? 'Coming to Steam' : 'On Steam';
  const price = fresh(steam) && steam.priceCents !== null ? steam.isFree ? 'Free to play' : `${money(steam.priceCents)} USD` : '';
  return `<span class="store-badge">${e(stateLabel)}</span>${price ? `<span class="store-price">${e(price)}</span>` : ''}`;
}
function renderStore(game) {
  $('itemDialogStore').innerHTML = game.steam ? `<div class="store-summary">${storeLabel(game.steam)}<small>${fresh(game.steam) ? 'US store' : 'Price needs a refresh'} · checked ${e(dateLabel(game.steam.checkedAt))}</small></div>` : '';
}
function mediaFor(game) {
  const seen = new Set();
  return game.posts.flatMap(post => (post.assets || []).map(asset => ({ ...asset, post }))).filter(asset => {
    if (seen.has(asset.url)) return false; seen.add(asset.url); return true;
  }).slice(0, 12);
}
function renderMedia(game) {
  const assets = mediaFor(game);
  const version = JSON.stringify([game.id, game.preview.kind, assets]);
  if (version === mediaVersion) return;
  mediaVersion = version;
  const target = $('projectMedia'); target.hidden = !assets.length && game.preview.kind !== 'video';
  target.innerHTML = assets.length ? `<details><summary>Clips &amp; screenshots <span>${assets.length}</span></summary><ul class="media-gallery">${assets.map((asset, index) => `<li>
    <div class="media-player" data-player="${index}">${asset.kind === 'image' ? `<img src="${e(asset.url)}" alt="Screenshot from ${e(asset.post.title)}" loading="lazy" decoding="async" referrerpolicy="no-referrer">` : `<button type="button" class="media-play" data-play-asset="${index}">${asset.posterUrl ? `<img src="${e(asset.posterUrl)}" alt="" loading="lazy" referrerpolicy="no-referrer">` : ''}<span>▶ ${asset.kind === 'gif' ? 'Play GIF' : 'Play clip'}</span></button>`}</div>
    <a href="${e(asset.post.url)}" class="text-link" target="_blank" rel="noopener noreferrer">Original post · ${e(dateLabel(asset.post.createdAt))} ↗</a>
    ${asset.kind === 'video' ? '<p class="field__hint">Source preview; audio may be unavailable.</p>' : ''}</li>`).join('')}</ul></details>`
    : `<a class="text-link" href="${e(game.preview.sourceUrl)}" target="_blank" rel="noopener noreferrer">Watch the original video on Reddit ↗</a>`;
}
export function prepareProject(game) {
  const changed = projectId !== game.id;
  if (changed) {
    projectId = game.id; generation++;
    controller?.abort(); controller = new AbortController(); pending = false;
    $('changeRequestPanel').hidden = true; $('changeRequestForm').hidden = false;
    $('requestChange').setAttribute('aria-expanded', 'false');
    $('changeRequestForm').reset(); $('changeRequestMessage').textContent = ''; $('sendChangeRequest').disabled = false;
  }
  const current = generation;
  renderStore(game); renderMedia(game);
  if (!changed) return;
  if (!state.service?.capabilities?.steam || !/^https:\/\/store\.steampowered\.com\/app\//.test(game.projectUrl || '')) return;
  request(`/games/${game.id}/store`, { signal: controller.signal }).then(value => {
    if (current !== generation || state.detail?.id !== game.id || value.gameId !== game.id) return;
    if (value.steam) validateSteam(value.steam, game.projectUrl);
    game.steam = value.steam;
    renderStore(game);
  }).catch(() => { /* A source link remains usable when store metadata is unavailable. */ });
}
export function closeProject() {
  generation++; controller?.abort(); pending = false; projectId = ''; mediaVersion = '';
  $('projectMedia').querySelectorAll('video').forEach(video => { video.pause(); video.removeAttribute('src'); video.load(); });
}
export function bindProject() {
  const dialog = $('itemDialog');
  // Keep hover labels available to keyboards and dismissible without closing the dialog.
  dialog.addEventListener('keydown', event => {
    if (event.key !== 'Escape' || !matchMedia('(hover: hover)').matches) return;
    const visible = [...dialog.querySelectorAll('.project-icon:not([data-tooltip-dismissed])')]
      .filter(icon => icon.matches(':hover, :focus-visible'));
    if (!visible.length) return;
    visible.forEach(icon => { icon.dataset.tooltipDismissed = ''; });
    event.preventDefault(); event.stopPropagation();
  });
  for (const eventName of ['pointerout', 'focusout']) dialog.addEventListener(eventName, event => {
    const icon = event.target.closest('.project-icon');
    if (icon && !icon.contains(event.relatedTarget) && !icon.matches(':hover, :focus-visible')) delete icon.dataset.tooltipDismissed;
  });
  $('jumpFeedback').addEventListener('click', () => { $('feedbackChoice-idea').focus({ preventScroll: true }); $('feedbackTitle').scrollIntoView({ block: 'start' }); });
  $('requestChange').addEventListener('click', () => {
    $('changeRequestPanel').hidden = false;
    $('requestChange').setAttribute('aria-expanded', 'true');
    const ready = state.service?.capabilities?.changeRequests;
    $('changeRequestForm').hidden = !ready;
    $('changeRequestMessage').textContent = ready ? '' : 'Change requests are temporarily unavailable. Please use Sources & privacy for the correction contact.';
    if (ready) $('changeKind').focus();
    $('changeRequestPanel').scrollIntoView({ block: 'nearest' });
  });
  $('closeChangeRequest').addEventListener('click', () => { $('changeRequestPanel').hidden = true; $('requestChange').setAttribute('aria-expanded', 'false'); $('requestChange').focus(); });
  $('changeRequestForm').addEventListener('submit', async event => {
    event.preventDefault();
    if (pending || !state.detail) return;
    const id = state.detail.id, current = generation;
    const body = $('changeBody').value.trim(), link = $('changeUrl').value.trim();
    if (body.length < 12) { $('changeRequestMessage').textContent = 'Add a little more detail, at least 12 characters.'; $('changeBody').focus(); return; }
    try { if (link) safeUrl(link); } catch { $('changeRequestMessage').textContent = 'Use an HTTPS link for the suggested source.'; $('changeUrl').focus(); return; }
    pending = true; $('sendChangeRequest').disabled = true; $('changeRequestMessage').textContent = 'Sending your request…';
    try {
      await request(`/games/${id}/change-requests`, { method: 'POST', feedbackKey: editKey(true),
        body: { kind: $('changeKind').value, body, suggestedUrl: link || null } });
      if (current !== generation) return;
      $('changeRequestForm').hidden = true; $('changeRequestMessage').textContent = 'Request received. An admin will review it in the private inbox. Thank you for helping keep this project accurate.';
    } catch (error) { if (current === generation) $('changeRequestMessage').textContent = error.message; }
    finally { if (current === generation) { pending = false; $('sendChangeRequest').disabled = false; } }
  });
  $('projectMedia').addEventListener('click', event => {
    const button = event.target.closest('[data-play-asset]');
    if (!button || !state.detail) return;
    const asset = mediaFor(state.detail)[Number(button.dataset.playAsset)];
    if (!asset) return;
    const container = button.closest('.media-player');
    if (asset.kind === 'video') {
      container.innerHTML = `<video controls playsinline preload="metadata" aria-label="Video from the original post" src="${e(asset.url)}" ${asset.posterUrl ? `poster="${e(asset.posterUrl)}"` : ''}></video><p class="media-error field__hint" hidden>Playback is unavailable here. Open the original post below.</p>`;
      const video = container.querySelector('video');
      video.addEventListener('error', () => { container.querySelector('.media-error').hidden = false; });
      video.focus(); video.play().catch(() => {});
    } else {
      container.innerHTML = `<img src="${e(asset.url)}" alt="Animated preview from the maker" referrerpolicy="no-referrer"><button type="button" class="text-button" data-stop-gif="${button.dataset.playAsset}">Stop GIF</button>`;
      container.querySelector('button').focus();
    }
  });
  $('projectMedia').addEventListener('click', event => {
    if (event.target.closest('[data-stop-gif]') && state.detail) { mediaVersion = ''; renderMedia(state.detail); $('projectMedia').querySelector('summary').focus(); }
  });
}
