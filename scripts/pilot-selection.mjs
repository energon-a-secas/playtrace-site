import { createHash } from 'node:crypto';
import { distributionFor } from '../js/collection.js';

export const pilotStratum = game => `${game.firstSeenAt.slice(0,4)} / ${distributionFor(game.projectUrl)?.label || 'No project link'}`;
// A repeatable quality sample, deliberately balanced across age and destination.
// It is not a random sample and must not be used to estimate market shares.
export function selectPilot(games, size=100) {
  if(!Number.isSafeInteger(size)||size<1||size>100)throw new Error('Pilot size must be between 1 and 100.');
  const rank=game=>createHash('sha256').update('playtrace-evidence-v1:'+game.id).digest('hex');
  const groups=new Map(),chosen=new Map();
  for(const game of games){const key=pilotStratum(game);if(!groups.has(key))groups.set(key,[]);groups.get(key).push(game);}
  for(const group of groups.values())group.sort((a,b)=>rank(a).localeCompare(rank(b)));
  // Regression sentinels cover manual artwork, a Steam demo and playable GitHub Pages.
  for(const id of ['g_1wxpc76','g_1x36ues','g_1x376pc','g_1x21qj3']){
    const game=games.find(item=>item.id===id);if(game&&chosen.size<size)chosen.set(id,game);
  }
  const ordered=[...groups].sort(([a],[b])=>a.localeCompare(b));
  while(chosen.size<Math.min(size,games.length)){
    let added=0;
    for(const [,group]of ordered){let game;do{game=group.shift();}while(game&&chosen.has(game.id));if(game){chosen.set(game.id,game);added++;}if(chosen.size===size)break;}
    if(!added)break;
  }
  return [...chosen.values()];
}
