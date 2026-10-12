import { escHtml as e } from './utils.js';
import { dateLabel } from './collection.js';
import { projectPath } from './project-url.js';
import { modelReleases } from './insight-evidence.js';
import { trend, breakdown, valuesFor, mentionDimensions, compareRelease, csv, missingLabel } from './insight-analysis.js';
import { feedbackOptions } from './feedback-options.js';
import { releaseTimeline } from './release-evidence.js';
import { loadFeedbackPatterns } from './feedback-pattern-view.js';
import { renderHosting } from './hosting-view.js';

const $=id=>document.getElementById(id),n=value=>Number(value).toLocaleString(),pct=(a,b)=>b?`${(a/b*100).toFixed(1)}%`:'No sample';
let api,run=0,busy=false,data=null,usage=null,exportRows=[],evidenceLimit=20,publicView=false;
const dimensionLabels={category:'Game genre',stage:'Current development stage',distribution:'Linked platform',styles:'Art style mentions',formats:'Visual format mentions',models:'AI model mentions',engines:'Engine mentions'};
const label=value=>data?.categories?.find(item=>item.id===value)?.label||({unknown:'Unspecified',prototype:'Prototype',concept:'Concept',playable:'Playable build',released:'Released'})[value]||value;
export function resetInsights(){run++;busy=false;data=null;usage=null;exportRows=[];for(const id of ['insightCoverage','trendChart','trendTable','insightSources','releaseComparison','genreBreakdown','platformBreakdown','stageBreakdown','storeCoverage','storeReleaseTimeline','usageInsights','feedbackInsights'])$(id).replaceChildren();$('insightsContent').hidden=true;$('insightStatus').textContent='';$('refreshInsights').disabled=false;}
export function initInsights({request,publicMode=false}){
  api=request;
  publicView=publicMode;
  $('refreshInsights').addEventListener('click',()=>loadInsights(true));
  $('trendDimension').addEventListener('change',()=>{setValues('trend');paintTrend();});
  for(const id of ['trendValue','trendGrain','trendMeasure','trendFrom','trendTo'])$(id).addEventListener('change',()=>{evidenceLimit=20;paintTrend();});
  $('comparisonDimension').addEventListener('change',()=>{setValues('comparison');paintComparison();});
  for(const id of ['releaseEvent','comparisonValue','comparisonWindow'])$(id).addEventListener('change',paintComparison);
  $('moreInsightSources').addEventListener('click',()=>{evidenceLimit+=20;paintEvidence();});
  $('exportInsights').addEventListener('click',()=>{const blob=new Blob([csv(exportRows)],{type:'text/csv;charset=utf-8'}),url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download=`playtrace-${$('trendDimension').value}-${new Date().toISOString().slice(0,10)}.csv`;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);});
}
export async function loadInsights(refresh=false){
  if(busy||data&&!refresh)return;busy=true;const current=++run;$('refreshInsights').disabled=true;$('insightStatus').textContent='Reading the archive and source evidence…';
  try{
    let cursor='',head,total;const games=[],seen=new Set(),ids=new Set();
    do{
      const page=await api((publicView?'/insights':'/admin/insights')+(cursor?`?cursor=${encodeURIComponent(cursor)}`:''));if(current!==run)return;
      if(page.version!==1||!Array.isArray(page.games)||!page.pagination||!Number.isSafeInteger(page.pagination.total)||head&&page.generatedAt!==head.generatedAt||total!==undefined&&page.pagination.total!==total)throw new Error('The archive changed while loading. Refresh for a consistent view.');
      head ||= page;total=page.pagination.total;
      for(const game of page.games){if(ids.has(game.id))throw new Error('Duplicate evidence page. Refresh to retry.');ids.add(game.id);games.push(game);}
      cursor=page.pagination.nextCursor;if(cursor&&(typeof cursor!=='string'||seen.has(cursor)||!page.games.length))throw new Error('The next evidence page could not be read.');if(cursor)seen.add(cursor);
      if(seen.size>100||games.length>total)throw new Error('The evidence page was incomplete.');
      $('insightStatus').textContent=`Reading evidence: ${n(games.length)} of ${n(total)} projects…`;
    }while(cursor);
    if(games.length!==total)throw new Error('Some projects are missing. Refresh to retry.');
    data={...head,games};usage=null;
    if(!publicView)try{usage=await api('/admin/usage');}catch(error){if(current===run)$('usageInsights').textContent=`Usage counts are unavailable: ${error.message}`;}
    if(current!==run)return;
    $('insightsContent').hidden=false;$('insightStatus').textContent=`${n(games.length)} projects · evidence read ${dateLabel(data.observedAt)}${publicView?' · Public catalogue evidence':' · Admin view'}`;
    setValues('trend');setValues('comparison');$('releaseEvent').innerHTML=modelReleases.map((item,i)=>`<option value="${i}">${e(item.name)} · ${item.date}</option>`).join('');$('releaseEvent').value=String(modelReleases.length-1);
    paintOverview();paintTrend();paintComparison();paintUsage();paintReleases();
    renderHosting($('hostingInsights'),data.games);
    loadFeedbackPatterns($('feedbackPatterns'),api,data.games,data.categories);
  }catch(error){if(current===run)$('insightStatus').textContent=error.message;}
  finally{if(current===run){busy=false;$('refreshInsights').disabled=false;}}
}
function paintReleases(){
  if(!$('storeReleaseTimeline'))return;
  const {entries,periods}=releaseTimeline(data.games),reported=data.games.filter(game=>game.storeRelease).length;
  $('storeReleaseTimeline').innerHTML=`<p>${n(entries.length)} distinct Steam apps have an exact, past release date and a released store status, from ${n(reported)} projects with a store date label. Each app counts once. Store dates can precede the AI work described in a later post. Demo and Early Access dates describe those builds, not a later full release. Itch.io status labels without exact release evidence stay out of this timeline.</p>${periods.length?`<div class="insight-table-wrap" tabindex="0" role="region" aria-label="Store release months"><table class="insight-table"><caption>Store-reported dates, separate from community post dates</caption><thead><tr><th scope="col">Month</th><th scope="col">Games</th><th scope="col">Demos</th><th scope="col">Early Access</th></tr></thead><tbody>${periods.map(row=>`<tr><th scope="row">${row.month}</th><td>${row.game}</td><td>${row.demo}</td><td>${row['early-access']}</td></tr>`).join('')}</tbody></table></div><details><summary>Compare release and first-shared dates</summary><div class="insight-table-wrap" tabindex="0" role="region" aria-label="Store release evidence"><table class="insight-table"><thead><tr><th scope="col">Game</th><th scope="col">Build</th><th scope="col">Store date</th><th scope="col">First shared</th><th scope="col">Evidence</th></tr></thead><tbody>${entries.map(game=>`<tr><th scope="row"><a href="${projectPath(game)}">${e(game.title)}</a></th><td>${e(game.storeRelease.kind)}</td><td>${game.storeRelease.date}</td><td>${game.firstSeenAt.slice(0,10)}</td><td><a href="${e(game.storeRelease.url)}" target="_blank" rel="noopener noreferrer">Steam ↗</a><br><small>Checked ${e(dateLabel(game.storeRelease.checkedAt))}</small></td></tr>`).join('')}</tbody></table></div></details>`:'<p>No exact store release dates are available yet.</p>'}`;
}
function setValues(prefix){
  if(!data)return;const dimension=$(prefix+'Dimension').value,select=$(prefix+'Value'),old=select.value;
  const values=breakdown(data.games,dimension).filter(row=>row.label!==missingLabel[dimension]);
  select.innerHTML=(prefix==='trend'?'<option value="">All observed projects</option>':'')+values.map(row=>`<option value="${e(row.label)}">${e(label(row.label))} (${n(row.count)})</option>`).join('');
  if([...select.options].some(option=>option.value===old))select.value=old;
  else select.value=prefix==='trend'?'':values[0]?.label||'';
}
function distribution(rows,total){return `<ul class="insight-distribution">${rows.map(row=>`<li><span>${e(label(row.label))}</span><span>${n(row.count)} <small>(${pct(row.count,total)})</small></span><meter min="0" max="${Math.max(1,total)}" value="${row.count}" aria-label="${e(label(row.label))}: ${row.count} of ${total}"></meter></li>`).join('')}</ul>`;}
function paintOverview(){
  const games=data.games,posts=games.flatMap(game=>game.observations),full=posts.filter(post=>post.coverage==='full-text').length,model=games.filter(game=>valuesFor(game,'models').length).length,style=games.filter(game=>valuesFor(game,'styles').length).length;
  $('insightCoverage').innerHTML=`<dl class="insight-overview"><div><dt>Source posts</dt><dd>${n(posts.length)}<small>${n(full)} with retained full text</small></dd></div><div><dt>Explicit model mentions</dt><dd>${pct(model,games.length)}<small>${n(model)} of ${n(games.length)} projects</small></dd></div><div><dt>Recognized art style mentions</dt><dd>${pct(style,games.length)}<small>${n(style)} of ${n(games.length)} projects</small></dd></div><div><dt>Current genre classified</dt><dd>${pct(games.filter(g=>g.category!=='other').length,games.length)}<small>One catalogue genre per project</small></dd></div></dl><p class="insight-method">The archive includes eligible showcases and individually reviewed older unlabeled posts. Missing posts, truncated excerpts and later edits affect every comparison. ${data.source?.coverageThrough?`Collection checked through ${e(dateLabel(data.source.coverageThrough))}.`:''} Full text covers ${pct(full,posts.length)} of included posts. No recognized mention means unknown, not “no AI” or “no art style.”</p>`;
  $('genreBreakdown').innerHTML=distribution(breakdown(games,'category'),games.length);
  $('platformBreakdown').innerHTML=distribution(breakdown(games,'distribution'),games.length);
  $('stageBreakdown').innerHTML=distribution(breakdown(games,'stage'),games.length);
  const stores=games.filter(g=>g.storeProvider),demos=stores.filter(g=>g.releaseKind==='demo'),health=new Map();for(const g of games.filter(g=>g.projectUrl))health.set(g.linkState,(health.get(g.linkState)||0)+1);
  $('storeCoverage').innerHTML=`<p>${n(stores.length)} projects have store evidence; ${n(demos.length)} are identified as demos. ${n(stores.filter(g=>g.browserBuild).length)} store pages offer browser builds and ${n(stores.filter(g=>g.downloadableBuild).length)} offer downloads; these may overlap and checks do not test gameplay. Current stages above combine creator descriptions, editorial choices and recent store checks. They are not verified launch counts or a release timeline.</p><p>Listed game links: ${[...health].map(([key,count])=>`${n(count)} ${e(key.replaceAll('-',' '))}`).join(' · ')}. A reachable page does not prove the build works.</p>`;
}
function paintTrend(){
  if(!data)return;const dimension=$('trendDimension').value,value=$('trendValue').value,from=$('trendFrom').value,to=$('trendTo').value;
  if(from&&to&&from>to){$('trendDescription').textContent='Choose an end date after the start date.';return;}
  const rows=trend(data.games,{dimension,value,grain:$('trendGrain').value,from,to}),share=$('trendMeasure').value==='share';
  $('trendDescription').textContent=mentionDimensions.has(dimension)?'Projects with source posts in each period; each project counts once per period. Mentions come from currently available text at the original post date, so later edits can change the apparent history.':'Projects grouped by their first source-post date, using today’s catalogue labels. These are arrival cohorts, not historical changes of genre, stage or platform.';
  const vals=rows.map(row=>share?(row.total?row.count/row.total*100:0):row.count),max=Math.max(1,...vals),width=880,height=270,pad=44,plot=height-pad*2,step=(width-pad*2)/Math.max(1,rows.length),bar=Math.min(48,step*.7);
  $('trendChart').innerHTML=rows.length?`<svg viewBox="0 0 ${width} ${height}" role="img" aria-label="${e(value?label(value):'All observed projects')} by ${$('trendGrain').value}. Values available in the table below.">${[0,.5,1].map(f=>`<line class="chart-line" x1="${pad}" y1="${height-pad-f*plot}" x2="${width-pad}" y2="${height-pad-f*plot}"/><text x="${pad-8}" y="${height-pad-f*plot+4}" text-anchor="end">${share?Math.round(max*f)+'%':Math.round(max*f)}</text>`).join('')}${rows.map((row,i)=>`<rect class="chart-bar" x="${pad+i*step+(step-bar)/2}" y="${height-pad-vals[i]/max*plot}" width="${bar}" height="${vals[i]/max*plot}"><title>${row.period}: ${row.count} / ${row.total} projects (${pct(row.count,row.total)}); ${row.unknown} unknown</title></rect>${i%Math.max(1,Math.ceil(rows.length/8))===0||i===rows.length-1?`<text x="${pad+i*step+step/2}" y="${height-18}" text-anchor="middle">${row.period}</text>`:''}`).join('')}</svg><figcaption>${e(value?label(value):'All observed projects')} · ${share?'share of all observed projects in that period':'project count'} · empty periods mean no observed entries.</figcaption>`:'<p>No observed projects in this date range.</p>';
  const headers=['Period','Matching projects','All observed projects','Share of all observed (%)','Unknown / no recognized mention','With retained full text'];
  exportRows=[['Dimension',dimension,'Selected value',value||'all','Date basis',mentionDimensions.has(dimension)?'source post date, current text':'first source date, current labels'],headers,...rows.map(row=>[row.period,row.count,row.total,row.total?(row.count/row.total*100).toFixed(2):'',row.unknown,row.full])];
  $('trendTable').innerHTML=`<table class="insight-table"><caption>${e(dimensionLabels[dimension])}: ${e(value?label(value):'All observed projects')}</caption><thead><tr>${headers.map(title=>`<th scope="col">${title}</th>`).join('')}</tr></thead><tbody>${rows.map(row=>`<tr><th scope="row">${row.period}</th><td>${row.count}</td><td>${row.total}</td><td>${pct(row.count,row.total)}</td><td>${row.unknown}</td><td>${row.full}</td></tr>`).join('')}</tbody></table>`;
  paintEvidence();
}
function paintEvidence(){
  if(!data)return;const dimension=$('trendDimension').value,value=$('trendValue').value,from=$('trendFrom').value,to=$('trendTo').value,mentions=mentionDimensions.has(dimension);
  const rows=[];
  for(const game of data.games){
    if(!mentions&&((from&&game.firstSeenAt.slice(0,10)<from)||(to&&game.firstSeenAt.slice(0,10)>to)||value&&!valuesFor(game,dimension).includes(value)))continue;
    for(const post of game.observations){
      if(mentions&&((from&&post.at.slice(0,10)<from)||(to&&post.at.slice(0,10)>to)||value&&!(post[dimension]||[]).includes(value)))continue;
      const quote=mentions?post.evidence.find(item=>item.kind===dimension&&(!value||item.label===value)):game.fieldEvidence?.find(item=>item.field===dimension);rows.push({game,post,quote});if(!mentions)break;
    }
  }
  rows.sort((a,b)=>b.post.at.localeCompare(a.post.at));
  $('insightSources').innerHTML=rows.slice(0,evidenceLimit).map(({game,post,quote})=>`<li><${publicView?'h4':'h5'}><a href="${projectPath(game)}" target="_blank" rel="noopener noreferrer">${e(game.title)} ↗</a></${publicView?'h4':'h5'}><small>u/${e(game.author)} · ${e(dateLabel(post.at))} · ${e(post.coverage.replaceAll('-',' '))}${post.editedAt?' · Source edited':''}</small>${quote?`<blockquote>“${e(quote.text)}”</blockquote>`:''}<a class="text-link" href="${e(quote?.url||post.url)}" target="_blank" rel="noopener noreferrer">${quote?.url?'Classification source':'Original Reddit post'} ↗</a></li>`).join('')||'<li>No matching sources.</li>';
  $('sourceCount').textContent=`${Math.min(evidenceLimit,rows.length)} of ${n(rows.length)} matching source records`;$('moreInsightSources').hidden=rows.length<=evidenceLimit;
}
function paintComparison(){
  if(!data)return;const release=modelReleases[Number($('releaseEvent').value)],dimension=$('comparisonDimension').value,value=$('comparisonValue').value;if(!release||!value){$('releaseComparison').textContent='No matching evidence is available.';return;}
  const result=compareRelease(data.games,release,{dimension,value,days:Number($('comparisonWindow').value),observedThrough:Date.parse(data.source.coverageThrough||data.observedAt)}),{before,after}=result;
  const tableRows=[['Projects with posts',before.total,after.total],['Matching '+label(value),before.matched,after.matched],['Share of all projects',pct(before.matched,before.total),pct(after.matched,after.total)],['Unknown / no recognized mention',before.unknown,after.unknown],['Projects mentioning the model',before.model,after.model],['Model and selected type in same window',before.coMention,after.coMention],['Projects with retained full text',before.full,after.full]];
  const delta=result.incompleteAfter?'The after window is still incomplete; a comparable change is not reported yet.':result.delta===null?'There is not enough evidence on both sides to calculate a change.':`The observed share changed by ${result.delta>0?'+':''}${result.delta.toFixed(1)} percentage points.`;
  $('releaseComparison').innerHTML=`<p><a href="${release.url}" target="_blank" rel="noopener noreferrer">${e(release.name)} provider announcement ↗</a> · ${release.date}</p><div class="insight-table-wrap" tabindex="0" role="region" aria-label="Before and after data"><table class="insight-table"><caption>${e(label(value))}: equally sized windows, each project counted once per window.</caption><thead><tr><th scope="col">Observed measure</th><th scope="col">Before<br><small>${before.start} to ${before.end}</small></th><th scope="col">After<br><small>${after.start} to ${after.end}</small></th></tr></thead><tbody>${tableRows.map(row=>`<tr><th scope="row">${e(row[0])}</th><td>${e(row[1])}</td><td>${e(row[2])}</td></tr>`).join('')}</tbody></table></div><div class="insight-callout"><p>${delta} ${result.smallSample?'Fewer than 20 projects appear in at least one window; treat this as a small sample.':''} ${result.incompleteAfter?'The archive has not yet covered the full after window.':''}</p><p>This is an observational comparison. Model mentions do not establish use, and shared timing does not show that a model caused a change. Community growth, multiple releases, missing sources and later edits may explain differences.</p></div>`;
}
function paintUsage(){
  if(!usage)return;const totals=new Map();for(const row of usage.daily)totals.set(row.event,(totals.get(row.event)||0)+row.count);
  const labels={page_view:'Page views',game_view:'Project opens',game_outbound:'Game-link clicks',favorite_save:'Favorite saves',favorite_remove:'Favorite removals',rating_save:'Rating saves or edits',feedback_save:'Feedback saves or edits',research_start:'Reviews started',research_complete:'Reviews saved',quiz_start:'Quiz rounds started',quiz_complete:'Quiz rounds saved'};
  $('usageInsights').innerHTML=`<p>Since ${e(usage.since)}. Counts start with this release. These are actions, not unique people, verified plays or a conversion funnel. Privacy preferences, blockers and offline visits reduce coverage.</p>${totals.size?distribution([...totals].map(([event,count])=>({label:labels[event]||event,count})),[...totals.values()].reduce((a,b)=>a+b,0)):'<p>No measured actions yet. Counts will appear as the community visits.</p>'}`;
  const community=usage.community;
  $('feedbackInsights').innerHTML=`<p>${n(community.feedback.count)} current public contributions across ${n(community.feedback.games)} games · ${n(community.ratings.count)} saved ratings · ${n(community.research.count)} saved questionnaire responses. One browser can contribute to several games.</p>${community.choices.length?distribution(community.choices.map(row=>({label:feedbackOptions.find(option=>option.id===row.choice)?.label||row.choice,count:row.count})),community.feedback.count):'<p>No quick-choice feedback yet. Responses will show what catches players’ eyes and what they want improved.</p>'}<p class="insight-method">Quick choices allow multiple answers, so percentages need not add to 100%. Questionnaire answers remain private; inspect their revision-specific results in Questionnaires.</p>`;
}
