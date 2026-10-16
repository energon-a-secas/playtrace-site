import { escHtml as e } from './utils.js';
import { dateLabel } from './collection.js';
import { projectPath } from './project-url.js';
import { feedbackReport } from './feedback-patterns.js';
import { expectationReport } from './expectation-report.js';
import { feedbackEvidence, feedbackEvidenceCsv, experienceLabels } from './feedback-research.js';
import { researchLeadsMarkup, topicEvidenceMarkup } from './feedback-research-view.js';

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
      <div class="insight-controls feedback-filters"><div class="field"><label for="feedbackGenre">Game genre</label><select id="feedbackGenre" class="select"><option value="">All genres</option>${options([...new Set(available.map(game=>game.category))].sort().map(id=>[id,categories.find(row=>row.id===id)?.label||id]))}</select></div>
      <div class="field"><label for="feedbackPlatform">Linked platform</label><select id="feedbackPlatform" class="select"><option value="">All platforms</option>${options([...new Set(available.map(game=>game.distribution))].filter(Boolean).sort().map(value=>[value,value]))}</select></div>
      <div class="field"><label for="feedbackSource">Feedback source</label><select id="feedbackSource" class="select"><option value="">Reddit &amp; Playtrace</option><option value="reddit">Reddit comments</option><option value="playtrace">Playtrace contributions</option></select></div>
      <div class="field"><label for="feedbackExperience">Reported experience</label><select id="feedbackExperience" class="select"><option value="">All experiences</option>${options(Object.entries(experienceLabels))}</select></div>
      <div class="field"><label for="feedbackProject">Project</label><select id="feedbackProject" class="select"><option value="">All matching projects</option>${options(available.sort((a,b)=>a.title.localeCompare(b.title)).map(game=>[game.id,game.title]))}</select></div></div>
      <div class="feedback-report-tools"><p class="field__hint">Filters apply to comment counts, research leads and sources. A comment with no play context stays “Not specified.”</p><button type="button" class="text-button" data-feedback-reset disabled>Clear filters</button></div>
      <p class="sr-only" data-feedback-status role="status"></p><div data-feedback-report></div>
      <details class="insight-method"><summary>What these counts can tell us</summary><p>Each reviewed comment counts once per source URL, with one reviewed topic. A person may leave several comments; counts are not unique players. “Played” means self-reported, never verified. Playtrace visitors choose their perspective; Reddit context comes from explicit wording reviewed by an editor. Missing context stays unspecified. The first-look and played columns describe separate comments, not a before/after comparison of the same people.</p><p>Quick answers count one current contribution per browser and game. Several choices can apply, and a cited Playtrace note can belong to the same contribution, so those totals must not be added. Private questionnaire responses are excluded.</p><p>Only published reviews contribute comment themes. Editorial selection, a maximum of 30 Reddit comments from the latest 10 posts and 30 public notes per draft, unequal coverage and small samples affect comparisons. A repeated theme label needs at least five cited comments across three projects; this is a browsing rule, not statistical confidence. Research leads use that threshold only for concerns and suggestions. Positive and mixed comments do not increase a lead’s priority. Ties use reported-play comments, then comment count. Follow-up questions are prompts for investigation, not findings or predictions.</p></details></section>`;
    const field=id=>root.querySelector(`#${id}`), out=root.querySelector('[data-feedback-report]');
    let report,filters,topic='',tone='',limit=12,returnTopic='',returnButton=null;
    function paintEvidence(){
      const panel=field('feedbackTopicEvidence');panel.hidden=!topic;
      panel.innerHTML=topicEvidenceMarkup(report,{topic,tone,limit});
      for(const button of out.querySelectorAll('[data-feedback-topic]'))button.setAttribute('aria-expanded',String(button.dataset.feedbackTopic===topic));
    }
    function paint(){
      filters={category:field('feedbackGenre').value,platform:field('feedbackPlatform').value,source:field('feedbackSource').value,experience:field('feedbackExperience').value,gameId:field('feedbackProject').value};
      report=feedbackReport(records,projects,filters);
      const {counts:c,themes}=report;
      if(topic&&!feedbackEvidence(report,{topic}).length){topic='';tone='';}
      root.querySelector('[data-feedback-reset]').disabled=!Object.values(filters).some(Boolean)&&!topic;
      root.querySelector('[data-feedback-status]').textContent=`${c.projects} ${c.projects===1?'project':'projects'}, ${c.redditCitations+c.siteCitations} reviewed ${(c.redditCitations+c.siteCitations)===1?'comment':'comments'} and ${c.siteContributions} public Playtrace ${c.siteContributions===1?'contribution':'contributions'} match.`;
      const cell=values=>`${values.praise} positive<br><span class="field__hint">${values.concern} ${values.concern===1?'concern':'concerns'} · ${values.suggestion} ${values.suggestion===1?'suggestion':'suggestions'}${values.mixed?` · ${values.mixed} mixed`:''}</span>`;
      out.innerHTML=`<dl class="insight-overview"><div><dt>Projects with feedback</dt><dd>${n(c.projects)}</dd></div><div><dt>Public Playtrace contributions</dt><dd>${n(c.siteContributions)}<small>${n(c.siteNotes)} include a written note</small></dd></div><div><dt>Reviewed Reddit comments</dt><dd>${n(c.redditCitations)}</dd></div><div><dt>Reviewed Playtrace notes</dt><dd>${n(c.siteCitations)}<small>A subset of public notes</small></dd></div></dl>
        ${!c.projects?'<p class="insight-callout">No public feedback matches these filters yet. A first look or a short play session can help start the comparison. <a href="/feedback/">Submit feedback</a>.</p>':`<p class="field__hint">Reviewed citations: ${c.preview} first look · ${c.played} reported play · ${c.unspecified} experience not specified.${c.unclassified?` ${c.unclassified} cited contributions have no reviewed topic and stay out of the topic table.`:''}</p>`}
        ${researchLeadsMarkup(report,{gameId:filters.gameId})}
        ${themes.length?`<div class="insight-table-wrap" role="region" aria-label="Reviewed feedback by experience" tabindex="0"><table class="insight-table feedback-pattern-table"><caption>Explore a topic to inspect its reviewed comments. Counts describe comments, not players.</caption><thead><tr><th scope="col">Topic</th><th scope="col">First look</th><th scope="col">Reported play</th><th scope="col">Not specified</th><th scope="col">Coverage</th></tr></thead><tbody>${themes.map(theme=>`<tr><th scope="row"><button type="button" class="text-button feedback-topic-button" data-feedback-topic="${theme.id}" aria-controls="feedbackTopicEvidence">${e(theme.label)}<span class="feedback-topic-hint">Inspect ${theme.count} ${theme.count===1?'comment':'comments'}</span></button></th><td>${cell(theme.contexts.preview)}</td><td>${cell(theme.contexts.played)}</td><td>${cell(theme.contexts.unspecified)}</td><td>${theme.count} ${theme.count===1?'comment':'comments'} / ${theme.projects} ${theme.projects===1?'project':'projects'}<br><small>${theme.recurring?'Repeated across projects':'Early observations'}</small></td></tr>`).join('')}</tbody></table></div>`:c.projects?'<p class="insight-callout">There are no reviewed topic comparisons for this selection yet. The cited summaries below remain available; unknown experience is kept separate.</p>':''}
        ${c.unclassified?`<button type="button" class="text-button" data-feedback-topic="unclassified" aria-controls="feedbackTopicEvidence">Inspect ${c.unclassified} ${c.unclassified===1?'comment':'comments'} without reviewed topics</button>`:''}
        <section id="feedbackTopicEvidence" class="feedback-topic-evidence" aria-labelledby="feedbackEvidenceTitle" hidden></section>
        ${filters.source!=='reddit'?expectationReport(report.expectations)+(filters.experience?'<p class="field__hint">Paired comparisons above use the selected project, genre and platform. They are separate from comments, so the reported-experience filter does not apply.</p>':''):''}
        ${report.choices.length?`<details open><summary>Public quick answers</summary><p class="field__hint">${n(c.siteContributions)} contributions in this selection. Each can choose several answers or skip a question.</p><ul class="insight-distribution feedback-choice-report">${report.choices.map(choice=>`<li><span>${e(choice.label)}</span><strong>${choice.count}</strong><meter value="${choice.count}" min="0" max="${Math.max(1,c.siteContributions)}" aria-label="${e(choice.label)}: ${choice.count} of ${c.siteContributions} contributions"></meter></li>`).join('')}</ul></details>`:''}
        ${report.projects.some(item=>item.cited.length)?`<details><summary>Read the project summaries and sources</summary><ul class="insight-evidence">${report.projects.filter(item=>item.cited.length).map(item=>`<li><h4><a href="${projectPath(item.id)}#pageReview">${e(item.game.title)}</a></h4><p>${e(item.review.summary)}</p><p class="field__hint">${item.cited.length} citations match these filters. The summary covers its full published window, ${e(dateLabel(item.review.windowStart))}–${e(dateLabel(item.review.windowEnd))}.</p><p>${item.cited.map(citation=>`<a href="${projectPath(item.id)}#review-source-${citation.number}">[${citation.number}] ${citation.source==='reddit'?'Reddit':'Playtrace'}</a>`).join(' · ')}</p></li>`).join('')}</ul></details>`:''}`;
      paintEvidence();
    }
    for(const select of root.querySelectorAll('.feedback-filters select'))select.addEventListener('change',()=>{limit=12;paint();});
    root.querySelector('[data-feedback-reset]').addEventListener('click',()=>{
      for(const select of root.querySelectorAll('.feedback-filters select'))select.value='';topic='';tone='';limit=12;paint();field('feedbackGenre').focus();
    });
    out.addEventListener('click',event=>{
      const button=event.target.closest('button');if(!button)return;
      if(button.hasAttribute('data-feedback-topic')){
        topic=button.dataset.feedbackTopic;returnTopic=topic;returnButton=button;tone=button.dataset.feedbackTone||'';limit=12;paintEvidence();
        root.querySelector('[data-feedback-reset]').disabled=false;field('feedbackEvidenceTitle').focus();
      }else if(button.hasAttribute('data-feedback-close')){
        topic='';tone='';paintEvidence();root.querySelector('[data-feedback-reset]').disabled=!Object.values(filters).some(Boolean);
        (returnButton?.isConnected?returnButton:out.querySelector(`[data-feedback-topic="${returnTopic}"]`))?.focus();
      }else if(button.hasAttribute('data-feedback-more')){
        const firstNew=limit;limit+=12;paintEvidence();field(`feedbackEvidenceRow${firstNew}`)?.focus();
      }else if(button.hasAttribute('data-feedback-export')){
        const content=feedbackEvidenceCsv(report,{topic,tone,windowStart:head.windowStart,windowEnd:head.windowEnd,filters,categories});
        const url=URL.createObjectURL(new Blob([content],{type:'text/csv;charset=utf-8'})),link=document.createElement('a');
        link.href=url;link.download=`playtrace-feedback-${topic}-${head.windowEnd.slice(0,10)}.csv`;link.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
      }
    });
    out.addEventListener('change',event=>{if(event.target.id==='feedbackResponse'){tone=event.target.value;limit=12;paintEvidence();field('feedbackResponse').focus();}});
    paint();
    if(location.hash==='#feedbackPatternTitle')field('feedbackPatternTitle').scrollIntoView({block:'start'});
  }catch(error){if(runs.get(root)===run){const status=root.querySelector('[role="status"]');if(status)status.textContent=`Feedback patterns are unavailable: ${error.message} Use Refresh charts to retry.`;}}
}
