import { request, apiConfigured } from './api.js';
import { editKey, keyPersists } from './guest-key.js';
import { escHtml as e } from './utils.js';
import { dateLabel } from './collection.js';
import { interestOptions, expectationOptions } from './expectation-options.js';

let root,gameId='',generation=0,entry=null,draft=null,mode='first-look',busy=false,message='',failed=false;
function valid(value){return value===null||value&&Number.isInteger(value.firstInterest)&&value.firstInterest>=1&&value.firstInterest<=5
  &&Number.isSafeInteger(value.revision)&&value.revision>0&&Number.isFinite(Date.parse(value.firstAt))
  &&(value.playedInterest===null||Number.isInteger(value.playedInterest)&&value.playedInterest>=1&&value.playedInterest<=5&&Object.hasOwn(expectationOptions,value.expectation));}
function paint(){
  if(!root)return;
  const open=root.querySelector('details')?.open||false,disabled=busy||failed||!apiConfigured;
  root.innerHTML=`<details class="expectation-followup"${open?' open':''}><summary>${entry?.playedAt?'Your before & after comparison':entry?'Played it since your first impression?':'Compare your first impression after playing'}</summary>
    <p class="field__hint">${entry?`First impression saved ${e(dateLabel(entry.firstAt))}. ${entry.playedAt?'You can edit the follow-up or remove this comparison.':'Return from this browser after trying the game.'}`:'Save how interested you are before playing, then come back to compare. Optional, with no account needed.'}</p>
    ${mode==='saved'?`<p>${entry?.playedAt?`After playing: ${e(expectationOptions[entry.expectation])}.`:'Your first impression is saved.'}</p><div class="expectation-actions"><button class="btn btn--secondary btn--sm" type="button" data-expectation-action="followup"${disabled?' disabled':''}>${entry?.playedAt?'Edit follow-up':'I’ve played it · Add follow-up'}</button>${!entry?.playedAt?'<button class="text-button" type="button" data-expectation-action="edit">Edit first impression</button>':''}</div>`:
    `<form id="expectationForm"><p class="eyebrow">${mode==='after-play'?'AFTER PLAYING':'BEFORE PLAYING'}</p><fieldset class="expectation-question"${disabled?' disabled':''}><legend>How interested are you in this game?</legend><div class="expectation-options">${interestOptions.map((label,i)=>`<label><input type="radio" name="interest" value="${i+1}" required${(draft?.interest??(mode==='first-look'?entry?.firstInterest:entry?.playedInterest))===i+1?' checked':''}><span><strong>${i+1}</strong>${e(label)}</span></label>`).join('')}</div></fieldset>
    ${mode==='after-play'?`<fieldset class="expectation-question"${disabled?' disabled':''}><legend>Did it match your expectations?</legend><div class="expectation-options expectation-options--outcomes">${Object.entries(expectationOptions).map(([id,label])=>`<label><input type="radio" name="expectation" value="${id}" required${(draft?.expectation??entry?.expectation)===id?' checked':''}><span>${e(label)}</span></label>`).join('')}</div></fieldset>`:''}
    <p class="field__hint">Your answers contribute to public, grouped statistics. ${keyPersists()?'You can edit or remove them here from this browser.':'This browser cannot keep an edit key after this visit.'} Playing is self-reported.</p>
    <button class="btn btn--secondary btn--sm" type="submit"${disabled?' disabled':''}>${busy?'Saving…':mode==='after-play'?'Save follow-up':'Save first impression'}</button></form>`}
    ${entry?`<button class="text-button expectation-remove" type="button" data-expectation-action="remove"${disabled?' disabled':''}>Remove my comparison</button>`:''}
    <p class="action-message" role="status">${e(message)}</p>${failed?'<button class="text-button" type="button" data-expectation-action="retry">Try again</button>':''}</details>`;
}
export function clearExpectations(){generation++;gameId='';entry=null;draft=null;message='';failed=false;busy=false;if(root)root.replaceChildren();}
export async function loadExpectations(id){
  if(!root)return;
  const version=++generation;gameId=id;entry=null;draft=null;mode='first-look';message='';failed=false;
  const key=editKey();busy=Boolean(key);paint();if(!key)return;
  try{const data=await request(`/games/${id}/expectations`,{feedbackKey:key});if(version!==generation)return;
    if(data.gameId!==id||!valid(data.entry))throw new Error('Your comparison could not be read.');entry=data.entry;mode=entry?'saved':'first-look';
  }catch(error){if(version===generation){failed=true;message=error.message;}}
  finally{if(version===generation){busy=false;paint();}}
}
async function save(body,remove=false){
  if(busy||failed||!gameId||!apiConfigured)return;
  const version=generation,id=gameId;busy=true;message='';draft=body;paint();
  try{const data=await request(`/games/${id}/expectations`,{method:remove?'DELETE':'PUT',feedbackKey:editKey(true),...(remove?{}:{body})});if(version!==generation)return;
    draft=null;
    if(remove){entry=null;mode='first-look';message='Your comparison was removed.';}
    else{if(data.gameId!==id||!valid(data.entry)||!data.entry)throw new Error('The saved comparison could not be read.');entry=data.entry;mode='saved';message=entry.playedAt?'Follow-up saved. Thanks for coming back.':'First impression saved. Come back after playing.';}
  }catch(error){if(version===generation){message=error.message;if(error.status===409)failed=true;}}
  finally{if(version===generation){busy=false;paint();root.querySelector(failed?'[data-expectation-action="retry"]':mode==='saved'?'[data-expectation-action="followup"]':'input')?.focus({preventScroll:true});}}
}
export function bindExpectations(node){
  root=node;if(!root)return;
  root.addEventListener('submit',event=>{event.preventDefault();const form=new FormData(event.target);
    save({phase:mode,interest:Number(form.get('interest')),revision:entry?.revision||0,...(mode==='after-play'?{expectation:form.get('expectation')}:{})});
  });
  root.addEventListener('click',event=>{
    const action=event.target.closest('[data-expectation-action]')?.dataset.expectationAction;if(!action||busy)return;
    if(action==='retry')return loadExpectations(gameId);
    if(action==='remove')return save(null,true);
    if(failed)return;
    mode=action==='followup'?'after-play':'first-look';draft=null;paint();root.querySelector('input')?.focus();
  });
}
