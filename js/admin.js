import { NeoAuth } from './neorgon-auth.js';
import { request } from './api.js';
import { validateCatalog, dateLabel, safeUrl } from './collection.js';
import { $, escHtml as e } from './utils.js';

let user = null, epoch = 0, admin = null, checking = false, inboxNumber = 0, editorNumber = 0;
let entries = [], nextCursor = null, games = [], catalogHead, editing = null, candidates = [], videos = [];
let upload = null, saving = false, frameRun = 0;
let detailsRevision = 0, detailsSaving = false, detailsDirty = false;
const detailInputs = { title: 'detailsTitle', summary: 'detailsSummary', projectUrl: 'detailsUrl', category: 'detailsCategory', stage: 'detailsStage', tags: 'detailsTags', platforms: 'detailsPlatforms' };
const stale = () => new Error('Your session changed. Please try again.');
function notice(value) { $('adminMessage').textContent = value; }
function clearEditor() {
  editorNumber++; frameRun++; editing = null; candidates = []; videos = []; upload = null;
  const video = $('frameVideo'); video.pause(); video.removeAttribute('src'); video.load();
  $('imageForm').reset(); $('editorPreview').removeAttribute('src'); $('imageCandidates').replaceChildren();
  $('imageEditor').hidden = true; $('imageMessage').textContent = ''; $('framePicker').open = false;
  $('detailsForm').reset(); $('detailsMessage').textContent = ''; $('reloadDetails').hidden = true; detailsDirty = false;
}
function lock() {
  epoch++; admin = null; checking = false; inboxNumber++; entries = []; nextCursor = null; clearEditor();
  $('adminWorkspace').hidden = true; $('adminGate').hidden = false; $('inboxEntries').replaceChildren(); $('adminMembers').replaceChildren();
  $('quizMetricsList').replaceChildren(); $('quizMetricsSummary').textContent='';
}
async function privateRequest(path, options = {}) {
  const current = epoch, expected = user;
  if (!NeoAuth.state.signedIn || NeoAuth.state.userId !== expected) throw stale();
  const token = await NeoAuth.state.clerk?.session?.getToken();
  if (!token || current !== epoch || NeoAuth.state.userId !== expected) throw stale();
  let result;
  try { result = await request(path, { ...options, token }); }
  catch (error) {
    if (current === epoch && [401, 403].includes(error.status)) { lock(); notice('This account does not have active admin access.'); }
    throw error;
  }
  if (current !== epoch || NeoAuth.state.userId !== expected) throw stale();
  return result;
}
function tab(name) {
  if (name === 'access' && admin?.role !== 'owner') return;
  for (const panel of ['inbox', 'images', 'quiz', 'access']) $(`${panel}Panel`).hidden = name !== panel;
  document.querySelectorAll('[data-admin-tab]').forEach(button => {
    if (button.dataset.adminTab === name) button.setAttribute('aria-current', 'page'); else button.removeAttribute('aria-current');
  });
  if (name !== 'images') { frameRun++; $('frameVideo').pause(); }
  if (name === 'quiz') loadQuizMetrics();
}
async function loadQuizMetrics() {
  const current=epoch; $('refreshQuizMetrics').disabled=true; $('quizMetricsSummary').textContent='Loading recognition counts…';
  try {
    const result=await privateRequest('/admin/quiz-metrics');
    if(current!==epoch)return;
    $('quizMetricsSummary').textContent=`${result.rounds.completed} completed ${result.rounds.completed===1?'round':'rounds'} · ${result.games.length} games in the current pool. Skipped screenshots do not count as wrong guesses.`;
    $('quizMetricsList').innerHTML=result.games.map(game=>`<li><h4>${e(game.title)}</h4><p>${game.attempts?`${game.correct} of ${game.attempts} guesses recognized it (${Math.round(game.correct/game.attempts*100)}%).`:'No guesses yet.'} ${game.skipped} skipped.</p>${game.choices.length?`<details><summary>See the names people chose</summary><ul>${game.choices.map(choice=>`<li><span>${e(choice.title)}${choice.correct?' ✓':''}</span><strong>${choice.count}</strong></li>`).join('')}</ul></details>`:''}</li>`).join('');
  }catch(error){if(current===epoch)$('quizMetricsSummary').textContent=error.message;}
  finally{if(current===epoch)$('refreshQuizMetrics').disabled=false;}
}
async function checkAccess() {
  if (checking || !NeoAuth.state.signedIn) return;
  checking = true; const current = epoch; notice('Checking your admin access…');
  try {
    admin = await privateRequest('/admin/me');
    if (current !== epoch) return;
    $('adminGate').hidden = true; $('adminWorkspace').hidden = false; $('accessTab').hidden = admin.role !== 'owner';
    notice(`Signed in as ${admin.email} · ${admin.role === 'owner' ? 'Owner' : 'Admin'}`);
    await Promise.all([loadInbox(), loadGames(), admin.role === 'owner' ? loadMembers() : Promise.resolve()]);
    if (current !== epoch) return;
    const id = new URL(location.href).searchParams.get('game');
    if (/^g_[a-z0-9]{5,12}$/.test(id || '')) await openEditor(id);
  } catch (error) { if (current === epoch) notice(error.message); }
  finally { if (current === epoch) checking = false; }
}
async function loadGames() {
  let cursor = '', revision, total, all = [], seen = new Set();
  const current = epoch;
  do {
    const page = validateCatalog(await request(`/catalog?pageSize=200${cursor ? `&cursor=${encodeURIComponent(cursor)}` : ''}`));
    if (current !== epoch) return;
    if (revision && revision !== page.generatedAt) throw new Error('The collection changed while loading. Refresh this page.');
    revision = page.generatedAt; catalogHead = page;
    if (total !== undefined && page.pagination?.total !== total) throw new Error('The collection changed while loading. Refresh this page.');
    total = page.pagination?.total;
    all.push(...page.games); cursor = page.pagination?.nextCursor || '';
    if (cursor && (seen.has(cursor) || typeof cursor !== 'string' || !page.games.length)) throw new Error('The next project page could not be read.');
    seen.add(cursor);
  } while (cursor);
  games = all; projectOptions();
}
function projectOptions() {
  const value = $('adminSearch').value.toLowerCase().trim();
  const matching = games.filter(game => `${game.title} ${game.author.name}`.toLowerCase().includes(value));
  $('adminProject').innerHTML = '<option value="">Choose a project…</option>' + matching.map(game => `<option value="${e(game.id)}">${e(game.title)} · u/${e(game.author.name)}</option>`).join('');
  if (editing && matching.some(game => game.id === editing.game.id)) $('adminProject').value = editing.game.id;
}
async function loadInbox(more = false) {
  const number = ++inboxNumber;
  $('refreshInbox').disabled = true; $('moreRequests').disabled = true;
  try {
    const page = await privateRequest(`/admin/requests?status=${$('inboxStatus').value}${more && nextCursor ? `&cursor=${encodeURIComponent(nextCursor)}` : ''}`);
    if (number !== inboxNumber) return;
    entries = more ? [...entries, ...page.entries] : page.entries; nextCursor = page.nextCursor; renderInbox();
  } catch (error) { notice(error.message); }
  finally { if (number === inboxNumber) { $('refreshInbox').disabled = false; $('moreRequests').disabled = false; } }
}
function renderInbox() {
  $('moreRequests').hidden = !nextCursor;
  $('inboxEntries').innerHTML = entries.length ? entries.map(item => `<article class="inbox-request" data-request="${e(item.id)}"><div class="request-meta"><span>${e(item.kind)}</span><time datetime="${e(item.createdAt)}">${e(dateLabel(item.createdAt))}</time><span>${e(item.status)}</span></div><h4>${e(item.title)}</h4><p class="request-body">${e(item.body)}</p>${item.suggestedUrl ? `<p><a class="text-link" href="${e(safeUrl(item.suggestedUrl))}" target="_blank" rel="noopener noreferrer">Suggested source ↗</a></p>` : ''}<button type="button" class="text-button" data-edit-project="${e(item.gameId)}">Edit project ↗</button><details><summary>Review this request</summary><label for="note-${e(item.id)}">Private admin note</label><textarea class="input" id="note-${e(item.id)}" rows="2" maxlength="1200">${e(item.adminNote)}</textarea><div class="admin-inline"><button type="button" class="btn btn--secondary" data-request-status="resolved">Mark resolved</button><button type="button" class="text-button" data-request-status="dismissed">Dismiss</button>${item.status !== 'open' ? '<button type="button" class="text-button" data-request-status="open">Reopen</button>' : ''}</div></details></article>`).join('') : '<p class="inbox-empty">No requests in this view. New requests from project pages will appear here.</p>';
}
async function openEditor(id) {
  if (detailsDirty && !window.confirm('Discard the unsaved project details?')) { $('adminProject').value = editing.game.id; return; }
  clearEditor(); const number = editorNumber;
  tab('images'); $('adminProject').value = id; notice('Loading project…');
  try {
    const result = await privateRequest(`/admin/games/${id}`);
    if (number !== editorNumber || result.game.id !== id) return;
    result.game = validateCatalog({ ...catalogHead, games: [result.game] }).games[0];
    editing = result; paintEditor(); notice(`Editing ${result.game.title}`);
    const url = new URL(location.href); url.searchParams.set('game', id); history.replaceState(null, '', url);
  } catch (error) { notice(error.message); }
}
function imageUrl(preview) { return preview.posterUrl || (preview.kind === 'image' ? preview.url : ''); }
function paintEditor(withDetails = true) {
  const game = editing.game;
  $('imageEditor').hidden = false; $('editorTitle').textContent = game.title;
  $('editorProjectLink').href = `./?game=${encodeURIComponent(game.id)}`;
  const image = imageUrl(game.preview); if (image) $('editorPreview').src = image; else $('editorPreview').removeAttribute('src');
  $('previewStatus').textContent = editing.override ? `Custom preview · updated ${dateLabel(editing.override.updatedAt)}` : 'Automatic preview';
  $('imageUrl').value = ''; $('imageAlt').value = (game.preview.alt || game.title).slice(0, 300);
  $('imageSource').innerHTML = game.posts.map(post => `<option value="${e(post.id)}">${e(dateLabel(post.createdAt))} · ${e(post.title.slice(0, 80))}</option>`).join('');
  $('imagePermissionLabel').hidden = true; $('imagePermission').checked = false; $('imageFile').value = ''; upload = null;
  const original = imageUrl(editing.sourcePreview);
  const choices = [original ? { url: original, label: 'Source preview' } : null,
    game.steam?.headerUrl ? { url: game.steam.headerUrl, label: 'Steam artwork' } : null,
    ...game.posts.flatMap(post => (post.assets || []).filter(asset => asset.kind === 'image').map(asset => ({ url: asset.url, label: dateLabel(post.createdAt), postId: post.id })))].filter(Boolean);
  const seen = new Set(); candidates = choices.filter(choice => { if (seen.has(choice.url)) return false; seen.add(choice.url); return true; }).slice(0, 10);
  $('imageCandidates').innerHTML = candidates.map((choice, i) => `<button type="button" data-image-choice="${i}" aria-label="Use ${e(choice.label)}"><img src="${e(choice.url)}" alt="" referrerpolicy="no-referrer"><span>${e(choice.label)}</span></button>`).join('');
  videos = game.posts.flatMap(post => (post.assets || []).filter(asset => asset.kind === 'video').map(asset => ({ ...asset, postId: post.id, date: post.createdAt })));
  $('framePicker').hidden = !videos.length;
  $('frameSource').innerHTML = videos.map((clip,i) => `<option value="${i}">Clip ${i+1} · ${e(dateLabel(clip.date))}</option>`).join('');
  $('frameMessage').textContent = ''; $('imageMessage').textContent = ''; $('resetImage').disabled = !editing.override;
  if (withDetails) paintDetails();
}
function paintDetails() {
  for (const [key, id] of Object.entries(detailInputs)) {
    const value = editing.game[key]; $(id).value = Array.isArray(value) ? value.join(', ') : value || '';
  }
  detailsRevision = editing.detailsRevision; detailsDirty = false;
  $('detailsStatus').textContent = editing.detailsOverride ? `Edited details · saved ${dateLabel(editing.detailsOverride.updatedAt)}` : 'Imported details';
  $('resetDetails').disabled = !editing.detailsOverride; $('reloadDetails').hidden = true;
}
async function saveDetails(reset = false) {
  if (!editing || detailsSaving) return;
  const current = editorNumber, gameId = editing.game.id;
  const details = Object.fromEntries(Object.entries(detailInputs).map(([key,id]) => [key,
    ['tags','platforms'].includes(key) ? $(id).value.split(',').map(value => value.trim()).filter(Boolean) : $(id).value.trim()]));
  details.projectUrl ||= null;
  detailsSaving = true; $('detailsFields').disabled = true; $('detailsMessage').textContent = 'Saving details…';
  try {
    const result = await privateRequest(`/admin/games/${gameId}/details`, { method: 'PUT', body: { mode: reset ? 'reset' : 'edit', revision: detailsRevision, ...(reset ? {} : { details }) } });
    if (current !== editorNumber) return;
    editing = result; paintDetails(); $('editorTitle').textContent = result.game.title;
    games = games.map(game => game.id === gameId ? result.game : game); projectOptions();
    notice(`Editing ${result.game.title}`);
    $('detailsMessage').textContent = reset ? 'Imported details restored.' : 'Details saved. The public collection updates within a minute.';
  } catch (error) {
    if (current === editorNumber) { $('detailsMessage').textContent = error.message; $('reloadDetails').hidden = error.status !== 409; }
  } finally { detailsSaving = false; $('detailsFields').disabled = false; }
}
function chooseUrl(url, postId) {
  upload = null; $('imageFile').value = ''; $('imagePermissionLabel').hidden = true; $('imagePermission').checked = false;
  $('imageUrl').value = url; $('editorPreview').src = url; if (postId) $('imageSource').value = postId;
  $('previewStatus').textContent = 'Selected image · save to publish';
}
function chooseUpload(dataUrl, postId) {
  upload = dataUrl; $('imageUrl').value = ''; $('editorPreview').src = dataUrl;
  $('imagePermissionLabel').hidden = false; $('imagePermission').checked = false;
  if (postId) $('imageSource').value = postId;
  $('previewStatus').textContent = 'New image · save to publish';
}
function canvasFor(source, width, height) {
  if (!width || !height || width * height > 50000000) throw new Error('Choose an image with fewer than 50 million pixels.');
  const scale = Math.min(1, 1600 / Math.max(width, height)), canvas = document.createElement('canvas');
  canvas.width = Math.round(width * scale); canvas.height = Math.round(height * scale);
  canvas.getContext('2d').drawImage(source, 0, 0, canvas.width, canvas.height);
  return canvas;
}
async function savePreview(reset = false) {
  if (!editing || saving) return;
  const current = editorNumber, gameId = editing.game.id;
  const body = reset ? { mode: 'reset' } : { mode: upload ? 'upload' : 'external', alt: $('imageAlt').value.trim(), sourcePostId: $('imageSource').value,
    ...(upload ? { dataUrl: upload, permission: $('imagePermission').checked } : { url: $('imageUrl').value.trim() }) };
  if (!reset && (!body.alt || (!upload && !body.url))) { $('imageMessage').textContent = 'Choose an image and add a short description.'; return; }
  saving = true; $('saveImage').disabled = true; $('resetImage').disabled = true; $('imageMessage').textContent = 'Saving image…';
  try {
    const result = await privateRequest(`/admin/games/${gameId}/image`, { method: 'PUT', body });
    if (current !== editorNumber) return;
    editing = result; paintEditor(false); $('imageMessage').textContent = reset ? 'Automatic preview restored.' : 'Image saved. It will appear in the public collection on its next refresh.';
  } catch (error) { if (current === editorNumber) $('imageMessage').textContent = error.message; }
  finally { saving = false; $('saveImage').disabled = false; $('resetImage').disabled = !editing?.override; }
}
function loadClip() {
  frameRun++; const clip = videos[Number($('frameSource').value)], video = $('frameVideo');
  video.pause(); $('frameMessage').textContent = '';
  if (clip) { video.src = clip.url; video.load(); }
}
function waitFor(target, event, action, timeout = 12000) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => done(new Error('The video took too long to load. Try uploading a still image.')), timeout);
    function done(error) { clearTimeout(timer); target.removeEventListener(event, success); target.removeEventListener('error', failure); error ? reject(error) : resolve(); }
    const success = () => done(), failure = () => done(new Error('The source host could not supply this video for frame capture.'));
    target.addEventListener(event, success, { once: true }); target.addEventListener('error', failure, { once: true }); action?.();
  });
}
async function findFrame() {
  const video = $('frameVideo');
  if (!video.src) loadClip();
  const current = ++frameRun;
  $('findFrame').disabled = true; $('useFrame').disabled = true; $('frameMessage').textContent = 'Looking beyond the opening frame…';
  try {
    const active = current;
    if (video.readyState < 2) await waitFor(video, 'loadeddata');
    if (!Number.isFinite(video.duration) || video.duration <= 0) throw new Error('This clip does not support frame seeking.');
    video.pause(); let best = { score: -1, time: 0 };
    const probe = document.createElement('canvas'); probe.width = 48; probe.height = 27; const ctx = probe.getContext('2d', { willReadFrequently: true });
    for (const ratio of [.1, .3, .55, .8]) {
      if (active !== frameRun) return;
      const time = Math.min(video.duration - .05, 60, Math.max(.05, video.duration * ratio));
      if (Math.abs(video.currentTime - time) > .03) await waitFor(video, 'seeked', () => { video.currentTime = time; }, 8000);
      if (active !== frameRun) return;
      if (Math.abs(video.currentTime - time) > .5) throw new Error('This host does not support seeking this clip. Try an uploaded still image.');
      ctx.drawImage(video, 0, 0, 48, 27); const pixels = ctx.getImageData(0, 0, 48, 27).data;
      let lit = 0, sum = 0, squares = 0;
      for (let i=0; i<pixels.length; i+=4) { const l=.2126*pixels[i]+.7152*pixels[i+1]+.0722*pixels[i+2]; if(l>24&&l<236)lit++;sum+=l;squares+=l*l; }
      const n=pixels.length/4, variance=squares/n-(sum/n)**2, score=lit/n+Math.min(variance/5000,1);
      if (score > best.score) best = { score, time };
    }
    if (active !== frameRun) return;
    if (Math.abs(video.currentTime-best.time)>.03) await waitFor(video,'seeked',()=>{video.currentTime=best.time;},8000);
    if (active !== frameRun) return;
    $('frameMessage').textContent = best.score > .1 ? 'A clearer frame is ready. Adjust the playhead if you prefer another moment, then choose Use this frame.' : 'The sampled frames are still dark. Scrub to another moment or upload a still image.';
  } catch (error) { if (current === frameRun) $('frameMessage').textContent = error.name === 'SecurityError' ? 'The source host blocks frame capture. Upload an authorized still image instead.' : error.message; }
  finally { $('findFrame').disabled = false; $('useFrame').disabled = false; }
}
async function loadMembers() {
  const data = await privateRequest('/admin/members');
  $('adminMembers').innerHTML = data.members.map(member => `<div class="member-row"><div><strong>${e(member.email)}</strong><br><span>${member.role === 'owner' ? 'Default owner' : member.enabled ? 'Admin access enabled' : 'Access revoked'}</span></div>${member.role !== 'owner' ? `<button class="text-button" type="button" data-member-email="${e(member.email)}" data-member-enabled="${!member.enabled}">${member.enabled ? 'Revoke access' : 'Restore access'}</button>` : ''}</div>`).join('');
}
async function memberChange(email, enabled) {
  await privateRequest('/admin/members', { method: 'PUT', body: { email, enabled } });
  await loadMembers(); notice(enabled ? 'Admin access granted for the verified primary email.' : 'Admin access revoked.');
}

