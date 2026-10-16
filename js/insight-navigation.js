export function initInsightNavigation() {
  const nav=document.getElementById('insightNav');
  if(!nav)return;
  const aliases={weeklyBrief:'overview',trendTitle:'trends',modelComparisonTitle:'trends',releaseTimelineTitle:'stores',upcomingTitle:'stores',hostingTitle:'platforms',feedbackPatternTitle:'feedback',insightMethodTitle:'method',techniquesTitle:'techniques'};
  function show(focus=false){
    const hash=location.hash.slice(1),views=[...document.querySelectorAll('[data-insight-view]')];
    const name=views.some(view=>view.id===hash)?hash:aliases[hash]||'overview';
    views.forEach(view=>view.hidden=view.id!==name);
    nav.querySelectorAll('a').forEach(link=>{if(link.hash==='#'+name)link.setAttribute('aria-current','page');else link.removeAttribute('aria-current');});
    document.getElementById('insightScope').hidden=['feedback','method'].includes(name);
    const disclosure=document.getElementById(hash)?.closest('details');if(disclosure)disclosure.open=true;
    if(focus){const view=document.getElementById(name);view.focus({preventScroll:true});nav.scrollIntoView({block:'start'});}
  }
  nav.addEventListener('click',event=>{const link=event.target.closest('a');if(link){event.preventDefault();history.pushState(null,'',link.hash);show(true);}});
  window.addEventListener('hashchange',()=>show(true));
  window.addEventListener('popstate',()=>show());
  show();
}
