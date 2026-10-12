// Stable IDs are shared by the public form, aggregates, and API validation.
export const feedbackQuestions = Object.freeze([
  { id: 'highlights', title: 'What catches your eye?', options: [
    { id: 'idea', label: 'The idea' }, { id: 'visuals', label: 'Art & style' },
    { id: 'gameplay', label: 'The gameplay' }, { id: 'world', label: 'The world' },
    { id: 'sound', label: 'Music & sound' },
  ] },
  { id: 'next', title: 'What would help it shine?', options: [
    { id: 'guidance', label: 'Clearer first steps' }, { id: 'controls', label: 'Smoother controls' },
    { id: 'performance', label: 'Better performance' }, { id: 'content', label: 'More to explore' },
    { id: 'accessibility', label: 'Accessibility options' },
  ] },
]);
export const feedbackOptions = feedbackQuestions.flatMap(question => question.options);
export const feedbackExperiences = Object.freeze({ unspecified: 'Not specified', preview: 'First look', played: 'I’ve played it' });
export function validChoices(value) {
  return Array.isArray(value) && value.length <= feedbackOptions.length && new Set(value).size === value.length
    && value.every(id => feedbackOptions.some(option => option.id === id));
}
