import { escHtml as e } from './utils.js';
import { valuesFor, breakdown } from './insight-analysis.js';
import { projectPath } from './project-url.js';
import { dateLabel } from './collection.js';
import { storeListings, storeStates, priceStates, releaseCalendar } from './store-insights.js';
import { renderProjectList } from './insight-projects.js';

export function renderTechniques(root,games,onTrend) {
  if(!root)return;
  const techniques=breakdown(games,'techniques').filter(row=>row.label!=='No recognized technique mention');
  const resources=breakdown(games,'resources').filter(row=>row.label!=='No recognized tool / asset mention');
  const known=games.filter(game=>valuesFor(game,'techniques').length).length;
  root.innerHTML=`<section class="insight-section" aria-labelledby="techniquesTitle"><p class="eyebrow">HOW IT IS MADE</p><h3 id="techniquesTitle">Techniques &amp; resources</h3><p>Follow the workflow behind the game. ${known} of ${games.length} projects mention a recognized technique; the rest remain unclassified. These are source-text matches, not a judgement of quality or proof of tool use.</p><div class="insight-controls"><div class="field"><label for="techniqueSelect">Technique</label><select id="techniqueSelect" class="select"><option value="">Choose a technique</option>${techniques.map(row=>`<option value="${e(row.label)}">${e(row.label)} (${row.count})</option>`).join('')}</select></div><div class="field"><label for="resourceSelect">Tool or asset source</label><select id="resourceSelect" class="select"><option value="">Any tool or asset source</option>${resources.map(row=>`<option value="${e(row.label)}">${e(row.label)} (${row.count})</option>`).join('')}</select></div><button type="button" class="btn btn--secondary" data-technique-trend>See through time</button></div><p class="insight-method">A project can mention several techniques or resources. Open the source to see whether the maker used, compared or ruled them out. No technique is inferred from its artwork.</p><div data-technique-feature class="technique-feature"></div><div data-technique-projects class="insight-results"></div></section>`;
  const select=root.querySelector('#techniqueSelect'),resource=root.querySelector('#resourceSelect');
  select.value=techniques.find(row=>row.label.startsWith('3D blockout'))?.label||techniques[0]?.label||'';
  function paint() {
    const dimension=select.value?'techniques':'resources',value=select.value||resource.value;
    const matches=games.filter(game=>(!select.value||valuesFor(game,'techniques').includes(select.value))&&(!resource.value||valuesFor(game,'resources').includes(resource.value)))
      .sort((a,b)=>b.updatedAt.localeCompare(a.updatedAt));
    const feature=root.querySelector('[data-technique-feature]');
    const sample=matches.flatMap(game=>(game.observations||[]).flatMap(post=>post.evidence.filter(item=>item.kind===dimension&&item.label===value).map(item=>({game,post,item})))).sort((a,b)=>b.post.at.localeCompare(a.post.at))[0];
    feature.innerHTML=sample?`<div><span class="eyebrow">WORKFLOW IN FOCUS</span><h4>${e(value)}</h4><p>Described by u/${e(sample.game.author)} · ${e(dateLabel(sample.post.at))}</p><a href="${projectPath(sample.game)}">Check project</a></div><div><blockquote>“${e(sample.item.text)}”</blockquote><a href="${e(sample.post.url)}" target="_blank" rel="noopener noreferrer">Read the maker’s explanation ↗</a></div>`:'';
    feature.hidden=!sample;
    renderProjectList(root.querySelector('[data-technique-projects]'),matches,{title:matches.length===1?'Featured project':value||'Projects in this selection',dimension:sample&&matches.length===1?undefined:dimension,value});
    root.querySelector('[data-technique-trend]').disabled=!value;
  }
  select.addEventListener('change',paint);resource.addEventListener('change',paint);
  root.querySelector('[data-technique-trend]').onclick=()=>onTrend(select.value?'techniques':'resources',select.value||resource.value);
  paint();
}

