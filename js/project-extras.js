import { request } from './api.js';
import { editKey } from './guest-key.js';
import { state } from './state.js';
import { $, escHtml as e } from './utils.js';
import { safeUrl, validateCatalog, dateLabel } from './collection.js';
import { icon } from './icons.js';
import { NeoAuth } from './neorgon-auth.js';
import { render, renderDetail } from './render.js';

let epoch=0,currentId='',rating=null,busy=false,controller;
function paintRating(){
  $('ratingControl').innerHTML=`<div class="rating-stars" role="radiogroup" aria-label="Rate this game">${[1,2,3,4,5].map(n=>`<button type="button" role="radio" aria-checked="${rating?.mine===n}" tabindex="${n===(rating?.mine||1)?0:-1}" data-rating="${n}" class="${n<=(rating?.mine||0)?'is-filled':''}" aria-label="${n} ${n===1?'star':'stars'}" title="Rate ${n} ${n===1?'star':'stars'}" ${busy?'disabled':''}>${icon('star')}</button>`).join('')}</div>${rating?.count?`<small class="rating-average" aria-label="Average ${rating.average.toFixed(1)} out of 5 from ${rating.count} ratings">${rating.average.toFixed(1)} <span>(${rating.count})</span></small>`:''}<button type="button" class="text-button" id="removeRating" ${rating?.mine?'':'hidden'} ${busy?'disabled':''}>Clear rating</button><p id="ratingMessage" role="status"></p>`;
}
export async function loadExtras(game){
  if(currentId===game.id)return;
  currentId=game.id;const version=++epoch;controller?.abort();controller=new AbortController();rating=null;busy=false;paintRating();
  $('projectReferences').textContent='Loading shared links…';$('publishedReview').hidden=true;selectHistory('updates');
  const options={signal:controller.signal};
  request(`/games/${game.id}/rating`,{...options,feedbackKey:editKey(false)}).then(result=>{if(version===epoch){rating=result;paintRating();}}).catch(()=>{if(version===epoch)$('ratingMessage').textContent='Ratings could not be loaded. You can try again by selecting a star.';});
  try{
    const context=await request(`/games/${game.id}/context`,options);if(version!==epoch)return;
    $('projectReferences').innerHTML=context.references.length?context.references.map(ref=>{
      const source=game.posts.find(post=>post.id===ref.sourcePostId);
      return `<a class="reference-link" href="${e(safeUrl(ref.url))}" target="_blank" rel="noopener noreferrer">${icon(/reddit\.com/.test(new URL(ref.url).hostname)?'reddit':'website')}<span><strong>${e(ref.title)} ↗</strong><small>${e(new URL(ref.url).hostname)}${source?` · shared ${e(dateLabel(source.createdAt))}`:''}</small></span></a>`;
    }).join(''):'<p class="field__hint">No additional links collected yet. The original posts may contain more context.</p>';
    const review=context.review;
    if(review){
      const citationMap=new Map(review.citations.map(citation=>[citation.number,citation]));
      const summary=e(review.summary).replace(/\[(\d+)\]/g,(match,n)=>citationMap.has(Number(n))?`<a href="#review-source-${n}">[${n}]</a>`:match);
      $('publishedReview').innerHTML=`<p class="eyebrow">COMMUNITY FIELD NOTES</p><h3>From the conversation</h3><p>${summary}</p><p class="field__hint">Reviewed, AI-assisted summary of ${review.classifiedComments} archived comments · ${e(dateLabel(review.windowStart))}–${e(dateLabel(review.windowEnd))}${review.sampled?' · Sampled':''}</p><details><summary>Read the cited comments</summary><ol>${review.citations.map(citation=>`<li id="review-source-${citation.number}"><a href="${e(safeUrl(citation.url))}" target="_blank" rel="noopener noreferrer">[${citation.number}] u/${e(citation.author)} ↗</a><blockquote>${e(citation.body)}</blockquote></li>`).join('')}</ol></details>`;$('publishedReview').hidden=false;
    }
  }catch{if(version===epoch)$('projectReferences').textContent='Shared links could not be loaded. Visit the original posts for more context.';}
}
export function closeExtras(){epoch++;controller?.abort();currentId='';}
function selectHistory(which){
  for(const name of ['updates','references']){const cap=name[0].toUpperCase()+name.slice(1),tab=$(`history${cap}Tab`);tab.setAttribute('aria-selected',String(name===which));tab.tabIndex=name===which?0:-1;$(`history${cap}Panel`).hidden=name!==which;}
}
async function rate(stars){
  if(busy||!currentId)return;const id=currentId,version=epoch;busy=true;paintRating();
  try{const result=await request(`/games/${id}/rating`,{method:stars?'PUT':'DELETE',feedbackKey:editKey(true),...(stars?{body:{stars}}:{})});if(version!==epoch)return;rating=result;}
  catch(error){if(version===epoch){busy=false;paintRating();$('ratingMessage').textContent=error.message;return;}}
  finally{if(version===epoch){busy=false;}}
  if(version===epoch){paintRating();$('ratingMessage').textContent=stars?'Your rating is saved.':'Your rating was removed.';$('ratingControl').querySelector(`[data-rating="${stars||1}"]`)?.focus({preventScroll:true});}
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
  $('ratingControl').addEventListener('click',event=>{const star=event.target.closest('[data-rating]');if(star)rate(Number(star.dataset.rating));else if(event.target.closest('#removeRating'))rate(null);});
  $('ratingControl').addEventListener('keydown',event=>{const star=event.target.closest('[data-rating]');if(!star||!['ArrowLeft','ArrowRight','ArrowUp','ArrowDown'].includes(event.key))return;event.preventDefault();const next=(Number(star.dataset.rating)-1+(['ArrowRight','ArrowUp'].includes(event.key)?1:4))%5+1;rate(next);});
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
