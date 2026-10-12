import { state } from './state.js';
import { apiConfigured, request } from './api.js';
import { parsePrice, money, dateLabel } from './collection.js';
import { $, escHtml as e } from './utils.js';
import { feedbackQuestions, feedbackOptions, feedbackExperiences, validChoices } from './feedback-options.js';
import { editKey as guestEditKey, keyPersists } from './guest-key.js';

let session = 0, readNumber = 0, controller;
const empty = () => ({ gameId: '', entries: [], count: 0, prices: null, nextCursor: null, mine: null,
  moderated: false, loading: false, busy: false, loaded: false, error: '', ownError: false, dirty: false, message: '' });
let feedback = empty();

export const editKey = guestEditKey;
function validEntry(value) {
  return value && /^[a-f0-9-]{36}$/.test(value.id) && typeof value.displayName === 'string' && value.displayName.length <= 40
    && (value.choices === undefined || validChoices(value.choices))
    && (value.experience === undefined || Object.hasOwn(feedbackExperiences,value.experience))
    && typeof value.body === 'string' && value.body.length <= 1500 && value.currency === 'USD'
    && (value.idealPriceCents === null || (Number.isInteger(value.idealPriceCents) && value.idealPriceCents >= 0 && value.idealPriceCents <= 10000))
    && typeof value.createdAt === 'string' && Number.isFinite(Date.parse(value.createdAt))
    && typeof value.updatedAt === 'string' && Number.isFinite(Date.parse(value.updatedAt));
}
function validPage(value, gameId) {
  const prices = value?.idealPrices;
  return value?.gameId === gameId && Array.isArray(value.entries) && value.entries.length <= 20 && value.entries.every(validEntry)
    && (value.choices === undefined || (Array.isArray(value.choices) && value.choices.length === feedbackOptions.length
      && new Set(value.choices.map(item => item.id)).size === feedbackOptions.length
      && value.choices.every(item => feedbackOptions.some(option => option.id === item.id) && Number.isInteger(item.count) && item.count >= 0 && item.count <= value.count)))
    && Number.isInteger(value.count) && value.count >= value.entries.length
    && (value.nextCursor === null || (typeof value.nextCursor === 'string' && value.nextCursor.length <= 200))
    && prices?.currency === 'USD' && Number.isInteger(prices.count) && prices.count >= 0 && prices.count <= value.count
    && (prices.count === 0 ? prices.medianCents === null : Number.isInteger(prices.medianCents) && prices.medianCents >= 0 && prices.medianCents <= 10000);
}
function fillOwn() {
  if (feedback.dirty) return;
  $('feedbackName').value = feedback.mine?.displayName === 'Guest' ? '' : feedback.mine?.displayName || '';
  $('feedbackBody').value = feedback.mine?.body || '';
  $('feedbackPrice').value = feedback.mine?.idealPriceCents == null ? '' : (feedback.mine.idealPriceCents / 100).toFixed(2);
  $('feedbackExtras').open = Boolean($('feedbackName').value || $('feedbackPrice').value);
  for (const option of feedbackOptions) $(`feedbackChoice-${option.id}`).checked = feedback.mine?.choices?.includes(option.id) || false;
  for (const option of Object.keys(feedbackExperiences)) $(`feedbackExperience-${option}`).checked = (feedback.mine?.experience || 'unspecified') === option;
}
export function clearFeedback() {
  session++; readNumber++; controller?.abort(); feedback = empty();
}
export function resetFeedback(gameId) {
  if (feedback.gameId === gameId) return;
  clearFeedback(); feedback.gameId = gameId; fillOwn();
  for (const id of ['feedbackBody', 'feedbackPrice']) $(id).removeAttribute('aria-invalid');
  renderFeedback();
}
function reportLink(id) {
  const url = new URL('https://balise.neorgon.com/report/');
  url.hash = encodeURIComponent(JSON.stringify({ v: 1, site: 'playtrace-site', url: location.href, target: `Public feedback ${id}` }));
  return url.href;
}
export function renderFeedback() {
  if (!$('feedbackList')) return;
  const available = apiConfigured && state.service?.capabilities?.feedback === true;
  const disabled = !available || feedback.busy || feedback.loading || feedback.ownError || feedback.moderated || (!feedback.loaded && Boolean(feedback.error));
  $('feedbackCount').textContent = feedback.loaded ? `${feedback.count} ${feedback.count === 1 ? 'contribution' : 'contributions'}` : '';
  $('feedbackList').innerHTML = feedback.entries.map(item => `<li class="feedback-note" id="feedback-${e(item.id)}">
    <div class="feedback-note__heading"><strong>${e(item.displayName)}</strong><span>${e(item.experience==='played'?'Played · self-reported':item.experience==='preview'?'First look':'Experience not specified')}</span><time datetime="${e(item.createdAt)}">${e(dateLabel(item.createdAt))}</time></div>
    ${item.body ? `<p class="feedback-note__body">${e(item.body)}</p>` : ''}
    ${(item.choices || []).length ? `<div class="feedback-note__choices">${feedbackQuestions.map(question => {
      const labels = question.options.filter(option => item.choices.includes(option.id)).map(option => e(option.label));
      return labels.length ? `<p><span>${question.id === 'highlights' ? 'Drawn to' : 'Would like'}</span> ${labels.join(' · ')}</p>` : '';
    }).join('')}</div>` : ''}
    <div class="feedback-note__foot">${item.idealPriceCents !== null ? `<span class="ideal-price-tag">Ideal price <strong>${e(money(item.idealPriceCents))}</strong></span>` : ''}
    ${item.updatedAt !== item.createdAt ? '<span>Edited</span>' : ''}
    <a class="text-link" href="${e(reportLink(item.id))}" target="_blank" rel="noopener noreferrer">Report<span class="sr-only"> feedback by ${e(item.displayName)} (opens in a new tab)</span></a></div></li>`).join('');
  $('feedbackEmpty').hidden = feedback.entries.length > 0 || feedback.loading || Boolean(feedback.error);
  $('feedbackLoading').hidden = !feedback.loading;
  $('feedbackError').hidden = !feedback.error;
  $('feedbackErrorText').textContent = feedback.error;
  $('feedbackMore').hidden = !feedback.nextCursor;
  $('feedbackMore').disabled = feedback.loading || feedback.busy;
  $('feedbackRetry').disabled = feedback.loading || feedback.busy;
  $('feedbackList').setAttribute('aria-busy', String(feedback.loading));
  $('feedbackSubmit').disabled = disabled;
  $('feedbackSubmit').textContent = feedback.busy ? 'Saving…' : feedback.mine ? 'Update my feedback' : 'Share feedback';
  for (const id of ['feedbackName', 'feedbackBody', 'feedbackPrice']) $(id).disabled = disabled;
  for (const option of feedbackOptions) $(`feedbackChoice-${option.id}`).disabled = disabled;
  for (const option of Object.keys(feedbackExperiences)) $(`feedbackExperience-${option}`).disabled = disabled;
  $('feedbackRemove').hidden = !feedback.mine;
  $('feedbackRemove').disabled = disabled;
  $('feedbackMessage').textContent = feedback.message;
  $('feedbackAvailability').textContent = feedback.moderated ? 'This contribution was removed. You can use the correction link if you think this was a mistake.'
    : !available ? 'Guest feedback is temporarily unavailable. You can still explore the project.'
      : feedback.ownError ? 'Your previous contribution could not be loaded. Retry before editing it.'
        : keyPersists() ? 'No account needed. You can edit or remove your contribution from this browser.'
          : 'Your browser cannot save an edit key. You can edit or remove your contribution during this visit.';
  const prices = feedback.prices;
  const choices = feedback.choices || [];
  $('feedbackChoiceSummary').hidden = !choices.some(item => item.count);
  $('feedbackChoiceSummary').innerHTML = feedbackQuestions.map(question => {
    const options = question.options.map(option => ({ ...option, count: choices.find(item => item.id === option.id)?.count || 0 }))
      .filter(option => option.count).sort((a,b) => b.count - a.count);
    return options.length ? `<div class="feedback-pulse"><h4>${question.id === 'highlights' ? 'Catching people’s eye' : 'Ideas for the next version'}</h4>${options.map(option => `<p><span>${e(option.label)}</span><strong>${option.count}</strong><span class="feedback-pulse__track" aria-hidden="true"><span style="width:${Math.round(option.count / feedback.count * 100)}%"></span></span></p>`).join('')}</div>` : '';
  }).join('');
  $('idealPriceSummary').innerHTML = prices?.count ? `<p><strong>${e(money(prices.medianCents))}</strong> median ideal price <span>from ${prices.count} public ${prices.count === 1 ? 'contribution' : 'contributions'}</span></p><p class="field__hint">A suggestion for the maker. Their pricing is always their choice.</p>`
    : '<p class="field__hint">Ideal price suggestions will appear here when someone shares one.</p>';
}
export async function loadFeedback(gameId = feedback.gameId, more = false) {
  if (!gameId || gameId !== feedback.gameId || feedback.busy) return;
  const number = ++readNumber, current = session;
  controller?.abort(); controller = new AbortController();
  const signal = controller.signal, cursor = more ? feedback.nextCursor : null;
  feedback.loading = true; feedback.error = ''; if (!more) feedback.ownError = false; renderFeedback();
  try {
    if (!apiConfigured) throw new Error('Community feedback is not available in this offline snapshot.');
    const key = editKey();
    const ownRequest = key && !more ? request(`/games/${gameId}/feedback/mine`, { feedbackKey: key, signal }) : Promise.resolve(null);
    const citedId = !more ? new URL(location.href).searchParams.get('feedback') : null;
    const linked = /^[a-f0-9-]{36}$/.test(citedId || '') ? request(`/games/${gameId}/feedback/${citedId}`, { signal }) : Promise.resolve(null);
    const [pageResult, ownResult, citedResult] = await Promise.allSettled([
      request(`/games/${gameId}/feedback${cursor ? `?cursor=${encodeURIComponent(cursor)}` : ''}`, { signal }), ownRequest,
      linked,
    ]);
    if (number !== readNumber || current !== session) return;
    if (pageResult.status === 'rejected') throw pageResult.reason;
    const page = pageResult.value;
    if (!validPage(page, gameId)) throw new Error('The feedback could not be read. Please try again.');
    const entries = more ? [...feedback.entries, ...page.entries] : page.entries;
    feedback.entries = [...new Map(entries.map(item => [item.id, item])).values()];
    if(citedResult.status==='fulfilled'&&citedResult.value?.gameId===gameId&&validEntry(citedResult.value.entry)&&!feedback.entries.some(item=>item.id===citedId))feedback.entries.push(citedResult.value.entry);
    if(citedId&&citedResult.status==='rejected')feedback.message=citedResult.reason.status===404?'That cited note is no longer public.':'The cited note could not be loaded. Try again.';
    feedback.count = page.count; feedback.prices = page.idealPrices; feedback.choices = page.choices || []; feedback.nextCursor = page.nextCursor; feedback.loaded = true;
    if (ownResult.status === 'rejected') feedback.ownError = true;
    else if (ownResult.value) {
      const own = ownResult.value;
      if (own.gameId !== gameId || (own.feedback !== null && !validEntry(own.feedback)) || typeof own.moderated !== 'boolean') feedback.ownError = true;
      else { feedback.mine = own.feedback; feedback.moderated = own.moderated; fillOwn(); }
    }
    if (feedback.ownError) feedback.error = 'Your previous contribution could not be loaded. Retry before editing it.';
  } catch (error) {
    if (number === readNumber && current === session) feedback.error = error.status === 404 ? 'Community feedback is not available yet. Please try again shortly.' : error.message;
  } finally {
    if (number === readNumber && current === session) {
      feedback.loading = false; renderFeedback();
      if(!more){const id=new URL(location.href).searchParams.get('feedback');if(/^[a-f0-9-]{36}$/.test(id||''))document.getElementById(`feedback-${id}`)?.scrollIntoView({block:'center'});}
    }
  }
}
export async function saveFeedback() {
  if (!feedback.gameId || feedback.busy || feedback.loading || feedback.ownError || feedback.moderated || (!feedback.loaded && feedback.error) || !state.service?.capabilities?.feedback) return;
  const priceText = $('feedbackPrice').value.trim();
  const amount = priceText ? parsePrice(priceText) : null;
  const body = $('feedbackBody').value.trim();
  const choices = feedbackOptions.filter(option => $(`feedbackChoice-${option.id}`).checked).map(option => option.id);
  $('feedbackPrice').setAttribute('aria-invalid', String(Boolean(priceText && amount === null)));
  $('feedbackBody').setAttribute('aria-invalid', String(body.length < 8 && amount === null && !choices.length));
  if (priceText && amount === null) { feedback.message = 'Enter an ideal price from $0 to $100, or leave it blank.'; renderFeedback(); $('feedbackExtras').open = true; $('feedbackPrice').focus(); return; }
  if (body.length < 8 && amount === null && !choices.length) { feedback.message = 'Pick a quick answer, write a note of at least 8 characters, or add an ideal price.'; renderFeedback(); $('feedbackChoice-idea').focus(); return; }
  const gameId = feedback.gameId, current = session;
  readNumber++; controller?.abort(); feedback.busy = true; feedback.message = ''; renderFeedback();
  try {
    const result = await request(`/games/${gameId}/feedback`, { method: 'PUT', feedbackKey: editKey(true),
      body: { displayName: $('feedbackName').value.trim(), body, idealPriceCents: amount, choices,
        experience: document.querySelector('input[name="experience"]:checked')?.value || 'unspecified' } });
    if (current !== session) return;
    if (result.gameId !== gameId || !validEntry(result.feedback)) throw new Error('Your saved feedback could not be read. Please refresh before trying again.');
    feedback.mine = result.feedback; feedback.dirty = false; feedback.busy = false;
    feedback.message = 'Your feedback is public. Thanks for helping this project grow.';
    globalThis.document?.dispatchEvent?.(new CustomEvent('feedback-saved',{detail:{gameId}}));
    fillOwn(); renderFeedback(); await loadFeedback(gameId);
  } catch (error) { if (current === session) feedback.message = error.message; }
  finally { if (current === session) { feedback.busy = false; renderFeedback(); } }
}
export async function removeFeedback() {
  if (!feedback.mine || feedback.busy || feedback.loading) return;
  const gameId = feedback.gameId, current = session;
  readNumber++; controller?.abort(); feedback.busy = true; renderFeedback();
  try {
    await request(`/games/${gameId}/feedback`, { method: 'DELETE', feedbackKey: editKey() });
    if (current !== session) return;
    feedback.mine = null; feedback.dirty = false; feedback.busy = false; feedback.message = 'Your contribution has been removed.';
    fillOwn(); await loadFeedback(gameId); $('feedbackBody').focus();
    document.dispatchEvent(new CustomEvent('feedback-removed',{detail:{gameId}}));
  } catch (error) { if (current === session) feedback.message = error.message; }
  finally { if (current === session) { feedback.busy = false; renderFeedback(); } }
}
export function bindFeedback() {
  $('feedbackExperience').innerHTML = `<fieldset class="feedback-question"><legend>Your perspective <span class="field-optional">(optional)</span></legend><div class="feedback-chips">${Object.entries(feedbackExperiences).map(([id,label])=>`<label class="feedback-chip"><input type="radio" name="experience" id="feedbackExperience-${id}" value="${id}" ${id==='unspecified'?'checked':''}><span>${e(id==='unspecified'?'Skip':label)}</span></label>`).join('')}</div></fieldset>`;
  $('feedbackQuestions').innerHTML = feedbackQuestions.map((question, index) => `<fieldset class="feedback-question"><legend><span aria-hidden="true">0${index+1}</span> ${e(question.title)}</legend><div class="feedback-chips">${question.options.map(option => `<label class="feedback-chip"><input type="checkbox" id="feedbackChoice-${option.id}" name="choices" value="${option.id}"><span><span class="feedback-chip__check" aria-hidden="true">+</span>${e(option.label)}</span></label>`).join('')}</div></fieldset>`).join('');
  $('feedbackForm').addEventListener('submit', event => { event.preventDefault(); saveFeedback(); });
  $('feedbackForm').addEventListener('input', () => { feedback.dirty = true; });
  $('feedbackRemove').addEventListener('click', removeFeedback);
  $('feedbackRetry').addEventListener('click', () => loadFeedback());
  $('feedbackMore').addEventListener('click', () => loadFeedback(feedback.gameId, true));
}
