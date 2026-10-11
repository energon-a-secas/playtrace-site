export const researchCategories = Object.freeze(['First impressions', 'Controls & feel', 'Difficulty', 'Accessibility', 'Link health', 'Custom']);
export const defaultQuestions = Object.freeze([
  { id: 'access', type: 'single', title: 'Were you able to try the game?', options: ['Yes, it works', 'The link is broken', 'The page works, but there is no playable build', 'I haven’t tried it yet'] },
  { id: 'experience', type: 'single', title: 'How much have you explored?', options: ['Just the screenshots', 'A few minutes', 'A full session', 'I keep coming back'] },
  { id: 'highlights', type: 'multi', title: 'What made you curious?', options: ['The idea', 'Visuals & atmosphere', 'Controls & game feel', 'Story & characters', 'The challenge', 'Still finding out'] },
  { id: 'improve', type: 'multi', title: 'What would help the next version?', options: ['Clearer instructions', 'Smoother performance', 'More accessible controls', 'Better pacing', 'More to discover', 'Nothing comes to mind'] },
  { id: 'note', type: 'text', title: 'One thing you would tell the maker?', options: [] },
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
