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
  const rows = [...counts].map(([label,count]) => ({label,count})).sort((a,b) => b.count-a.count || a.label.localeCompare(b.label));
  if (rows.length > 6) rows.splice(5, rows.length-5, {label:'Other destinations',count:rows.slice(5).reduce((sum,r) => sum+r.count,0)});
  return { total:selected.length, rows };
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
      return `<circle cx="60" cy="60" r="46" fill="none" stroke="${palette.get(row.label)}" stroke-width="25" pathLength="100" stroke-dasharray="${portion} ${100-portion}" stroke-dashoffset="${-start}" transform="rotate(-90 60 60)"><title>${e(row.label)}: ${row.count} (${portion.toFixed(1)}%)</title></circle>`;
    }).join('');
    return `<figure class="hosting-pie"><figcaption><h4>${title}</h4><p>${total} projects with stated ${device} support</p></figcaption>${total?`<div class="hosting-pie-body"><svg viewBox="0 0 120 120" role="img" aria-label="${title} destinations. Counts and shares are listed alongside.">${slices}</svg><ul class="hosting-legend">${rows.map(row => `<li><span class="hosting-swatch" style="--slice-color:${palette.get(row.label)}" aria-hidden="true"></span><span>${e(row.label)}</span><strong>${row.count} <small>${(row.count/total*100).toFixed(1)}%</small></strong></li>`).join('')}</ul></div>`:'<p>No device evidence yet.</p>'}</figure>`;
  }).join('');
  const unknown=games.filter(g => !deviceGroups(g).desktop&&!deviceGroups(g).mobile).length;
  const both=games.filter(g => deviceGroups(g).desktop&&deviceGroups(g).mobile).length;
  return `<div class="hosting-pies">${figures}</div><p class="insight-method">Each pie counts one listed destination per project, including missing links. ${both} projects support both device groups and appear in both. ${unknown} projects have neither device group specified and are outside these pies. Browser-only labels do not establish device compatibility. These are catalogue labels, not tested support.</p>`;
}
