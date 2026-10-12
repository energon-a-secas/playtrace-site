// Preserve shared feedback links and section anchors when a history is joined.
const link=document.getElementById('canonicalProject');
if(link){
  const url=new URL(link.href,location.href);
  if(url.origin===location.origin&&/^\/games\/g_[a-z0-9]{5,12}\/$/.test(url.pathname)){
    url.search=location.search;url.hash=location.hash;location.replace(url.href);
  }
}
