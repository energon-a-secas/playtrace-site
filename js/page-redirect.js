const link=document.getElementById('canonicalPage');
if(link){
  const target=new URL(link.href);
  if(target.origin===location.origin){
    target.search=location.search;target.hash=location.hash;
    link.href=target.href;location.replace(target.href);
  }
}