const priceLabel=entry=>entry.pricing==='free'?(entry.provider==='itch.io'?'No minimum price':'Free'):entry.price?`${entry.price.currency} ${(entry.price.cents/100).toFixed(2)}`:'Price not known';
function storeRows(entries) {
  return entries.map(entry=>`<li><div><a class="insight-project-title" href="${projectPath(entry.game)}">${e(entry.game.title)}</a><p>${e(entry.provider)} · ${e(storeStates[entry.state])} · ${e(priceLabel(entry))}${entry.game.demoAvailable?' · Demo available':''}${entry.game.browserBuild?' · Browser build':''}</p>${entry.planned?`<p class="release-plan">Planned: ${e(entry.planned.label)}</p>`:''}<small>${entry.game.storeCheckedAt?`Store checked ${e(dateLabel(entry.game.storeCheckedAt))}`:'Store metadata not checked'}${entry.games.length>1?` · ${entry.games.length} catalogue entries for this listing`:''}</small></div><div class="insight-project-actions"><a href="${projectPath(entry.game)}">Check project</a><a href="${e(entry.url)}" target="_blank" rel="noopener noreferrer">${e(entry.provider)} ↗</a></div></li>`).join('');
}
export function renderStores(root,games) {
  if(!root)return;
  const entries=storeListings(games);
  root.innerHTML=`<section class="insight-section" aria-labelledby="storesTitle"><p class="eyebrow">AVAILABILITY / RELEASES</p><h3 id="storesTitle">From showcase to store</h3><p>See what is released, what you can try and what is still on the way. Counts use distinct store listings, so repeated showcases of one Steam app count once.</p><div class="store-summary">${['Steam','itch.io'].map(provider=>{
    const items=entries.filter(entry=>entry.provider===provider);
    return `<section><h4>${provider}</h4><p>${items.length} linked listings</p><dl><div><dt>Released games</dt><dd>${items.filter(entry=>entry.state==='released').length}</dd></div><div><dt>Released demos / demo available</dt><dd>${items.filter(entry=>entry.state==='demo'||entry.game.demoAvailable).length}</dd></div><div><dt>Free / no minimum price</dt><dd>${items.filter(entry=>entry.pricing==='free').length}</dd></div><div><dt>Unknown price</dt><dd>${items.filter(entry=>entry.pricing==='unknown').length}</dd></div></dl></section>`;
  }).join('')}</div><div class="insight-controls"><div class="field"><label for="storeProviderFilter">Store</label><select class="select" id="storeProviderFilter"><option value="">Both stores</option><option>Steam</option><option>itch.io</option></select></div><div class="field"><label for="storeStateFilter">Release status</label><select class="select" id="storeStateFilter"><option value="">All statuses</option>${Object.entries(storeStates).filter(([key])=>entries.some(entry=>entry.state===key)).map(([key,label])=>`<option value="${key}">${label}</option>`).join('')}</select></div><div class="field"><label for="storePriceFilter">Price</label><select class="select" id="storePriceFilter"><option value="">All prices</option>${Object.entries(priceStates).filter(([key])=>entries.some(entry=>entry.pricing===key)).map(([key,label])=>`<option value="${key}">${label}</option>`).join('')}</select></div></div><p class="insight-method">Release status describes the listing, not tested gameplay. Itch.io’s “Released” label is supplied by the maker. A browser build does not establish a free download; optional donations may still be offered. Unknown prices stay unknown. Free demos do not make the full game free.</p><div data-store-results></div></section><section class="insight-section" aria-labelledby="upcomingTitle"><h3 id="upcomingTitle">Steam release calendar</h3><p>Planned dates from community games’ Steam listings. Dates can change; each game links to its latest store page. Month, quarter and year-only announcements stay separate from exact dates.</p><div data-release-calendar></div></section>`;
  let limit=12;
  function paint(){
    const provider=root.querySelector('#storeProviderFilter').value,state=root.querySelector('#storeStateFilter').value,pricing=root.querySelector('#storePriceFilter').value;
    const selected=entries.filter(entry=>(!provider||entry.provider===provider)&&(!state||entry.state===state)&&(!pricing||entry.pricing===pricing));
    root.querySelector('[data-store-results]').innerHTML=`<p class="insight-result-count" role="status">${selected.length} matching store listings</p><ul class="insight-project-list">${storeRows(selected.slice(0,limit))||'<li>No listings match these filters.</li>'}</ul>${selected.length>limit?'<button type="button" class="btn btn--secondary" data-stores-more>Show more listings</button>':''}`;
  }
  root.querySelectorAll('.insight-controls select').forEach(select=>select.addEventListener('change',()=>{limit=12;paint();}));
  root.onclick=event=>{if(event.target.closest('[data-stores-more]')){limit+=12;paint();root.querySelector('[data-stores-more]')?.focus({preventScroll:true});}};
  paint();renderCalendar(root.querySelector('[data-release-calendar]'),entries);
}

