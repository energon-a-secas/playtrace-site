// One consistent read: changing, duplicate or partial pages never become a chart.
export async function collectInsightPages(request){
  let cursor='',head,total;const games=[],seen=new Set(),ids=new Set();
  do{
    const page=await request('/insights'+(cursor?`?cursor=${encodeURIComponent(cursor)}`:''));
    if(page.version!==1||!Array.isArray(page.games)||!page.pagination||!Number.isSafeInteger(page.pagination.total)||head&&head.generatedAt!==page.generatedAt||total!==undefined&&total!==page.pagination.total)throw new Error('The evidence changed while loading. Try again for a consistent view.');
    head ||= page;total=page.pagination.total;
    for(const game of page.games){if(ids.has(game.id))throw new Error('Duplicate project in evidence pages.');ids.add(game.id);games.push(game);}
    cursor=page.pagination.nextCursor;
    if(cursor&&(typeof cursor!=='string'||seen.has(cursor)||!page.games.length))throw new Error('Invalid evidence pagination.');
    if(cursor)seen.add(cursor);
    if(seen.size>100||games.length>total)throw new Error('Evidence exceeds publication bounds.');
  }while(cursor);
  if(games.length!==total)throw new Error('Evidence is missing projects.');
  return {...head,pagination:{total,nextCursor:null},games};
}
