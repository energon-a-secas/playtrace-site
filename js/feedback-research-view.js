import { escHtml as e } from './utils.js';
import { safeUrl, dateLabel } from './collection.js';
import { projectPath } from './project-url.js';
import { feedbackTopics } from './feedback-patterns.js';
import { feedbackEvidence, feedbackResearchLeads, experienceLabels, responseLabels } from './feedback-research.js';

export function researchLeadsMarkup(report,{gameId=''}={}) {
  const leads=feedbackResearchLeads(report).slice(0,3);
  if(!leads.length)return report.themes.length?'<p class="field__hint">No reviewed concerns or suggestions in this selection. Positive and mixed reactions remain in the topic table; this does not establish that the games have no issues.</p>':'';
  return `<section class="feedback-next" aria-labelledby="feedbackNextTitle"><h4 id="feedbackNextTitle">Where another playtest could help</h4>
    <p class="field__hint">Three research leads at most, ordered by projects with concerns or suggestions, then comments reporting play. These are questions to investigate, not confirmed defects.</p>
    <ol class="feedback-leads">${leads.map(lead=>`<li><div class="feedback-lead-scope"><h5>${e(lead.label)}</h5>
      <p><strong>${lead.count}</strong> ${lead.count===1?'concern or suggestion':'concerns or suggestions'} across <strong>${lead.projects}</strong> ${lead.projects===1?'project':'projects'}</p>
      <p class="field__hint">${lead.contexts.preview} first look · ${lead.contexts.played} reported play · ${lead.contexts.unspecified} not specified</p>
      <small>${lead.recurring?'Repeated across projects':'Early observations'}</small></div>
      <div class="feedback-lead-question"><p>${e(lead.question.question)}</p><div class="feedback-actions">
        <button type="button" class="text-button" data-feedback-topic="${lead.id}" data-feedback-tone="actionable" aria-controls="feedbackTopicEvidence">Inspect evidence<span class="sr-only"> for ${e(lead.label)}</span></button>
        <a class="text-link" href="/research.html?form=${lead.question.form}${gameId?`&amp;game=${e(gameId)}`:''}">Open focused review ↗</a>
      </div></div></li>`).join('')}</ol></section>`;
}

export function topicEvidenceMarkup(report,{topic='',tone='',limit=12}={}) {
  if(!topic)return '';
  const rows=feedbackEvidence(report,{topic,tone}),shown=rows.slice(0,limit),projects=new Set(rows.map(row=>row.game.id)).size;
  return `<div class="feedback-evidence-heading"><div><p class="eyebrow">REVIEWED SOURCES</p><h4 id="feedbackEvidenceTitle" tabindex="-1">${e(feedbackTopics[topic]||'Without a reviewed topic')}</h4></div>
    <button type="button" class="text-button" data-feedback-close>Close topic</button></div>
    <div class="feedback-evidence-tools"><div class="field"><label for="feedbackResponse">Response</label><select id="feedbackResponse" class="select">
      ${[['','All responses'],['actionable','Concerns & suggestions'],...Object.entries(responseLabels)].map(([id,label])=>`<option value="${id}"${tone===id?' selected':''}>${e(label)}</option>`).join('')}</select></div>
      <p id="feedbackEvidenceCount" role="status">${shown.length} of ${rows.length} reviewed ${rows.length===1?'comment':'comments'} · ${projects} ${projects===1?'project':'projects'}</p>
      <button type="button" class="btn btn--secondary" data-feedback-export${rows.length?'':' disabled'}>Export these comments</button></div>
    <p class="field__hint">The labels are an editor’s reading of the cited comment. Open its source for the wording and context; several comments may come from one person.</p>
    ${shown.length?`<ol class="feedback-evidence-list">${shown.map(({game,citation},index)=>`<li id="feedbackEvidenceRow${index}" tabindex="-1">
      <div><a class="feedback-evidence-project" href="${projectPath(game)}#review-source-${citation.number}">${e(game.title)}</a>
        <p>${e(responseLabels[citation.tone]||'Unclassified')} · ${e(experienceLabels[citation.experience]||experienceLabels.unspecified)}<br><span class="field__hint">${e(dateLabel(citation.updatedAt||citation.createdAt))}${citation.updatedAt?' · Last edited':''} · ${citation.source==='playtrace'?'Playtrace note':'Reddit comment'}</span></p></div>
      <a class="text-link" href="${e(safeUrl(citation.url))}" target="_blank" rel="noopener noreferrer">Read ${citation.source==='playtrace'?'note':'comment'} [${citation.number}] ↗<span class="sr-only"> about ${e(game.title)}</span></a>
    </li>`).join('')}</ol>`:'<p class="insight-callout">No reviewed comments match this response. Choose another response or clear the report filters.</p>'}
    ${rows.length>limit?'<button type="button" class="btn btn--secondary" data-feedback-more>Show more comments</button>':''}`;
}
