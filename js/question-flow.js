import { escHtml as e } from './utils.js';

// A reusable, dependency-free one-question-at-a-time surface.
export function questionFlow(root, { questions, answers = {}, onComplete }) {
  let step = 0, pending = false;
  const values = structuredClone(answers);
  const saveCurrent = () => {
    const q=questions[step];
    if(q.type==='text')values[q.id]=root.querySelector('textarea').value.trim();
    else { const checked=[...root.querySelectorAll('input:checked')].map(input=>Number(input.value));values[q.id]=q.type==='multi'?checked:checked[0]??null; }
  };
  function paint(focus = true) {
    const q=questions[step],value=values[q.id];
    root.innerHTML=`<div class="question-progress"><span>Question ${step+1} of ${questions.length}</span><progress max="${questions.length}" value="${step+1}" aria-label="Question ${step+1} of ${questions.length}"></progress></div>
      <form class="question-slide"><fieldset><legend tabindex="-1">${e(q.title)}</legend><p class="field__hint">${q.type==='multi'?'Choose any that fit.':q.type==='text'?'Optional. A specific moment is especially useful.':'Choose one, or skip if you’re unsure.'}</p>
      ${q.type==='text'?`<label class="sr-only" for="question-note">${e(q.title)}</label><textarea class="input" id="question-note" rows="5" maxlength="1500" placeholder="Tell us what stood out…">${e(value||'')}</textarea>`:`<div class="question-options">${q.options.map((option,index)=>`<label><input type="${q.type==='multi'?'checkbox':'radio'}" name="answer" value="${index}" ${(Array.isArray(value)?value.includes(index):value===index)?'checked':''}><span>${e(option)}</span></label>`).join('')}</div>`}</fieldset>
      <div class="question-navigation"><button type="button" class="btn btn--secondary" data-back ${step?'':'disabled'}>Back</button><button type="button" class="text-button" data-skip>Skip</button><button type="submit" class="btn btn--primary">${step===questions.length-1?'Save review':'Next'} <span aria-hidden="true">→</span></button></div><p class="question-message" role="status"></p></form>`;
    root.querySelector('[data-back]').onclick=()=>{saveCurrent();step--;paint();};
    root.querySelector('[data-skip]').onclick=()=>{values[q.id]=null;advance();};
    root.querySelector('form').onsubmit=event=>{event.preventDefault();saveCurrent();advance();};
    if(focus)root.querySelector('legend').focus();
  }
  async function advance(){
    if(pending)return;
    if(step<questions.length-1){step++;paint();return;}
    pending=true;root.querySelectorAll('button,input,textarea').forEach(node=>node.disabled=true);
    try{await onComplete(values);}catch(error){root.querySelector('.question-message').textContent=error.message;root.querySelectorAll('button,input,textarea').forEach(node=>node.disabled=false);}
    finally{pending=false;}
  }
  paint(false);
  return { answers: values };
}
