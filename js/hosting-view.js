import { destinationHost, hostingReport, linkStates, linkReasons } from './link-health.js';
import { escHtml as e } from './utils.js';
import { dateLabel, safeUrl } from './collection.js';
import { projectPath } from './project-url.js';
import { hostingCharts, hostingSliceGames } from './hosting-charts.js';
import { renderProjectList, bindChart } from './insight-projects.js';

export function renderHosting(root,games){
  if(!root)return;
  const normalized=games.map(g=>({...g,link:g.link||{destination:destinationHost(g.projectUrl),status:g.linkState||'not-checked',checkedAt:g.linkCheckedAt}}));
  const all=hostingReport(normalized),providers=all.groups;
  root.innerHTML=`<section class="insight-section" aria-labelledby="hostingTitle"><p class="eyebrow">DESTINATIONS / CHECKS</p><h3 id="hostingTitle">Where games live</h3><p>${all.listed} projects have a game link; ${all.unlisted} have no listed destination. Hosting labels describe the URL, not verified server infrastructure. Custom domains keep their own hostname. File-transfer links are identified separately; their expiry does not establish that a project has stopped.</p>
    ${hostingCharts(normalized)}
    <div class="insight-results" data-hosting-projects hidden></div>
    <details class="insight-checks"><summary>Link checks and follow-up</summary>
    <div class="insight-controls"><div class="field"><label for="hostingProvider">Hosting or store</label><select id="hostingProvider" class="select"><option value="">All destinations</option>${providers.map(row=>`<option value="${row.id}">${e(row.label)} (${row.projects})</option>`).join('')}</select></div><div class="field"><label for="hostingStatus">Latest check</label><select id="hostingStatus" class="select"><option value="">All results</option>${Object.entries(linkStates).map(([id,label])=>`<option value="${id}">${label}</option>`).join('')}</select></div></div>
    <div data-hosting-result aria-live="polite"></div><p class="insight-method">Reported missing means HTTP 404 or 410. Access restrictions, rate limits, timeouts and DNS failures remain separate. A successful response or store metadata check does not prove gameplay works. Counts describe this catalogue snapshot, not host reliability or market share. Several projects can share one host or maker.</p></details></section>`;
  for(const figure of root.querySelectorAll('.hosting-pie'))bindChart(figure,(label,target)=>{
    const device=target.dataset.device;
    renderProjectList(root.querySelector('[data-hosting-projects]'),hostingSliceGames(normalized,device,label),{title:`${device==='desktop'?'Desktop':'Mobile'} · ${label}`,focus:true});
  });
  let limit=20;
  function paint(){
    const report=hostingReport(normalized,{provider:root.querySelector('#hostingProvider').value,status:root.querySelector('#hostingStatus').value});
    const attention=report.selected.filter(g=>g.link.status!=='reachable').sort((a,b)=>({broken:0,blocked:1,unverified:2,'not-checked':3}[a.link.status]-{broken:0,blocked:1,unverified:2,'not-checked':3}[b.link.status])||a.title.localeCompare(b.title));
    root.querySelector('[data-hosting-result]').innerHTML=`<p>${report.selected.length} matching projects · ${report.selected.filter(g=>g.link.checkedAt).length} have a dated check · ${attention.length} need a check or follow-up.</p><p class="field__hint">${report.selected.filter(g=>g.link.status==='reachable'&&Date.parse(g.link.recoveredAt)>=Date.now()-30*86400000).length} links recorded as reachable after a missing-page result in the last 30 days. Recovery tracking begins with retained checks; no change is inferred for older listings.</p><div class="insight-table-wrap" tabindex="0" role="region" aria-label="Hosting and current link checks"><table class="insight-table"><caption>Latest result per listed project</caption><thead><tr><th scope="col">Destination</th>${Object.values(linkStates).map(label=>`<th scope="col">${label}</th>`).join('')}<th scope="col">Different final host</th></tr></thead><tbody>${report.groups.map(row=>`<tr><th scope="row">${e(row.label)}<br><small>${row.projects} projects</small></th>${Object.keys(linkStates).map(key=>`<td>${row.states[key]}</td>`).join('')}<td>${row.redirected}</td></tr>`).join('')||'<tr><td colspan="7">No destinations match.</td></tr>'}</tbody></table></div>
    <details${root.querySelector('#hostingStatus').value?' open':''}><summary>Projects to check (${attention.length})</summary><ul class="insight-evidence">${attention.slice(0,limit).map(g=>`<li><h4><a href="${projectPath(g)}#linkChecks">${e(g.title)}</a></h4><p>${e(linkStates[g.link.status])}${g.link.httpStatus?` · HTTP ${g.link.httpStatus}`:''}${g.link.reason?` · ${e(linkReasons[g.link.reason]||'Check incomplete')}`:''} · ${g.link.checkedAt?`checked ${e(dateLabel(g.link.checkedAt))}`:'no dated check'}</p><a href="${e(safeUrl(g.projectUrl))}" target="_blank" rel="noopener noreferrer">${e(g.link.destination?.host||'Project destination')} ↗</a></li>`).join('')||'<li>No follow-up links in this selection.</li>'}</ul>${attention.length>limit?'<button type="button" class="text-button" data-hosting-more>Show more projects</button>':''}</details>`;
  }
  for(const select of root.querySelectorAll('select'))select.addEventListener('change',()=>{limit=20;paint();});
  root.onclick=event=>{if(event.target.closest('[data-hosting-more]')){limit+=20;paint();root.querySelector('details').open=true;}};
  paint();if(location.hash==='#hostingTitle')root.querySelector('#hostingTitle').scrollIntoView({block:'start'});
}
