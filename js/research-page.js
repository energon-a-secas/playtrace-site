import { request } from './api.js';
import { editKey } from './guest-key.js';
import { $, escHtml as e } from './utils.js';
import { validateCatalog, safeUrl } from './collection.js';
import { questionFlow } from './question-flow.js';
import { NeoAuth } from './neorgon-auth.js';

const params=new URL(location.href).searchParams;
let forms=[],games=[],current=null,loaded=false,epoch=0,booting=false;
const embedded=params.get('embed')==='1';
if(embedded)document.body.classList.add('research-embedded');else NeoAuth.start();
function options(){
  const category=$('researchCategory').value;
  const selected=$('researchFormSelect').value||params.get('form')||'playtest';
  $('researchFormSelect').innerHTML=forms.filter(form=>!category||form.category===category).map(form=>`<option value="${e(form.id)}">${e(form.title)}${form.gameId?' · Project study':''}</option>`).join('');
  if([...$('researchFormSelect').options].some(option=>option.value===selected))$('researchFormSelect').value=selected;
}
function gameOptions(){
  const term=$('researchGameSearch').value.trim().toLowerCase(), form=forms.find(form=>form.id===$('researchFormSelect').value);
  const matching=games.filter(game=>(!form?.gameId||form.gameId===game.id)&&`${game.title} ${game.author.name}`.toLowerCase().includes(term));
  const selected=$('researchGame').value||params.get('game');
  $('researchGame').innerHTML='<option value="">Choose a project…</option>'+matching.slice(0,100).map(game=>`<option value="${game.id}">${e(game.title)} · u/${e(game.author.name)}</option>`).join('');
  if(selected&&matching.some(game=>game.id===selected))$('researchGame').value=selected;
  if(form?.gameId)$('researchGame').value=form.gameId;
  selectedGame();
  $('researchGameCount').textContent=matching.length>100?'Showing the first 100 matches. Type a name to narrow the list.':`${matching.length} projects available`;
}
function selectedGame(){
  const game=games.find(game=>game.id===$('researchGame').value);
  $('startResearch').disabled=!game||!$('researchFormSelect').value;
  $('researchChoice').hidden=!game;
  if(game){$('researchChoiceTitle').textContent=game.title;$('researchTry').hidden=!game.projectUrl;if(game.projectUrl)$('researchTry').href=safeUrl(game.projectUrl);}
}
async function loadGames(){
  if(loaded)return;
  let cursor='',revision,total;const all=[],seen=new Set(),ids=new Set();
  do{
    const page=validateCatalog(await request(`/catalog?pageSize=200${cursor?`&cursor=${encodeURIComponent(cursor)}`:''}`));
    if(revision&&revision!==page.generatedAt)throw new Error('The collection changed while loading. Please try again.');
    revision=page.generatedAt;
    const count=page.pagination?.total??page.games.length;
    if(!Number.isInteger(count)||count<0||(total!==undefined&&count!==total))throw new Error('The collection changed while loading. Please try again.');
    total=count;
    for(const game of page.games){if(ids.has(game.id))throw new Error('The collection changed while loading. Please try again.');ids.add(game.id);all.push(game);}
    cursor=page.pagination?.nextCursor;
    if(cursor&&(typeof cursor!=='string'||seen.has(cursor)||!page.games.length))throw new Error('The next page could not be loaded.');
    if(cursor)seen.add(cursor);
    if(all.length>total||(!cursor&&all.length!==total))throw new Error('The collection could not be fully loaded.');
  }while(cursor);
  games=all;loaded=true;gameOptions();
}
async function start(formId,gameId){
  if(!formId||!gameId)return;
  const version=++epoch;$('startResearch').disabled=true;$('researchMessage').textContent='Loading your review…';
  try{
    current=await request(`/research/${encodeURIComponent(formId)}?game=${encodeURIComponent(gameId)}`);
    if(version!==epoch)return;
    const {game,questionnaire}=current;
    $('researchPicker').hidden=true;$('researchSession').hidden=false;$('researchTitle').textContent=questionnaire.title;
    $('researchProject').textContent=game.title;
    $('researchVisit').hidden=!game.projectUrl;if(game.projectUrl)$('researchVisit').href=safeUrl(game.projectUrl);
    $('researchProjectLink').href=`browse.html?game=${game.id}`;
    const img=game.preview.posterUrl||(game.preview.kind==='image'?game.preview.url:null);
    $('researchImage').hidden=!img;if(img){$('researchImage').src=safeUrl(img);$('researchImage').alt=game.preview.alt;}
    $('researchMessage').textContent='';
    let own;try{own=await request(`/research/${questionnaire.id}/responses?game=${game.id}`,{feedbackKey:editKey(false)});}catch{}
    if(version!==epoch)return;
    $('removeResearch').hidden=!own?.answers;
    if(!questionnaire.active){
      $('questionFlow').innerHTML='<div class="research-thanks"><h3>This playtest has closed.</h3><p>It no longer accepts answers. You can still remove a response saved from this browser.</p></div>';
      return;
    }
    questionFlow($('questionFlow'),{questions:questionnaire.questions,answers:own?.revision===questionnaire.revision?own.answers:{},onComplete:async answers=>{
      await request(`/research/${questionnaire.id}/responses`,{method:'PUT',feedbackKey:editKey(true),body:{gameId:game.id,revision:questionnaire.revision,answers}});
      if(version!==epoch)return;
      $('questionFlow').innerHTML='<div class="research-thanks" tabindex="-1"><span aria-hidden="true">✓</span><h3>That helps the next version.</h3><p>Your review is saved for the editorial team. Thanks for taking a closer look.</p><button id="editResearchAnswers" type="button" class="btn btn--secondary">Edit my answers</button></div>';
      $('questionFlow').firstElementChild.focus();$('removeResearch').hidden=false;$('editResearchAnswers').onclick=()=>start(questionnaire.id,game.id);
    }});
    const url=new URL(location.href);url.searchParams.set('form',questionnaire.id);url.searchParams.set('game',game.id);history.replaceState(null,'',url);
  }catch(error){if(version===epoch){$('researchMessage').textContent=error.message;$('retryResearch').hidden=false;$('researchUnavailable').hidden=false;if($('researchSession').hidden)$('researchPicker').hidden=true;}}
  finally{if(version===epoch)selectedGame();}
}
$('researchImage').addEventListener('error',()=>{$('researchImage').hidden=true;});
$('researchPicker').addEventListener('submit',event=>{event.preventDefault();start($('researchFormSelect').value,$('researchGame').value);});
$('researchCategory').addEventListener('change',()=>{options();gameOptions();});
$('researchFormSelect').addEventListener('change',gameOptions);
$('researchGameSearch').addEventListener('input',gameOptions);
$('researchGame').addEventListener('change',selectedGame);
$('changeResearch').addEventListener('click',()=>{epoch++;$('researchSession').hidden=true;const url=new URL(location.href);url.searchParams.delete('game');history.replaceState(null,'',url);params.delete('game');boot(false);});
$('removeResearch').addEventListener('click',async event=>{const {game,questionnaire}=current;event.currentTarget.disabled=true;try{await request(`/research/${questionnaire.id}/responses?game=${game.id}`,{method:'DELETE',feedbackKey:editKey(false)});$('removeResearch').hidden=true;await start(questionnaire.id,game.id);$('researchMessage').textContent='Your answers were removed.';}catch(error){$('researchMessage').textContent=error.message;}finally{$('removeResearch').disabled=false;}});
async function boot(direct=true){
  if(booting)return;booting=true;$('researchPicker').hidden=false;$('researchPickerFields').disabled=true;$('researchPicker').setAttribute('aria-busy','true');$('researchUnavailable').hidden=true;$('retryResearch').disabled=true;$('researchMessage').textContent='Loading quick reviews…';
  try{
    const result=await request('/research');forms=result.questionnaires;
    if(!forms.length)throw new Error('There are no open questionnaires right now. Please check back soon.');
    $('researchCategory').innerHTML='<option value="">All topics</option>'+result.categories.map(category=>`<option>${e(category)}</option>`).join('');options();
    if(direct&&params.get('game'))await start(params.get('form')||'playtest',params.get('game'));
    else {await loadGames();$('researchMessage').textContent='';}
    $('researchPickerFields').disabled=false;
  }catch(error){$('researchPicker').hidden=true;$('researchUnavailable').hidden=false;$('researchMessage').textContent=error.code==='SERVICE_UNAVAILABLE'?'':error.message;}
  finally{booting=false;$('researchPicker').setAttribute('aria-busy','false');$('retryResearch').disabled=false;}
}
$('retryResearch').addEventListener('click',()=>boot());
await boot();
if(embedded&&window.parent!==window){
  let origin=location.origin;
  try{const value=params.get('parentOrigin');if(value&&new URL(value).protocol==='https:')origin=new URL(value).origin;}catch{}
  new ResizeObserver(()=>window.parent.postMessage({type:'playtrace:research-height',height:document.documentElement.scrollHeight},origin)).observe(document.body);
}
