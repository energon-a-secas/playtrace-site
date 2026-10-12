export const researchCategories = Object.freeze(['First impressions', 'Controls & feel', 'Difficulty', 'Accessibility', 'Link health', 'Custom']);
export const defaultQuestions = Object.freeze([
  { id: 'access', type: 'single', title: 'Were you able to try the game?', options: ['Yes, it works', 'The link is broken', 'The page works, but there is no playable build', 'I haven’t tried it yet'] },
  { id: 'experience', type: 'single', title: 'How much have you explored?', options: ['Just the screenshots', 'A few minutes', 'A full session', 'I keep coming back'] },
  { id: 'highlights', type: 'multi', title: 'What made you curious?', options: ['The idea', 'Visuals & atmosphere', 'Controls & game feel', 'Story & characters', 'The challenge', 'Still finding out'] },
  { id: 'improve', type: 'multi', title: 'What would help the next version?', options: ['Clearer instructions', 'Smoother performance', 'More accessible controls', 'Better pacing', 'More to discover', 'Nothing comes to mind'] },
  { id: 'note', type: 'text', title: 'One thing you would tell the maker?', options: [] },
]);
export const builtInQuestionnaires = Object.freeze([
  {id:'playtest',title:'A quick playtest',category:'First impressions',questions:defaultQuestions},
  {id:'difficulty',title:'Finding the right challenge',category:'Difficulty',questions:[
    {id:'experience',type:'single',title:'How far did you get?',options:['I haven’t played yet','Just starting','A few sessions','Finished the available content']},
    {id:'challenge',type:'single',title:'How did the challenge feel?',options:['Too easy','Comfortable','Challenging in a good way','Too difficult','It changed a lot','Not enough play time to say']},
    {id:'friction',type:'multi',title:'What made progress difficult?',options:['Working out what to do','Learning the controls','Timing or precision','Understanding a mechanic','Long waits or repeated steps','Nothing stood out']},
    {id:'retry',type:'single',title:'After a setback, did you want another try?',options:['Yes, right away','After a short break','I stopped playing','I haven’t had a setback']},
    {id:'note',type:'text',title:'Where should the maker take a closer look?',options:[]},
  ]},
  {id:'controls',title:'Controls and game feel',category:'Controls & feel',questions:[
    {id:'input',type:'single',title:'How did you play?',options:['Keyboard and mouse','Controller','Touchscreen','Another input','I haven’t played yet']},
    {id:'response',type:'single',title:'Did the game react as you expected?',options:['Consistently','Most of the time','Sometimes','Rarely','Not enough play time to say']},
    {id:'friction',type:'multi',title:'What would make it feel better?',options:['Clearer controls','Remappable inputs','More responsive movement','Better camera behavior','Stronger sound or visual feedback','It feels good already']},
    {id:'note',type:'text',title:'Describe one moment that felt great or awkward.',options:[]},
  ]},
  {id:'accessibility',title:'Making the game easier to access',category:'Accessibility',questions:[
    {id:'readability',type:'single',title:'Could you read and follow what was happening?',options:['Easily','Mostly','With difficulty','I couldn’t','I haven’t played yet']},
    {id:'support',type:'multi',title:'Which options would help you play?',options:['Larger text or clearer contrast','Subtitles or visual sound cues','Remappable controls','Reduced motion or flashing','Adjustable speed or difficulty','Color-independent cues','No additional options right now']},
    {id:'barrier',type:'single',title:'Did anything prevent you from continuing?',options:['Yes','No','I haven’t tried enough to say']},
    {id:'note',type:'text',title:'What should the maker know about that barrier?',options:[]},
  ]},
  {id:'link-health',title:'Can you get into the game?',category:'Link health',questions:[
    {id:'destination',type:'single',title:'What happened when you opened the game link?',options:['The expected game page opened','It opened a different page','I saw an error','Access was blocked','I haven’t opened it yet']},
    {id:'build',type:'single',title:'Could you start playing?',options:['Yes, in the browser','Yes, after downloading','No, there is no available build','The build failed to start','I haven’t tried']},
    {id:'device',type:'single',title:'What device were you using?',options:['Windows','macOS','Linux','Android','iPhone or iPad','Other']},
    {id:'note',type:'text',title:'Any error message or detail that would help?',options:[]},
  ]},
]);
export function validQuestions(questions) {
  if (!Array.isArray(questions) || questions.length < 1 || questions.length > 5) return false;
  const ids = new Set();
  return questions.every(q => {
    if (!q || Object.keys(q).sort().join(',') !== 'id,options,title,type' || !/^[a-z][a-z0-9-]{0,39}$/.test(q.id) || ids.has(q.id)) return false;
    ids.add(q.id);
    if (!['single','multi','text'].includes(q.type) || typeof q.title !== 'string' || !q.title.trim() || q.title.length > 180 || /[\x00-\x1f<>]/.test(q.title)) return false;
    return Array.isArray(q.options) && (q.type === 'text' ? !q.options.length : q.options.length >= 2 && q.options.length <= 8)
      && new Set(q.options.map(x => typeof x === 'string' ? x.toLowerCase() : '')).size === q.options.length
      && q.options.every(x => typeof x === 'string' && x.trim().length > 0 && x.length <= 100 && !/[\x00-\x1f<>]/.test(x));
  });
}
export function validAnswers(questions, answers) {
  if (!answers || typeof answers !== 'object' || Array.isArray(answers) || Object.keys(answers).some(id => !questions.some(q => q.id === id))) return false;
  return questions.every(q => {
    const value = answers[q.id];
    if (value === undefined || value === null) return true;
    if (q.type === 'text') return typeof value === 'string' && value.length <= 1500 && !/[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]/.test(value);
    if (q.type === 'single') return Number.isInteger(value) && value >= 0 && value < q.options.length;
    return Array.isArray(value) && value.length <= q.options.length && new Set(value).size === value.length && value.every(n => Number.isInteger(n) && n >= 0 && n < q.options.length);
  });
}