$('adminSignIn').addEventListener('click', async event => {
  if (await NeoAuth.requireSignIn({ invoker: event.currentTarget, reason: 'Sign in to manage the Playtrace collection.' })) { user = NeoAuth.state.userId; await checkAccess(); }
});
document.querySelectorAll('[data-admin-tab]').forEach(button => button.addEventListener('click', () => tab(button.dataset.adminTab)));
$('refreshQuizMetrics').addEventListener('click',loadQuizMetrics);
$('adminSearch').addEventListener('input', projectOptions);
$('adminProject').addEventListener('change', event => {
  if (event.target.value) openEditor(event.target.value);
  else if (detailsDirty && !window.confirm('Discard the unsaved project details?')) event.target.value = editing.game.id;
  else clearEditor();
});
$('inboxStatus').addEventListener('change', () => loadInbox());
$('refreshInbox').addEventListener('click', () => loadInbox()); $('moreRequests').addEventListener('click', () => loadInbox(true));
$('inboxEntries').addEventListener('click', async event => {
  const project = event.target.closest('[data-edit-project]'); if (project) { await openEditor(project.dataset.editProject); return; }
  const button = event.target.closest('[data-request-status]'); if (!button) return;
  const row = button.closest('[data-request]'), id = row.dataset.request; button.disabled = true;
  try { await privateRequest(`/admin/requests/${id}`, { method: 'PUT', body: { status: button.dataset.requestStatus, note: row.querySelector('textarea').value } }); await loadInbox(); $('inboxStatus').focus(); notice('Request updated.'); }
  catch (error) { notice(error.message); button.disabled = false; }
});
$('imageCandidates').addEventListener('click', event => { const button=event.target.closest('[data-image-choice]'); if(button){ const choice=candidates[Number(button.dataset.imageChoice)]; if(choice)chooseUrl(choice.url,choice.postId); } });
$('imageUrl').addEventListener('change', () => { try { if ($('imageUrl').value) chooseUrl(safeUrl($('imageUrl').value)); } catch { $('imageMessage').textContent='Use a valid HTTPS image URL.'; } });
$('imageFile').addEventListener('change', async event => {
  const file=event.target.files[0], current=editorNumber; if(!file)return;
  try { if(file.size>10*1024*1024||!['image/png','image/jpeg','image/webp'].includes(file.type))throw new Error('Choose a PNG, JPEG or WebP smaller than 10 MiB.'); const bitmap=await createImageBitmap(file); try { if(current!==editorNumber)return; chooseUpload(canvasFor(bitmap,bitmap.width,bitmap.height).toDataURL('image/webp',.88)); } finally { bitmap.close(); } }
  catch(error){ if(current===editorNumber)$('imageMessage').textContent=error.message; }
});
$('imageForm').addEventListener('submit', event => { event.preventDefault(); savePreview(); });
$('detailsForm').addEventListener('input', () => { detailsDirty = true; $('detailsMessage').textContent = 'Unsaved changes'; });
$('detailsForm').addEventListener('submit', event => { event.preventDefault(); saveDetails(); });
$('resetDetails').addEventListener('click', () => saveDetails(true));
$('reloadDetails').addEventListener('click', async () => {
  const current = editorNumber; if (!editing) return;
  try { const result = await privateRequest(`/admin/games/${editing.game.id}`); if (current !== editorNumber) return; editing = result; paintDetails(); $('editorTitle').textContent = result.game.title; notice(`Editing ${result.game.title}`); $('detailsMessage').textContent = 'Saved details loaded.'; }
  catch (error) { if (current === editorNumber) $('detailsMessage').textContent = error.message; }
});
window.addEventListener('beforeunload', event => { if (detailsDirty) { event.preventDefault(); event.returnValue = ''; } });
$('resetImage').addEventListener('click', () => savePreview(true));
$('refreshProjectMedia').addEventListener('click', async event => {
  if (!editing) return; const button=event.currentTarget, id=editing.game.id, current=editorNumber; button.disabled=true;
  try { const result=await privateRequest(`/admin/games/${id}/media`,{method:'POST',body:{}}); if(current!==editorNumber)return; const record=await privateRequest(`/admin/games/${id}`); if(current!==editorNumber)return; editing=record; paintEditor(false); $('imageMessage').textContent=result.checked ? `Checked ${result.checked} original posts for media.` : 'Available source media is already loaded.'; }
  catch(error){ if(current===editorNumber)$('imageMessage').textContent=error.message; } finally{button.disabled=false;}
});
$('framePicker').addEventListener('toggle', () => { if($('framePicker').open&&!$('frameVideo').src)loadClip(); else if(!$('framePicker').open){ frameRun++; $('frameVideo').pause(); } });
$('frameSource').addEventListener('change', loadClip); $('findFrame').addEventListener('click',findFrame);
$('useFrame').addEventListener('click', () => {
  const video=$('frameVideo'), clip=videos[Number($('frameSource').value)];
  try { if(video.readyState<2)throw new Error('Wait for the video to load, or upload an image.'); video.pause(); chooseUpload(canvasFor(video,video.videoWidth,video.videoHeight).toDataURL('image/webp',.88),clip?.postId); $('frameMessage').textContent='Frame selected. Confirm permission and save the image above.'; $('imageForm').scrollIntoView({block:'nearest'}); }
  catch(error){ $('frameMessage').textContent=error.name==='SecurityError'?'The source host blocks frame capture. Upload an authorized still image instead.':error.message; }
});
$('frameVideo').addEventListener('error',()=>{ $('frameMessage').textContent='This source cannot be loaded for frame capture. You can upload an authorized still image instead.'; });
$('addAdminForm').addEventListener('submit', async event => { event.preventDefault(); const button=event.submitter; button.disabled=true; try{await memberChange($('adminEmail').value.trim(),true);$('adminEmail').value='';}catch(error){notice(error.message);}finally{button.disabled=false;} });
$('adminMembers').addEventListener('click', async event => { const button=event.target.closest('[data-member-email]');if(!button)return;button.disabled=true;try{await memberChange(button.dataset.memberEmail,button.dataset.memberEnabled==='true');}catch(error){notice(error.message);button.disabled=false;} });

try {
  const status = await request('/status');
  if (!status.capabilities?.admin) { notice('Admin sign-in is being connected. Public feedback and change requests remain available.'); }
  else {
    $('adminSignIn').disabled = false;
    NeoAuth.onChange(auth => {
      if (user !== auth.userId || !auth.signedIn) { lock(); user = auth.userId; }
      if (auth.signedIn && !admin) checkAccess();
      else if (auth.status === 'unavailable') notice('Sign-in is unavailable for this site. Please try again after the account connection is restored.');
      else if (!auth.signedIn) notice('Sign in with an account that has been granted admin access.');
    });
    await NeoAuth.start();
  }
} catch(error) { notice(error.message); }
