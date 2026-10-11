import { restoreLocation, loadCatalog, loadService, state } from './state.js';
import { render } from './render.js';
import { bindEvents, navigation, catalogueReady } from './events.js';
import { startAccounts } from './accounts.js';
import { renderFeedback } from './feedback.js';
import { bindQuiz } from './quiz.js';

restoreLocation();
navigation.replace();
bindEvents();
render();
// Public metadata starts loading before any account service.
loadCatalog(catalogueReady);
bindQuiz();
loadService(() => { render(); renderFeedback(); });
startAccounts(render);
