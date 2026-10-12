import { CONFIG } from './config.js';
const key='playtrace.metrics.optout',allowed=['home','browse','game','research','quiz','about','directory','insights'];
const page=document.body.dataset.page,queue=[];let timer,sending=false;
export function measurementEnabled(){
  try{return navigator.doNotTrack!=='1'&&navigator.globalPrivacyControl!==true&&localStorage.getItem(key)!=='1';}catch{return false;}
}
export function measure(event,gameId=null){
  if(!allowed.includes(page)||!measurementEnabled()||queue.length>=100||!CONFIG.apiBase)return;
  queue.push({id:crypto.randomUUID(),event,page,gameId});clearTimeout(timer);timer=setTimeout(flush,1500);
}
async function flush(){
  if(sending||!queue.length||!measurementEnabled())return;
  sending=true;const batch=queue.slice(0,10);
  try{
    const response=await fetch(CONFIG.apiBase+'/usage',{method:'POST',mode:'cors',credentials:'omit',headers:{'Content-Type':'application/json'},body:JSON.stringify({events:batch}),keepalive:true});
    if(response.ok||[400,403,429].includes(response.status))queue.splice(0,batch.length);
  }catch{/* Aggregate counts can miss offline visits; discovery never waits for them. */}
  finally{sending=false;if(queue.length&&navigator.onLine)timer=setTimeout(flush,15000);}
}
document.addEventListener('click',event=>{const link=event.target.closest('a[data-game-outbound]');if(link)measure('game_outbound',link.dataset.gameOutbound);});
for(const [name,event]of [['game-viewed','game_view'],['feedback-saved','feedback_save'],['research-started','research_start'],['research-completed','research_complete'],['quiz-started','quiz_start'],['quiz-completed','quiz_complete']])document.addEventListener(name,value=>measure(event,value.detail?.gameId||null));
document.addEventListener('favorite-changed',event=>measure(event.detail.saved?'favorite_save':'favorite_remove',event.detail.gameId));
document.addEventListener('rating-saved',event=>{if(!event.detail.removed)measure('rating_save',event.detail.gameId);});
document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='hidden')flush();});addEventListener('pagehide',flush);addEventListener('online',flush);
const control=document.getElementById('allowMeasurement');
if(control){control.checked=measurementEnabled();control.disabled=navigator.doNotTrack==='1'||navigator.globalPrivacyControl===true;control.addEventListener('change',()=>{try{localStorage.setItem(key,control.checked?'0':'1');if(!control.checked){queue.length=0;clearTimeout(timer);}}catch{control.checked=false;}});}
measure('page_view');
