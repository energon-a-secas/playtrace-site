import { destinationHost } from './link-health.js';
import { escHtml as e } from './utils.js';

// Browser is a delivery format, not evidence of desktop or mobile support.
export function deviceGroups(game) {
  const platforms = new Set((game.platforms || []).map(p => p.toLowerCase()));
  return {
    desktop: ['windows','macos','linux','pc','desktop'].some(p => platforms.has(p)),
    mobile: ['mobile','android','ios'].some(p => platforms.has(p)),
  };
}
export function hostingSlices(games, device) {
  const selected = games.filter(g => deviceGroups(g)[device]), counts = new Map();
  for (const game of selected) {
    const label = destinationHost(game.projectUrl)?.label || 'No listed destination';
    counts.set(label, (counts.get(label) || 0) + 1);
  }
  const rows = [...counts].map(([label,count]) => ({label,count,labels:[label]})).sort((a,b) => b.count-a.count || a.label.localeCompare(b.label));
  if (rows.length > 6) rows.splice(5, rows.length-5, {label:'Other destinations',count:rows.slice(5).reduce((sum,r) => sum+r.count,0),labels:rows.slice(5).map(r=>r.label)});
  return { total:selected.length, rows };
}
export function hostingSliceGames(games,device,label) {
  const row=hostingSlices(games,device).rows.find(row=>row.label===label);
  return row ? games.filter(game=>deviceGroups(game)[device]&&row.labels.includes(destinationHost(game.projectUrl)?.label||'No listed destination')) : [];
}
function wedge(start,portion) {
  const point=(angle,radius)=>`${60+radius*Math.cos((angle-90)*Math.PI/180)} ${60+radius*Math.sin((angle-90)*Math.PI/180)}`;
  // Two arcs also handle a single 100% category without an empty SVG path.
  const mid=start+portion*1.8,end=start+portion*3.6;
  return `M ${point(start,58)} A 58 58 0 0 1 ${point(mid,58)} A 58 58 0 0 1 ${point(end,58)} L ${point(end,33)} A 33 33 0 0 0 ${point(mid,33)} A 33 33 0 0 0 ${point(start,33)} Z`;
}
const colors = ['oklch(69% .13 30)','oklch(68% .12 245)','oklch(70% .10 190)','oklch(70% .10 300)','oklch(68% .12 145)','oklch(73% .08 90)','oklch(62% .13 350)','oklch(78% .12 60)','oklch(53% .12 270)','oklch(78% .11 165)','oklch(58% .08 55)','oklch(80% .09 320)'];
export function hostingCharts(games) {
  const labels = [...new Set(['desktop','mobile'].flatMap(device => hostingSlices(games,device).rows.map(r => r.label)))].sort();
  const palette = new Map(labels.map((label,i) => [label, colors[i%colors.length]]));
  palette.set('No listed destination','oklch(62% .025 255)');
  const figures = ['desktop','mobile'].map(device => {
    const {total,rows} = hostingSlices(games,device), title=device==='desktop'?'Desktop':'Mobile';
    let offset=0;
    const slices=rows.map(row => {
      const portion=row.count/total*100, start=offset;offset+=portion;
      const detail=`${row.label}: ${row.count} of ${total} projects (${portion.toFixed(1)}%). Show projects.`;
      return `<path d="${wedge(start*3.6,portion)}" fill="${palette.get(row.label)}" tabindex="0" role="button" data-chart-value="${e(row.label)}" data-device="${device}" data-chart-label="${e(detail)}" aria-label="${e(detail)}"><title>${e(detail)}</title></path>`;
    }).join('');
    return `<figure class="hosting-pie"><figcaption><h4>${title}</h4><p>${total} projects with stated ${device} support</p></figcaption>${total?`<div class="hosting-pie-body"><svg viewBox="0 0 120 120" role="group" aria-label="${title} destinations. Select a slice to see projects.">${slices}<text x="60" y="63" text-anchor="middle" aria-hidden="true">${total}</text></svg><ul class="hosting-legend">${rows.map(row => `<li><button type="button" data-chart-value="${e(row.label)}" data-device="${device}" data-chart-label="${e(row.label)}: ${row.count} of ${total} projects (${(row.count/total*100).toFixed(1)}%). Show projects."><span class="hosting-swatch" style="--slice-color:${palette.get(row.label)}" aria-hidden="true"></span><span>${e(row.label)}</span><strong>${row.count} <small>${(row.count/total*100).toFixed(1)}%</small></strong></button></li>`).join('')}</ul></div><p class="chart-tooltip" data-chart-tooltip role="tooltip" hidden></p>`:'<p>No device evidence yet.</p>'}</figure>`;
  }).join('');
  const unknown=games.filter(g => !deviceGroups(g).desktop&&!deviceGroups(g).mobile).length;
  const both=games.filter(g => deviceGroups(g).desktop&&deviceGroups(g).mobile).length;
  return `<div class="hosting-pies">${figures}</div><p class="insight-method">Each pie counts one listed destination per project, including missing links. ${both} projects support both device groups and appear in both. ${unknown} projects have neither device group specified and are outside these pies. Browser-only labels do not establish device compatibility. These are catalogue labels, not tested support.</p>`;
}
