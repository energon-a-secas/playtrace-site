import { linkEvidence, linkStates, linkReasons } from './link-health.js';
import { escHtml as e } from './utils.js';
import { dateLabel } from './collection.js';
export function linkCheckMarkup(game,history=[],id='linkChecks'){
  if(!game.projectUrl)return '';
  const link=linkEvidence(game);
  return `<details class="project-link-checks" id="${id}"${globalThis.location?.hash==='#'+id?' open':''}><summary>Link &amp; hosting · ${e(linkStates[link.status])}</summary><p>${e(link.destination?.label||'Custom / other domain')} · ${e(link.destination?.host||'')}${link.checkedAt?` · checked ${e(dateLabel(link.checkedAt))}`:''}</p>
    ${link.destination?.kind==='file-transfer'?'<p class="field__hint">This is a file-transfer link. It may expire independently of the game’s development status.</p>':''}
    ${link.checkMethod==='store-api'?`<p class="field__hint">Store metadata observation: ${e(dateLabel(link.evidenceCheckedAt))}. This check uses the store API.</p>`:''}
    ${link.recoveredAt&&link.status==='reachable'?`<p class="field__hint">Recovered from a reported missing link on ${e(dateLabel(link.recoveredAt))}.</p>`:''}
    ${link.finalDestination?.host&&link.finalDestination.host!==link.destination?.host?`<p class="field__hint">Latest final host: ${e(link.finalDestination.host)}. A redirect does not identify the underlying server provider.</p>`:''}
    <p class="field__hint">${link.status==='broken'?`The check returned HTTP ${link.httpStatus||'404/410'}. You can still try the link or request a correction.`:link.status==='reachable'?'The destination responded or supplied store metadata. Gameplay has not been tested.':link.status==='blocked'?'The automated check was restricted. This is not a broken-link finding.':link.status==='not-checked'?'This destination has not been checked yet.':'The check was inconclusive; a timeout or DNS failure does not establish that a game is gone.'}</p>
    ${history.length?`<ol class="link-check-history" aria-label="Recent checks for this destination">${history.map(row=>`<li><time datetime="${e(row.checkedAt)}">${e(dateLabel(row.checkedAt))}</time> · ${e(linkStates[row.status]||'Unverified')}${row.httpStatus?` · HTTP ${row.httpStatus}`:''}${row.reason?` · ${e(linkReasons[row.reason]||'Check incomplete')}`:''}</li>`).join('')}</ol><p class="field__hint">Up to 12 recent checks shown for this URL, from a maximum of 52 retained checks per project. These are occasional observations, not uptime monitoring.</p>`:''}</details>`;
}
