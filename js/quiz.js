import { apiConfigured, request } from './api.js';
import { editKey } from './guest-key.js';
import { createQuizImages } from './quiz-images.js';
import { safeUrl } from './collection.js';
import { $, escHtml as e } from './utils.js';

let info=null, round=null, result=null, answers=[], index=0, busy=false, roundId=null;
let ready=false, failed=false, imageRun=0, expired=false;
const images=createQuizImages();
const gameId=/^g_[a-z0-9]{5,12}$/;
const imageHosts=['preview.redd.it','external-preview.redd.it','i.redd.it','img.itch.zone','demos.tahazsh.com'];
function validRound(value) {
  try {
    return value?.id===roundId && Number.isFinite(Date.parse(value.expiresAt)) && Array.isArray(value.questions) && value.questions.length===5
      && value.questions.every((q,i)=>q.index===i && imageHosts.includes(new URL(safeUrl(q.image)).hostname)
        && (!q.fallbackImage || imageHosts.includes(new URL(safeUrl(q.fallbackImage)).hostname))
        && Number.isFinite(q.trimTop) && q.trimTop>=0 && q.trimTop<=0.15
        && typeof q.alt==='string' && q.alt.length<=300 && Array.isArray(q.choices) && q.choices.length===4
        && new Set(q.choices.map(c=>c.id)).size===4 && q.choices.every(c=>gameId.test(c.id) && typeof c.title==='string' && c.title.length>0 && c.title.length<=48));
  } catch { return false; }
}
function validResult(value) {
  try {
    return value?.id===roundId && value.saved===true && Number.isInteger(value.score) && Number.isInteger(value.answered)
      && value.score>=0 && value.score<=value.answered && value.answered<=5 && value.answered>=0
      && Array.isArray(value.results) && value.results.length===5 && value.results.every((r,i)=>r.index===i && gameId.test(r.gameId)
        && typeof r.title==='string' && r.title.length<=48 && safeUrl(r.projectUrl) && (r.choice===null || typeof r.choice==='string' && r.choice.length<=48)
        && typeof r.correct==='boolean' && Number.isInteger(r.recognition?.attempts) && Number.isInteger(r.recognition?.correct)
        && r.recognition.correct>=0 && r.recognition.correct<=r.recognition.attempts);
  } catch { return false; }
}
function message(text) { $('quizMessage').textContent=text; }
function controls() {
  $('quizStart').disabled=busy || !info?.available;
  $('quizStart').textContent=result ? 'See your results' : round ? 'Continue round' : 'Play five screenshots';
  $('quizDelete').hidden=!editKey(); $('quizDelete').disabled=busy;
  $('quizClose').disabled=busy;
  const next=$('quizNext');
  if(next) {
    next.disabled=busy || expired || !ready || !answers[index]?.choiceId;
    next.textContent=busy ? 'Saving your round…' : index===4 ? 'Reveal my score' : 'Next screenshot →';
    $('quizBack').disabled=busy || index===0 || expired;
    $('quizSkip').disabled=busy || expired;
    $('quizSkip').textContent=failed ? 'Skip unavailable image →' : 'Skip this one →';
    for(const input of document.querySelectorAll('input[name="quizChoice"]')) input.disabled=busy || !ready || expired;
    $('quizImageRetry').disabled=busy;
  }
}
async function loadInfo() {
  if(!apiConfigured) { message('The screenshot game needs a connection. You can still explore the collection.'); return; }
  try {
    const value=await request('/quiz');
    if(!Number.isInteger(value.poolSize)||value.poolSize<0||value.poolSize>20||value.roundSize!==5||typeof value.available!=='boolean') throw new Error('The game selection could not be loaded.');
    info=value; $('quizPoolNote').textContent=`Five screenshots, ${info.poolSize} playable community games. Which names ring a bell?`;
    message(info.available ? '' : 'The next set of games is being prepared. Check back soon.');
  } catch { message('The screenshot game could not connect. Try again.'); $('quizConnectRetry').hidden=false; }
  controls();
}
async function start() {
  if(busy||!info?.available)return;
  $('quizPanel').hidden=false; $('quizStart').hidden=true;
  if(result){paintResult();return;}
  if(round){paintQuestion();return;}
  busy=true; expired=false; roundId ||= crypto.randomUUID(); controls(); message('Shuffling five screenshots…');
  try {
    const value=await request('/quiz/rounds',{method:'POST',feedbackKey:editKey(true),body:{id:roundId}});
    if(!validRound(value))throw new Error('The screenshots could not be read. Try again.');
    round=value;document.dispatchEvent(new CustomEvent('quiz-started'));answers=[];index=0;message('');paintQuestion();
  } catch(error) {
    if([409,410].includes(error.status))roundId=null;
    message(error.message);$('quizStart').hidden=false;$('quizPanel').hidden=true;
  } finally {busy=false;controls();}
}
function paintQuestion(retry=false) {
  if(!round)return;
  const current=++imageRun;ready=false;failed=false;
  const question=round.questions[index];
  $('quizBody').innerHTML=`<div class="quiz-progress" aria-label="Question ${index+1} of 5">${round.questions.map((_,i)=>`<span class="${i===index?'is-current':answers[i]?'is-done':''}"${i===index?' aria-current="step"':''}>${i+1}</span>`).join('')}<span class="quiz-progress__label">${index+1} / 5</span></div>
    <div class="quiz-layout quiz-question"><figure class="quiz-frame"><div id="quizImageSlot"></div><figcaption id="quizImageStatus" role="status">Loading screenshot…</figcaption><button id="quizImageRetry" type="button" class="btn btn--secondary" hidden>Retry image</button></figure>
    <form id="quizAnswer"><fieldset><legend id="quizQuestion" tabindex="-1">Which game is this?</legend><p class="field__hint">One pick. The names are revealed after all five.</p><div class="quiz-choices">${question.choices.map((choice,i)=>`<label class="quiz-choice"><input type="radio" name="quizChoice" value="${e(choice.id)}" ${answers[index]?.choiceId===choice.id?'checked':''}><span><span class="quiz-choice__letter" aria-hidden="true">${'ABCD'[i]}</span>${e(choice.title)}<span class="quiz-choice__mark" aria-hidden="true">✓</span></span></label>`).join('')}</div></fieldset><button class="btn btn--primary" id="quizNext" type="submit">Next screenshot →</button><div class="quiz-question-tools"><button class="text-button" id="quizBack" type="button">← Back</button><button class="text-button" id="quizSkip" type="button">Skip this one →</button></div></form></div>`;
  const entry=images.get(question,{retry});
  const image=entry.image;
  image.id='quizImage';image.alt=question.alt;image.style.setProperty('--clue-trim-top',`${question.trimTop*100}%`);
  image.hidden=false;$('quizImageSlot').replaceWith(image);
  const loaded=()=>{
    if(current!==imageRun)return;
    ready=true;failed=false;image.hidden=false;$('quizImageStatus').hidden=true;$('quizImageRetry').hidden=true;controls();
    images.preload(round.questions[index+1]);
  };
  const failure=()=>{
    if(current!==imageRun)return;
    failed=true;ready=false;image.hidden=true;$('quizImageStatus').hidden=false;
    $('quizImageStatus').textContent='This screenshot couldn’t load. You can retry or skip it without affecting recognition stats.';
    $('quizImageRetry').hidden=false;controls();
  };
  if(entry.state==='ready')loaded();else entry.loaded.then(loaded,failure);
  $('quizImageRetry').addEventListener('click',()=>paintQuestion(true));
  $('quizAnswer').addEventListener('change',event=>{if(!ready||busy||expired)return;const id=event.target.value;
    if(question.choices.some(choice=>choice.id===id)){answers[index]={index,choiceId:id,skippedReason:null};controls();}});
  $('quizAnswer').addEventListener('submit',event=>{event.preventDefault();if(!busy&&ready&&answers[index]?.choiceId&&!expired)advance();});
  $('quizBack').addEventListener('click',()=>{if(busy||expired||index===0)return;index--;message('');paintQuestion();});
  $('quizSkip').addEventListener('click',()=>{if(busy||expired)return;answers[index]={index,choiceId:null,skippedReason:failed?'image-unavailable':'skip'};advance();});
  $('quizQuestion').focus({preventScroll:true});$('quizPanel').scrollIntoView({block:'nearest'});controls();
}
async function advance() {
  message('');
  if(index<4){index++;paintQuestion();return;}
  busy=true;controls();
  try {
    const value=await request(`/quiz/rounds/${round.id}`,{method:'PUT',feedbackKey:editKey(),body:{answers}});
    if(!validResult(value))throw new Error('Your results could not be read. Try saving the round again.');
    result=value;document.dispatchEvent(new CustomEvent('quiz-completed'));paintResult();message('Round saved. Your guesses are included in the recognition counts.');
  } catch(error) {
    if([409,410,404].includes(error.status)){expired=true;$('quizFresh').hidden=false;}
    message(error.message);
  } finally{busy=false;controls();}
}
function paintResult() {
  imageRun++;
  const scoreLine=result.answered ? `You recognized <strong>${result.score} of ${result.answered}</strong> screenshots you answered.${result.answered<5?` ${5-result.answered} skipped.`:''}` : 'All five skipped. Meet the games below, or try another round.';
  $('quizBody').innerHTML=`<div class="quiz-results-heading"><div><p class="eyebrow">THE REVEAL</p><h3 id="quizResultTitle" tabindex="-1">${result.score===5?'Five for five.':result.score===0?'Five games to get to know.':`${result.score} right. A few new names to remember.`}</h3><p>${scoreLine}</p></div><button class="btn btn--primary" id="quizAgain" type="button">Play another five</button></div>
    <ol class="quiz-results">${result.results.map(r=>`<li><span class="quiz-result-mark" aria-hidden="true">${r.correct?'✓':r.choice?'↗':'·'}</span><div><h4><a class="text-button" href="browse.html?game=${e(r.gameId)}">${e(r.title)}</a></h4><p>${r.correct?'You got it.':r.choice?`You picked ${e(r.choice)}.`:r.skippedReason==='image-unavailable'?'Image unavailable; skipped.':'Skipped.'}</p><span class="quiz-recognition">${r.recognition.attempts?`${r.recognition.correct} of ${r.recognition.attempts} community guesses recognized this game.`:'No guesses for this game yet.'}</span></div><a class="text-link" href="${e(r.projectUrl)}" target="_blank" rel="noopener noreferrer" aria-label="Try ${e(r.title)} (opens in a new tab)">Try it ↗</a></li>`).join('')}</ol><p class="quiz-fine-print">These are screenshot guesses, not reviews or ratings. Counts include completed rounds and exclude skipped images.</p>`;
  $('quizAgain').addEventListener('click',fresh);$('quizResultTitle').focus({preventScroll:true});$('quizPanel').scrollIntoView({block:'nearest'});
}
function fresh(){if(busy)return;images.clear();round=null;roundId=null;result=null;answers=[];expired=false;$('quizFresh').hidden=true;start();}
async function removeData() {
  if(busy||!editKey())return;busy=true;controls();
  try{
    await request('/quiz/rounds/mine',{method:'DELETE',feedbackKey:editKey()});
    imageRun++;images.clear();round=null;roundId=null;result=null;answers=[];expired=false;
    $('quizPanel').hidden=true;$('quizBody').replaceChildren();$('quizStart').hidden=false;$('quizFresh').hidden=true;
    message('Your quiz answers from this browser have been removed from the counts.');$('quizStart').focus();
  }catch(error){message(error.message);}finally{busy=false;controls();}
}
export function bindQuiz() {
  $('quizStart').addEventListener('click',start);$('quizFresh').addEventListener('click',fresh);
  $('quizClose').addEventListener('click',()=>{if(busy)return;imageRun++;$('quizPanel').hidden=true;$('quizStart').hidden=false;controls();$('quizStart').focus();});
  $('quizConnectRetry').addEventListener('click',()=>{$('quizConnectRetry').hidden=true;loadInfo();});
  $('quizDelete').addEventListener('click',removeData);controls();loadInfo();
}
