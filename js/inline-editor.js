import { request } from './api.js';
import { NeoAuth } from './neorgon-auth.js';
import { state } from './state.js';
import { $, escHtml as e } from './utils.js';
import { validateCatalog, categoryChoices } from './collection.js';
import { render, renderDetail } from './render.js';

let run = 0, record = null, busy = false, removalTarget = null;
const fields = { title: 'inlineTitle', summary: 'inlineSummary', projectUrl: 'inlineUrl', repositoryUrl: 'inlineRepository', category: 'inlineCategory', stage: 'inlineStage', platforms: 'inlinePlatforms', tags: 'inlineTags' };
async function adminRequest(path, options = {}) {
  const user = NeoAuth.state.userId;
  if (!state.isAdmin || !NeoAuth.state.signedIn) throw new Error('Sign in with an admin account to edit this project.');
  const token = await NeoAuth.state.clerk?.session?.getToken();
  if (!token || user !== NeoAuth.state.userId) throw new Error('Your session changed. Sign in again.');
  const value = await request(path, { ...options, token });
  if (!state.isAdmin || !NeoAuth.state.signedIn || user !== NeoAuth.state.userId) throw new Error('Your session changed. Sign in again.');
  return value;
}
export function closeInlineEditor() {
  run++; record = null; busy = false;
  $('inlineProjectEditor').hidden = true;
  $('inlineProjectForm').reset(); $('inlineEditorMessage').textContent = '';
  $('inlineRemovalConfirm').hidden = true; removalTarget = null;
}
function categories(selected) {
  $('inlineCategory').innerHTML = categoryChoices({ categories: record.categories }).map(category => `<option value="${e(category.id)}">${e(category.label)}</option>`).join('') + '<option value="__add__">＋ Add a category…</option>';
  $('inlineCategory').value = selected;
}
export async function openInlineEditor() {
  if (!state.isAdmin || !state.detail) return;
  const version = ++run, id = state.detail.id;
  record=null;removalTarget=null;$('inlineRemovalConfirm').hidden=true;
  $('quickImagePanel').hidden = true;
  $('inlineProjectEditor').hidden = false;
  $('inlineFields').disabled = true; $('inlineEditorMessage').textContent = 'Loading saved details…';
  $('inlineReload').hidden = true; $('inlineCategoryAdd').hidden = true;
  $('inlineProjectEditor').scrollIntoView({ block: 'start' });
  try {
    const value = await adminRequest(`/admin/games/${id}`);
    if (version !== run || state.detail?.id !== id) return;
    record = value; categories(value.game.category);
    const flags=value.duplicateFlags||[];
    $('inlineDuplicateFlags').hidden=!flags.length;
    $('inlineDuplicateFlags').innerHTML=flags.length?`<strong>Possible duplicates to review</strong><ul>${flags.map(flag=>`<li>${e(flag.reason)}. <a class="text-link" target="_blank" rel="noopener noreferrer" href="/browse/?game=${flag.gameId===id?flag.otherId:flag.gameId}">${e(flag.gameId===id?flag.otherTitle:flag.title)} ↗</a></li>`).join('')}</ul>`:'';
    $('inlineSourcePosts').innerHTML=value.game.posts.map(post=>`<li><a class="text-link" href="${e(post.url)}" target="_blank" rel="noopener noreferrer">${e(post.title)} ↗</a>${value.game.posts.some(other=>other.id!==post.id&&Math.abs(Date.parse(other.createdAt)-Date.parse(post.createdAt))<=48*3600000)?'<small>Posts within 48 hours</small>':''}${value.game.posts.length>1&&![value.sourcePreview.sourceUrl,value.game.preview.sourceUrl].includes(post.url)?`<button type="button" class="text-button" data-remove-post="${post.id}">Remove post</button>`:'<small>Required source</small>'}</li>`).join('');
    $('inlineRemovalConfirm').hidden=true;removalTarget=null;
    for (const [key, field] of Object.entries(fields)) $(field).value = Array.isArray(value.game[key]) ? value.game[key].join(', ') : value.game[key] || '';
    $('inlineFields').disabled = false; $('inlineEditorMessage').textContent = 'Edits are kept when new source posts arrive.';
    $('inlineTitle').focus({ preventScroll: true });
  } catch (error) { if (version === run) { $('inlineEditorMessage').textContent = error.message; $('inlineReload').hidden = false; } }
}
export function bindInlineEditor() {
  $('editProject').addEventListener('click', openInlineEditor);
  $('inlineCancel').addEventListener('click', () => { closeInlineEditor(); $('editProject').focus(); });
  $('inlineReload').addEventListener('click', openInlineEditor);
  function confirmRemoval(postId=null) {
    if(busy||!record)return;
    const post=postId?record.game.posts.find(post=>post.id===postId):null;
    if(postId&&!post)return;
    removalTarget={gameId:record.game.id,postId};
    $('inlineRemovalText').textContent=post?`Remove “${post.title}” from this history? The game and its feedback will stay. Reddit is unchanged.`:`Remove “${record.game.title}” from Playtrace? Its feedback, ratings, favorites and uploaded images will also be deleted. Reddit is unchanged.`;
    $('inlineRemovalConfirm').hidden=false;$('inlineConfirmRemoval').textContent=post?'Remove this post':'Remove this entry';$('inlineConfirmRemoval').focus();
  }
  $('inlineRemoveGame').addEventListener('click',()=>confirmRemoval());
  $('inlineSourcePosts').addEventListener('click',event=>{const button=event.target.closest('[data-remove-post]');if(button)confirmRemoval(button.dataset.removePost);});
  $('inlineCancelRemoval').addEventListener('click',()=>{$('inlineRemovalConfirm').hidden=true;removalTarget=null;$('inlineRemoveGame').focus();});
  $('inlineConfirmRemoval').addEventListener('click',async()=>{
    if(busy||!removalTarget||!record)return;
    const target={...removalTarget},version=run;busy=true;$('inlineConfirmRemoval').disabled=true;
    try{
      const path=target.postId?`/admin/games/${target.gameId}/posts/${target.postId}/remove`:`/admin/games/${target.gameId}/delete`;
      await adminRequest(path,{method:'POST',body:{confirm:target.postId||target.gameId,reason:$('inlineRemovalReason').value}});
      if(version!==run)return;
      if(target.postId){
        const value=await adminRequest(`/admin/games/${target.gameId}`);if(version!==run)return;
        const game=validateCatalog({...state.catalog,categories:value.categories,games:[value.game]}).games[0];
        state.games=state.games.map(entry=>entry.id===game.id?game:entry);render();renderDetail(game);await openInlineEditor();
      }else{state.games=state.games.filter(entry=>entry.id!==target.gameId);state.follows=state.follows.filter(id=>id!==target.gameId);closeInlineEditor();$('itemDialog').close();render();}
    }catch(error){if(version===run)$('inlineEditorMessage').textContent=error.message;}
    finally{busy=false;$('inlineConfirmRemoval').disabled=false;}
  });
  $('inlineCategory').addEventListener('change', () => {
    const add = $('inlineCategory').value === '__add__'; $('inlineCategoryAdd').hidden = !add;
    if (add) $('inlineCategoryName').focus();
  });
  $('inlineAddCategory').addEventListener('click', async () => {
    if (busy || !record) return;
    const version = run; busy = true; $('inlineAddCategory').disabled = true;
    try {
      const value = await adminRequest('/admin/categories', { method: 'POST', body: { label: $('inlineCategoryName').value.trim() } });
      if (version !== run) return;
      record.categories = value.categories; categories(value.category.id); $('inlineCategoryAdd').hidden = true;
      state.catalog.categories = value.categories; $('inlineEditorMessage').textContent = 'Category added to the shared list. Save the project to use it here.';
    } catch (error) { if (version === run) $('inlineEditorMessage').textContent = error.message; }
    finally { busy = false; $('inlineAddCategory').disabled = false; }
  });
  $('inlineProjectForm').addEventListener('submit', async event => {
    event.preventDefault(); if (busy || !record) return;
    const version = run, id = record.game.id;
    if ($('inlineCategory').value === '__add__') { $('inlineEditorMessage').textContent = 'Add your new category or choose an existing one.'; return; }
    busy = true; $('inlineFields').disabled = true; $('inlineEditorMessage').textContent = 'Saving project…';
    try {
      const details = Object.fromEntries(Object.entries(fields).map(([key, field]) => {
        const value = $(field).value.trim();
        return [key, ['tags', 'platforms'].includes(key) ? value.split(',').map(part => part.trim()).filter(Boolean) : ['projectUrl', 'repositoryUrl'].includes(key) ? value || null : value];
      }));
      const value = await adminRequest(`/admin/games/${id}/details`, { method: 'PUT', body: { mode: 'edit', revision: record.detailsRevision, details } });
      if (version !== run || state.detail?.id !== id) return;
      const game = validateCatalog({ ...state.catalog, categories: value.categories, games: [value.game] }).games[0];
      state.catalog.categories = value.categories; state.games = state.games.map(entry => entry.id === id ? game : entry);
      render(); renderDetail(game); closeInlineEditor(); $('editProject').focus();
      const { showToast } = await import('./utils.js'); showToast('Project details saved.');
    } catch (error) { if (version === run) { $('inlineEditorMessage').textContent = error.message; $('inlineReload').hidden = error.status !== 409; } }
    finally { if (version === run) { busy = false; $('inlineFields').disabled = false; } }
  });
}
