import { request } from './api.js';
import { state } from './state.js';
import { validateCatalog } from './collection.js';
import { gamePageContent } from './game-page-view.js';
import { projectPath } from './project-url.js';
import { $, copyText } from './utils.js';
import { NeoAuth } from './neorgon-auth.js';
import { favorites } from './favorites.js';
import { ratingControl } from './rating-control.js';
import { bindFeedback, resetFeedback, loadFeedback, renderFeedback } from './feedback.js';
import { reviewMarkup, revealReviewSource } from './feedback-review.js';
import { linkCheckMarkup } from './link-check-view.js';

let user=null,authVersion=0,syncing=null,reviewVersion=0;
const initial=validateCatalog(JSON.parse($('gameData').textContent));
let game=initial.games[0];
async function loadReview(){
  const node=$('pageReview'),current=++reviewVersion;if(!node)return;
  node.hidden=true;node.replaceChildren();
  try{const {review,availability,linkHistory}=await request(`/games/${game.id}/context`);if(current!==reviewVersion)return;
    $('pageLinkChecks').innerHTML=linkCheckMarkup({...game,availability},linkHistory||[]);if(location.hash==='#linkChecks')$('linkChecks')?.scrollIntoView({block:'center'});
    if(review){node.innerHTML=reviewMarkup(review,{heading:'h2'});node.hidden=false;revealReviewSource(node);}}catch{/* Original posts and the dated link snapshot remain available. */}
}
function paintFavorite(){
  const saved=favorites.ids(user).includes(game.id),button=$('pageFavorite');
  if(!button)return;
  button.setAttribute('aria-pressed',String(saved));button.setAttribute('aria-label',saved?'Remove from favorites':'Save to favorites');button.title=saved?'Remove from favorites':'Save to favorites';
}
async function tokenFor(subject){
  const token=await NeoAuth.state.clerk?.session?.getToken();
  if(!token||user!==subject||NeoAuth.state.userId!==subject)throw new Error('Your session changed. Sign in again.');
  return token;
}
async function syncFavorites(){
  const subject=user;if(!subject||syncing?.user===subject)return;
  const task={user:subject};syncing=task;
  try{
    for(let batch=0;batch<10&&user===subject;batch++){
      const sent=favorites.pending(subject).slice(0,200);if(!sent.length)break;
      const result=await request('/me/favorites',{method:'PUT',token:await tokenFor(subject),body:{changes:sent.map(({gameId,saved})=>({gameId,saved}))}});
      if(!Array.isArray(result.follows))throw new Error('Sync unavailable');
      favorites.acknowledge(subject,sent,result.follows);if(user===subject)paintFavorite();
    }
  }catch{if(user===subject)$('gameActionMessage').textContent='Saved on this device. Sync will retry when you reconnect.';}
  finally{if(syncing===task)syncing=null;}
}
async function account(auth){
  const current=++authVersion;user=auth.signedIn?auth.userId:null;
  $('pageEdit').hidden=true;
  if(user)favorites.adoptGuest(user);paintFavorite();if(!user)return;
  const subject=user;
  try{
    const token=await tokenFor(subject),me=await request('/me',{token});
    if(current!==authVersion)return;
    if(Array.isArray(me.follows)){favorites.reconcile(subject,me.follows);paintFavorite();await syncFavorites();}
    const admin=await request('/admin/me',{token});if(current===authVersion)$('pageEdit').hidden=!['owner','admin'].includes(admin.role);
  }catch{/* Favorites remain usable without account services. */}
}
async function boot(){
  let catalog=initial;
  try{
    catalog=validateCatalog(await request(`/games/${game.id}`));
    const current=catalog.games[0];
    if(current.id!==game.id){location.replace(projectPath(current)+location.search+location.hash);return;}
    game=current;
  }catch(error){
    if(error.status===404){$('gameContent').innerHTML='<section class="game-page-unavailable"><h1>This entry is no longer available.</h1><p>It may have been withdrawn or combined with another project.</p><a class="btn btn--primary" href="/browse.html">Browse games</a></section>';$('gameFeedback').hidden=true;document.querySelector('meta[name=robots]')?.setAttribute('content','noindex');return;}
    $('gameFreshness').textContent=`Saved listing from ${new Date(initial.snapshotAt||initial.generatedAt).toLocaleDateString()}. Live details are temporarily unavailable.`;
  }
  $('gameContent').innerHTML=gamePageContent(game,catalog);document.title=`${game.title} | Playtrace`;
  state.catalog=catalog;state.games=[game];state.detail=game;
  favorites.setAliases(catalog.games);
  $('projectResearch').href=`/research.html?game=${game.id}`;
  const ratings=ratingControl($('ratingControl'));ratings.load(game.id);
  bindFeedback();resetFeedback(game.id);
  request('/status').then(service=>{state.service=service;renderFeedback();}).catch(()=>{});
  loadFeedback(game.id);paintFavorite();
  loadReview();
  addEventListener('hashchange',()=>revealReviewSource($('pageReview')));
  for(const event of ['feedback-saved','feedback-removed'])document.addEventListener(event,loadReview);
  $('pageFavorite').addEventListener('click',()=>{
    const result=favorites.toggle(user,game.id);if(!result)return;
    paintFavorite();$('gameActionMessage').textContent=result.persisted?(result.saved?'Saved to favorites.':'Removed from favorites.'):'Saved for this visit. Browser storage is unavailable.';
    document.dispatchEvent(new CustomEvent('favorite-changed',{detail:{gameId:game.id,saved:result.saved}}));syncFavorites();
  });
  $('pageShare').addEventListener('click',async()=>{$('gameActionMessage').textContent=await copyText(new URL(projectPath(game),location.origin).href)?'Project link copied.':'Copy the address from your browser.';});
  NeoAuth.onChange(account);NeoAuth.start();
  addEventListener('online',()=>account(NeoAuth.state));
  addEventListener('storage',event=>{if(event.key?.startsWith('playtrace.favorites.v1:')){paintFavorite();syncFavorites();}});
  document.dispatchEvent(new CustomEvent('game-viewed',{detail:{gameId:game.id}}));
}
document.addEventListener('error',event=>{if(event.target.tagName==='IMG'){event.target.hidden=true;event.target.closest('.game-page-art')?.classList.add('game-image--missing');}},true);
await boot();
