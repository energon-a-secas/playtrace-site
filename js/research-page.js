import { request } from './api.js';
import { editKey } from './guest-key.js';
import { $, escHtml as e } from './utils.js';
import { validateCatalog, safeUrl } from './collection.js';
import { questionFlow } from './question-flow.js';
import { NeoAuth } from './neorgon-auth.js';

const params=new URL(location.href).searchParams;
let forms=[],games=[],current=null,loaded=false,epoch=0;
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
  $('researchGameCount').textContent=matching.length>100?'Showing the first 100 matches. Type a name to narrow the list.':`${matching.length} projects available`;
}
async function loadGames(){
  if(loaded)return;let cursor='';
  do{const page=validateCatalog(await request(`/catalog?pageSize=200${cursor?`&cursor=${encodeURIComponent(cursor)}`:''}`));games.push(...page.games);cursor=page.pagination?.nextCursor;gameOptions();}while(cursor);
  loaded=true;
}
async function start(formId,gameId){
  const version=++epoch;$('researchMessage').textContent='Loading your playtest…';
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
      $('questionFlow').innerHTML='<div class="research-thanks" tabindex="-1"><span aria-hidden="true">✓</span><h3>That helps the next version.</h3><p>Your playtest is saved for the editorial team. Thanks for taking a closer look.</p><button id="editResearchAnswers" type="button" class="btn btn--secondary">Edit my answers</button></div>';
      $('questionFlow').firstElementChild.focus();$('removeResearch').hidden=false;$('editResearchAnswers').onclick=()=>start(questionnaire.id,game.id);
    }});
    const url=new URL(location.href);url.searchParams.set('form',questionnaire.id);url.searchParams.set('game',game.id);history.replaceState(null,'',url);
  }catch(error){if(version===epoch)$('researchMessage').textContent=error.message;}
}
$('researchImage').addEventListener('error',()=>{$('researchImage').hidden=true;});
$('researchPicker').addEventListener('submit',event=>{event.preventDefault();start($('researchFormSelect').value,$('researchGame').value);});
$('researchCategory').addEventListener('change',()=>{options();gameOptions();});
$('researchFormSelect').addEventListener('change',gameOptions);
$('researchGameSearch').addEventListener('input',gameOptions);
$('changeResearch').addEventListener('click',()=>{epoch++;$('researchPicker').hidden=false;$('researchSession').hidden=true;loadGames().catch(error=>$('researchMessage').textContent=error.message);});
$('removeResearch').addEventListener('click',async event=>{const {game,questionnaire}=current;event.currentTarget.disabled=true;try{await request(`/research/${questionnaire.id}/responses?game=${game.id}`,{method:'DELETE',feedbackKey:editKey(false)});$('removeResearch').hidden=true;await start(questionnaire.id,game.id);$('researchMessage').textContent='Your answers were removed.';}catch(error){$('researchMessage').textContent=error.message;}finally{$('removeResearch').disabled=false;}});
try{
  const result=await request('/research');forms=result.questionnaires;
  $('researchCategory').innerHTML='<option value="">All research topics</option>'+result.categories.map(category=>`<option>${e(category)}</option>`).join('');options();
  if(params.get('game'))await start(params.get('form')||'playtest',params.get('game'));else await loadGames();
}catch(error){$('researchMessage').textContent=error.message;}
if(embedded&&window.parent!==window){
  let origin=location.origin;
  try{const value=params.get('parentOrigin');if(value&&new URL(value).protocol==='https:')origin=new URL(value).origin;}catch{}
  new ResizeObserver(()=>window.parent.postMessage({type:'playtrace:research-height',height:document.documentElement.scrollHeight},origin)).observe(document.body);
}
