import { escHtml as e } from './utils.js';
import { dateLabel } from './collection.js';
import { projectPath } from './project-url.js';
import { feedbackReport } from './feedback-patterns.js';
import { expectationReport } from './expectation-report.js';

const runs=new WeakMap(), n=value=>Number(value).toLocaleString();
const options=(items)=>items.map(([id,label])=>`<option value="${e(id)}">${e(label)}</option>`).join('');
export async function loadFeedbackPatterns(root,api,projects,categories=[]) {
  if(!root)return;
  const run=(runs.get(root)||0)+1;runs.set(root,run);
  root.innerHTML='<section class="insight-section" aria-labelledby="feedbackPatternTitle"><h3 id="feedbackPatternTitle">First impressions &amp; play experiences</h3><p role="status">Loading public feedback…</p></section>';
  try{
    const records=[],seen=new Set();let cursor='',head;
    do{
      const page=await api(`/feedback-patterns${cursor?`?cursor=${encodeURIComponent(cursor)}`:''}`);
      if(runs.get(root)!==run)return;
      if(page.version!==1||!Array.isArray(page.games)||page.games.length>40)throw new Error('The feedback report could not be read.');
      head ||= page;
      for(const row of page.games){if(seen.has(row.id))throw new Error('Feedback changed while loading. Refresh to retry.');seen.add(row.id);records.push(row);}
      cursor=page.nextCursor;
      if(cursor&&(!/^g_[a-z0-9]{5,12}$/.test(cursor)||!page.games.length||records.length>8000))throw new Error('The feedback report was incomplete.');
    }while(cursor);
    const available=projects.filter(game=>seen.has(game.id));
    root.innerHTML=`<section class="insight-section" aria-labelledby="feedbackPatternTitle"><p class="eyebrow">LISTEN / TEST / LEARN</p><h3 id="feedbackPatternTitle">First impressions &amp; play experiences</h3>
      <p>See what attracts attention, what needs work, and which question to ask next. This compares public quick answers with editor-reviewed comments. It does not predict how a new player will feel.</p>
      <p class="field__hint">${e(dateLabel(head.windowStart))}–${e(dateLabel(head.windowEnd))} · Last 60 days · Reddit comment dates and Playtrace last-edited dates.</p>
      <div class="insight-controls"><div class="field"><label for="feedbackGenre">Game genre</label><select id="feedbackGenre" class="select"><option value="">All genres</option>${options([...new Set(available.map(game=>game.category))].sort().map(id=>[id,categories.find(row=>row.id===id)?.label||id]))}</select></div>
      <div class="field"><label for="feedbackPlatform">Linked platform</label><select id="feedbackPlatform" class="select"><option value="">All platforms</option>${options([...new Set(available.map(game=>game.distribution))].filter(Boolean).sort().map(value=>[value,value]))}</select></div>
      <div class="field"><label for="feedbackSource">Feedback source</label><select id="feedbackSource" class="select"><option value="">Reddit &amp; Playtrace</option><option value="reddit">Reddit comments</option><option value="playtrace">Playtrace contributions</option></select></div>
      <div class="field"><label for="feedbackProject">Project</label><select id="feedbackProject" class="select"><option value="">All matching projects</option>${options(available.sort((a,b)=>a.title.localeCompare(b.title)).map(game=>[game.id,game.title]))}</select></div></div>
      <div data-feedback-report aria-live="polite"></div>
      <details class="insight-method"><summary>What these counts can tell us</summary><p>Each reviewed comment counts once per source URL, with one reviewed topic. A person may leave several comments; counts are not unique players. “Played” means self-reported, never verified. Playtrace visitors choose their perspective; Reddit context comes from explicit wording reviewed by an editor. Missing context stays unspecified.</p><p>Quick answers count one current contribution per browser and game. Several choices can apply, and a cited Playtrace note can belong to the same contribution, so those totals must not be added. Private questionnaire responses are excluded.</p><p>Only published reviews contribute comment themes. Editorial selection, a maximum of 30 Reddit comments from the latest 10 posts and 30 public notes per draft, unequal coverage and small samples affect comparisons. A repeated theme label needs at least five cited comments across three projects; this is a browsing rule, not statistical confidence. Follow-up questions are prompts for investigation, not findings or predictions.</p></details></section>`;
    const field=id=>root.querySelector(`#${id}`), out=root.querySelector('[data-feedback-report]');
    function paint(){
      const report=feedbackReport(records,projects,{category:field('feedbackGenre').value,platform:field('feedbackPlatform').value,source:field('feedbackSource').value,gameId:field('feedbackProject').value});
      const {counts:c,themes}=report;
      const cell=values=>`${values.praise} positive<br><span class="field__hint">${values.concern} concerns · ${values.suggestion} suggestions${values.mixed?` · ${values.mixed} mixed`:''}</span>`;
      out.innerHTML=`<dl class="insight-overview"><div><dt>Projects with feedback</dt><dd>${n(c.projects)}</dd></div><div><dt>Public Playtrace contributions</dt><dd>${n(c.siteContributions)}<small>${n(c.siteNotes)} include a written note</small></dd></div><div><dt>Reviewed Reddit comments</dt><dd>${n(c.redditCitations)}</dd></div><div><dt>Reviewed Playtrace notes</dt><dd>${n(c.siteCitations)}<small>A subset of public notes</small></dd></div></dl>
        ${field('feedbackSource').value!=='reddit'?expectationReport(report.expectations):''}
        ${!c.projects?'<p class="insight-callout">No public feedback matches these filters yet. A first look or a short play session can help start the comparison. <a href="/research.html">Share a quick review</a>.</p>':`<p class="field__hint">Reviewed citations: ${c.preview} first look · ${c.played} reported play · ${c.unspecified} experience not specified.${c.unclassified?` ${c.unclassified} cited contributions have no reviewed topic and stay out of the topic table.`:''}</p>`}
        ${themes.length?`<div class="insight-table-wrap" role="region" aria-label="Reviewed feedback by experience" tabindex="0"><table class="insight-table feedback-pattern-table"><caption>What people mentioned, separated by their reported experience</caption><thead><tr><th scope="col">Topic</th><th scope="col">First look</th><th scope="col">Played</th><th scope="col">Not specified</th><th scope="col">Coverage</th></tr></thead><tbody>${themes.map(theme=>`<tr><th scope="row">${e(theme.label)}</th><td>${cell(theme.contexts.preview)}</td><td>${cell(theme.contexts.played)}</td><td>${cell(theme.contexts.unspecified)}</td><td>${theme.count} comments / ${theme.projects} projects<br><small>${theme.recurring?'Repeated across projects':'Early observations'}</small></td></tr>`).join('')}</tbody></table></div>`:c.projects?'<p class="insight-callout">There are no reviewed topic comparisons for this selection yet. The cited summaries below remain available; unknown experience is kept separate.</p>':''}
        ${themes.length?`<div class="feedback-next"><h4>What to ask next</h4><ul>${themes.slice(0,4).map(theme=>`<li><strong>${e(theme.label)}</strong><p>${e(theme.questions.question)}</p><a href="/research.html?form=${theme.questions.form}${field('feedbackProject').value?`&amp;game=${field('feedbackProject').value}`:''}">Open a focused review ↗</a></li>`).join('')}</ul></div>`:''}
        ${report.choices.length?`<details open><summary>Public quick answers</summary><p class="field__hint">${n(c.siteContributions)} contributions in this selection. Each can choose several answers or skip a question.</p><ul class="insight-distribution feedback-choice-report">${report.choices.map(choice=>`<li><span>${e(choice.label)}</span><strong>${choice.count}</strong><meter value="${choice.count}" min="0" max="${Math.max(1,c.siteContributions)}" aria-label="${e(choice.label)}: ${choice.count} of ${c.siteContributions} contributions"></meter></li>`).join('')}</ul></details>`:''}
        ${report.projects.some(item=>item.cited.length)?`<details><summary>Read the project summaries and sources</summary><ul class="insight-evidence">${report.projects.filter(item=>item.cited.length).map(item=>`<li><h4><a href="${projectPath(item.id)}#pageReview">${e(item.game.title)}</a></h4><p>${e(item.review.summary)}</p><p class="field__hint">${item.cited.length} citations match these filters. The summary covers its full published window, ${e(dateLabel(item.review.windowStart))}–${e(dateLabel(item.review.windowEnd))}.</p><p>${item.cited.map(citation=>`<a href="${projectPath(item.id)}#review-source-${citation.number}">[${citation.number}] ${citation.source==='reddit'?'Reddit':'Playtrace'}</a>`).join(' · ')}</p></li>`).join('')}</ul></details>`:''}`;
    }
    for(const select of root.querySelectorAll('select'))select.addEventListener('change',paint);
    paint();
    if(location.hash==='#feedbackPatternTitle')field('feedbackPatternTitle').scrollIntoView({block:'start'});
  }catch(error){if(runs.get(root)===run){const status=root.querySelector('[role="status"]');if(status)status.textContent=`Feedback patterns are unavailable: ${error.message} Use Refresh charts to retry.`;}}
}
