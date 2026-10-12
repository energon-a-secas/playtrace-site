import { request } from './api.js';
import { ratingControl } from './rating-control.js';
import { state } from './state.js';
import { $, escHtml as e } from './utils.js';
import { safeUrl, validateCatalog, dateLabel } from './collection.js';
import { icon } from './icons.js';
import { NeoAuth } from './neorgon-auth.js';
import { render, renderDetail } from './render.js';
import { reviewMarkup, revealReviewSource } from './feedback-review.js';

let epoch=0,currentId='',controller,ratings;
export async function loadExtras(game){
  if(currentId===game.id)return;
  currentId=game.id;const version=++epoch;controller?.abort();controller=new AbortController();ratings.load(game.id);
  $('projectReferences').textContent='Loading shared links…';$('publishedReview').hidden=true;selectHistory('updates');
  const options={signal:controller.signal};

  try{
    const context=await request(`/games/${game.id}/context`,options);if(version!==epoch)return;
    $('projectReferences').innerHTML=context.references.length?context.references.map(ref=>{
      const source=game.posts.find(post=>post.id===ref.sourcePostId);
      return `<a class="reference-link" href="${e(safeUrl(ref.url))}" target="_blank" rel="noopener noreferrer">${icon(/reddit\.com/.test(new URL(ref.url).hostname)?'reddit':'website')}<span><strong>${e(ref.title)} ↗</strong><small>${e(new URL(ref.url).hostname)}${source?` · shared ${e(dateLabel(source.createdAt))}`:''}</small></span></a>`;
    }).join(''):'<p class="field__hint">No additional links collected yet. The original posts may contain more context.</p>';
    const review=context.review;
    if(review){
      $('publishedReview').innerHTML=reviewMarkup(review);$('publishedReview').hidden=false;revealReviewSource($('publishedReview'));
    }
  }catch{if(version===epoch)$('projectReferences').textContent='Shared links could not be loaded. Visit the original posts for more context.';}
}
export function closeExtras(){epoch++;controller?.abort();ratings?.close();currentId='';}
function selectHistory(which){
  for(const name of ['updates','references']){const cap=name[0].toUpperCase()+name.slice(1),tab=$(`history${cap}Tab`);tab.setAttribute('aria-selected',String(name===which));tab.tabIndex=name===which?0:-1;$(`history${cap}Panel`).hidden=name!==which;}
}
export function openQuickImage(){
  if(!state.isAdmin||!state.detail)return;
  $('inlineProjectEditor').hidden=true;$('quickImagePanel').hidden=false;$('quickImageForm').reset();$('quickImageAlt').value=state.detail.preview.alt||state.detail.title;$('quickImageMessage').textContent='';$('quickImagePermission').checked=true;$('quickImageFile').focus();$('quickImagePanel').scrollIntoView({block:'nearest'});
}
async function uploadData(file){
  if(file.size>10*1024*1024||!['image/png','image/jpeg','image/webp'].includes(file.type))throw new Error('Choose a PNG, JPEG or WebP under 10 MiB.');
  const bitmap=await createImageBitmap(file);
  try{if(bitmap.width*bitmap.height>50000000)throw new Error('Choose an image under 50 million pixels.');const scale=Math.min(1,1600/Math.max(bitmap.width,bitmap.height)),canvas=document.createElement('canvas');canvas.width=Math.round(bitmap.width*scale);canvas.height=Math.round(bitmap.height*scale);canvas.getContext('2d').drawImage(bitmap,0,0,canvas.width,canvas.height);return canvas.toDataURL('image/webp',.88);}finally{bitmap.close();}
}
export function bindExtras(){
  addEventListener('hashchange',()=>revealReviewSource($('publishedReview')));
  for(const event of ['feedback-saved','feedback-removed'])document.addEventListener(event,()=>{
    if(!state.detail)return;currentId='';loadExtras(state.detail);
  });
  ratings=ratingControl($('ratingControl'));
  for(const name of ['Updates','References']){
    const tab=$(`history${name}Tab`);tab.addEventListener('click',()=>selectHistory(name.toLowerCase()));
    tab.addEventListener('keydown',event=>{if(!['ArrowLeft','ArrowRight','Home','End'].includes(event.key))return;event.preventDefault();const next=event.key==='Home'?'updates':event.key==='End'?'references':name==='Updates'?'references':'updates';selectHistory(next);$(`history${next[0].toUpperCase()+next.slice(1)}Tab`).focus();});
  }
  $('editThumbnail').addEventListener('click',openQuickImage);
  $('cancelQuickImage').addEventListener('click',()=>{$('quickImagePanel').hidden=true;$('editThumbnail').focus();});
  $('quickImageForm').addEventListener('submit',async event=>{
    event.preventDefault();if(!state.isAdmin||!state.detail)return;
    const game=state.detail,version=epoch,user=NeoAuth.state.userId,button=event.submitter;button.disabled=true;$('quickImageMessage').textContent='Saving thumbnail…';
    try{
      const file=$('quickImageFile').files[0],alt=$('quickImageAlt').value.trim(),sourcePostId=game.posts[0].id;
      if(!alt)throw new Error('Add a short image description.');
      if(file&&!$('quickImagePermission').checked)throw new Error('Confirm permission to upload this image.');
      const body=file?{mode:'upload',dataUrl:await uploadData(file),permission:true,alt,sourcePostId}:{mode:'external',url:safeUrl($('quickImageUrl').value.trim()),alt,sourcePostId};
      const token=await NeoAuth.state.clerk?.session?.getToken();if(!token||NeoAuth.state.userId!==user)throw new Error('Your session changed. Sign in again.');
      const result=await request(`/admin/games/${game.id}/image`,{method:'PUT',token,body});if(version!==epoch||!state.isAdmin||NeoAuth.state.userId!==user)return;
      const validated=validateCatalog({...state.catalog,games:[result.game]}).games[0];state.games=state.games.map(item=>item.id===game.id?validated:item);render();renderDetail(validated);$('editThumbnail').focus();
    }catch(error){if(version===epoch)$('quickImageMessage').textContent=error.message;}
    finally{button.disabled=false;}
  });
}