function renderCalendar(root,entries) {
  const today=new Date().toISOString().slice(0,10),current=today.slice(0,7),months=new Set();
  for(let i=0;i<6;i++){const date=new Date(current+'-01T12:00:00Z');date.setUTCMonth(date.getUTCMonth()+i);months.add(date.toISOString().slice(0,7));}
  for(const entry of entries)if(entry.planned?.month>=current)months.add(entry.planned.month);
  const options=[...months].sort(),monthLabel=value=>new Intl.DateTimeFormat('en',{month:'long',year:'numeric',timeZone:'UTC'}).format(new Date(value+'-01T12:00:00Z'));
  root.innerHTML=`<div class="calendar-toolbar"><button type="button" class="btn btn--secondary" data-month-prev aria-label="Previous release month">←</button><div class="field"><label for="releaseMonth">Release month</label><select id="releaseMonth" class="select">${options.map(month=>`<option value="${month}">${monthLabel(month)}</option>`).join('')}</select></div><button type="button" class="btn btn--secondary" data-month-next aria-label="Next release month">→</button></div><div data-calendar-body></div>`;
  const select=root.querySelector('select');let chosen='';
  function paint(){
    const month=select.value,{scheduled,broader,overdue}=releaseCalendar(entries,month,today);
    const first=new Date(month+'-01T12:00:00Z'),offset=(first.getUTCDay()+6)%7,days=new Date(Date.UTC(first.getUTCFullYear(),first.getUTCMonth()+1,0)).getUTCDate();
    const exact=scheduled.filter(entry=>entry.planned.precision==='day'),vague=scheduled.filter(entry=>entry.planned.precision==='month');
    root.querySelector('[data-month-prev]').disabled=select.selectedIndex===0;root.querySelector('[data-month-next]').disabled=select.selectedIndex===options.length-1;
    root.querySelector('[data-calendar-body]').innerHTML=`<div class="release-calendar" aria-label="${monthLabel(month)} planned releases"><div class="calendar-week" aria-hidden="true">${['Mon','Tue','Wed','Thu','Fri','Sat','Sun'].map(day=>`<span>${day}</span>`).join('')}</div><div class="calendar-days">${'<span class="calendar-blank" aria-hidden="true"></span>'.repeat(offset)}${Array.from({length:days},(_,i)=>{
      const day=month+'-'+String(i+1).padStart(2,'0'),matches=exact.filter(entry=>entry.planned.date===day);
      return matches.length?`<button type="button" data-release-day="${day}" aria-pressed="${chosen===day}" aria-label="${day}: ${matches.length} planned ${matches.length===1?'release':'releases'}"><span>${i+1}</span><strong>${matches.length}<span class="calendar-day-label"> ${matches.length===1?'game':'games'}</span></strong></button>`:`<span class="calendar-day${day===today?' is-today':''}">${i+1}</span>`;
    }).join('')}</div></div><div class="insight-result-heading"><h4>${chosen?`Planned for ${chosen}`:`Exact dates in ${monthLabel(month)}`}</h4>${chosen?'<button type="button" class="text-button" data-calendar-clear>Show the whole month</button>':''}</div><ul class="insight-project-list">${storeRows(exact.filter(entry=>!chosen||entry.planned.date===chosen))||'<li>No exact dates announced for this month in this selection.</li>'}</ul>${vague.length?`<h4>Expected this month, day not announced</h4><ul class="insight-project-list">${storeRows(vague)}</ul>`:''}<details class="release-unscheduled"><summary>Broader windows &amp; unannounced dates (${broader.length})</summary><ul class="insight-project-list">${storeRows(broader)}</ul></details>${overdue.length?`<details><summary>Past announced dates, still marked upcoming (${overdue.length})</summary><p>These listings need a fresh store check. A passed date does not confirm a launch.</p><ul class="insight-project-list">${storeRows(overdue)}</ul></details>`:''}`;
  }
  select.addEventListener('change',()=>{chosen='';paint();});
  root.onclick=event=>{
    const previous=event.target.closest('[data-month-prev]'),next=event.target.closest('[data-month-next]'),day=event.target.closest('[data-release-day]');
    if(previous||next){select.selectedIndex+=previous?-1:1;chosen='';paint();}
    else if(day){chosen=day.dataset.releaseDay;paint();root.querySelector(`[data-release-day="${chosen}"]`)?.focus({preventScroll:true});}
    else if(event.target.closest('[data-calendar-clear]')){chosen='';paint();select.focus({preventScroll:true});}
  };
  paint();
}
