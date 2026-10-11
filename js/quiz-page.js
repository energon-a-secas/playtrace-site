import { bindQuiz } from './quiz.js';

bindQuiz();

if (new URL(location.href).searchParams.get('embed') === '1') document.body.classList.add('research-embedded');
