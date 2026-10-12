import { request } from './api.js';
import { editKey } from './guest-key.js';
import { icon } from './icons.js';

export function ratingControl(element) {
  let gameId='',version=0,value=null,busy=false,controller;
  const message=text=>{element.querySelector('[role=status]').textContent=text;};
  function valid(result) {
    if(result?.gameId!==gameId||!Number.isInteger(result.count)||result.count<0
      ||(result.count ? !Number.isFinite(result.average)||result.average<1||result.average>5 : result.average!==null)
      ||(result.mine!==null&&(!Number.isInteger(result.mine)||result.mine<1||result.mine>5))) throw new Error('The rating could not be read.');
    return result;
  }
  function paint(){
    element.innerHTML=`<div class="rating-stars" role="radiogroup" aria-label="Rate this game">${[1,2,3,4,5].map(n=>`<button type="button" role="radio" aria-checked="${value?.mine===n}" tabindex="${n===(value?.mine||1)?0:-1}" data-rating="${n}" class="${n<=(value?.mine||0)?'is-filled':''}" aria-label="${n} ${n===1?'star':'stars'}" title="Rate ${n} ${n===1?'star':'stars'}" ${busy?'disabled':''}>${icon('star')}</button>`).join('')}</div>${value?.count?`<small class="rating-average" aria-label="Average ${value.average.toFixed(1)} out of 5 from ${value.count} ratings">${value.average.toFixed(1)} <span>(${value.count})</span></small>`:''}<button type="button" class="text-button" data-remove-rating ${value?.mine?'':'hidden'} ${busy?'disabled':''}>Clear rating</button><p role="status"></p>`;
  }
  async function rate(stars){
    if(busy||!gameId)return;const id=gameId,current=version;busy=true;paint();
    try {
      const result=await request(`/games/${id}/rating`,{method:stars?'PUT':'DELETE',feedbackKey:editKey(true),...(stars?{body:{stars}}:{})});
      if(current!==version)return;value=valid(result);busy=false;paint();message(stars?'Your rating is saved.':'Your rating was removed.');
      element.dispatchEvent(new CustomEvent('rating-saved',{bubbles:true,detail:{gameId:id,removed:!stars}}));
      element.querySelector(`[data-rating="${stars||1}"]`)?.focus({preventScroll:true});
    }catch(error){if(current===version){busy=false;paint();message(error.message);}}
  }
  element.addEventListener('click',event=>{const star=event.target.closest('[data-rating]');if(star)rate(Number(star.dataset.rating));else if(event.target.closest('[data-remove-rating]'))rate(null);});
  element.addEventListener('keydown',event=>{const star=event.target.closest('[data-rating]');if(!star||!['ArrowLeft','ArrowRight','ArrowUp','ArrowDown'].includes(event.key))return;event.preventDefault();rate((Number(star.dataset.rating)-1+(['ArrowRight','ArrowUp'].includes(event.key)?1:4))%5+1);});
  return {
    async load(id){
      gameId=id;const current=++version;controller?.abort();controller=new AbortController();value=null;busy=false;paint();
      try{const result=await request(`/games/${id}/rating`,{signal:controller.signal,feedbackKey:editKey(false)});if(current===version){value=valid(result);paint();}}
      catch{if(current===version)message('Ratings could not be loaded. Select a star to retry.');}
    },
    close(){version++;controller?.abort();gameId='';}
  };
}
