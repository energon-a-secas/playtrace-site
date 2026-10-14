import { escHtml as e } from './utils.js';
import { DEFAULT_CATEGORIES } from './categories.js';

const date = value => new Date(value).toLocaleDateString('en', { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' });
const period = week => `${date(week.start)} – ${date(week.end)}`;
const label = value => value.replace(/-/g, ' ').replace(/^./, char => char.toUpperCase());
const movement = (a, b) => a === b ? 'No change' : `${a > b ? '+' : '−'}${Math.abs(a - b)}`;

export function weeklyBriefView(brief) {
  const { latest: a, previous: b, changes } = brief;
  const categoryName = value => [...(brief.categories || []), ...DEFAULT_CATEGORIES].find(item => item.id === value)?.label || label(value);
  const rows = [['Newly shared projects', a.arrivals, b.arrivals], ['Projects with a source post', a.active, b.active],
    ['Source posts', a.posts, b.posts], ['New arrivals with a currently available build', a.availableBuilds, b.availableBuilds]];
  const comparison = `<div class="insight-table-wrap" tabindex="0" role="region" aria-label="Weekly activity comparison"><table class="insight-table weekly-brief-table"><caption>Original post dates, grouped by complete UTC weeks</caption><thead><tr><th scope="col">Observed activity</th><th scope="col">${e(period(a))}</th><th scope="col">${e(period(b))}</th><th scope="col">Change</th></tr></thead><tbody>${rows.map(([name, value, previous]) => `<tr><th scope="row">${e(name)}</th><td>${value}</td><td>${previous}</td><td>${movement(value, previous)}</td></tr>`).join('')}</tbody></table></div>`;
  const mix = [['category', 'Genres among new arrivals'], ['styles', 'Art styles mentioned'], ['models', 'Models mentioned']].map(([key, heading]) => {
    const current = a.distributions[key], previous = b.distributions[key];
    return `<li><div><h4>${heading}</h4><p class="field__hint">${current.total} ${key === 'category' ? 'new arrivals' : 'active projects'}; ${current.unknown} ${key === 'category' ? 'unclassified' : 'without a recognized mention'}.</p></div><div>${current.values.length ? `<ul class="weekly-brief-labels">${current.values.slice(0, 3).map(item => {
      const before = previous.values.find(row => row.label === item.label)?.count || 0;
      return `<li><strong>${e(key === 'category' ? categoryName(item.label) : item.label)}</strong><span>${item.count} / ${current.total} <small>previous: ${before} / ${previous.total}</small></span></li>`;
    }).join('')}</ul>` : '<p>No classified evidence in this week. An empty sample is not evidence of no activity.</p>'}</div></li>`;
  }).join('');
  const correction = changes ? `<p>Compared with the snapshot observed on <strong>${e(date(changes.from))} at ${e(changes.from.slice(11, 16))} UTC</strong>${Date.parse(changes.to) - Date.parse(changes.from) < 7 * 86400000 ? '. This baseline is less than a week old' : ''}.</p><ul class="weekly-brief-changes"><li><strong>${changes.newlyShared}</strong> newly indexed entries first shared after that observation</li><li><strong>${changes.backfilled}</strong> earlier entries recovered from the archive</li><li><strong>${changes.metadataUpdated}</strong> existing entries with changed details</li><li><strong>${changes.evidenceUpdated}</strong> existing entries with changed source evidence or history</li><li><strong>${changes.regrouped}</strong> entries affected by regrouping; <strong>${changes.removed}</strong> no longer indexed</li></ul>`
    : '<p>The first dated checkpoint is saved. Catalogue-change comparisons will appear after the next successful publication.</p>';
  return `<header class="weekly-brief-heading"><div><p class="eyebrow">THE WEEK IN THE ARCHIVE</p><h3 id="weeklyBriefTitle">${e(period(a))}</h3></div><a class="text-link" href="data/weekly-brief.json" download>Download report</a></header><p>Observed ${e(date(brief.observedAt))} at ${e(brief.observedAt.slice(11, 16))} UTC. These are the latest two complete calendar weeks. Archive coverage can lag behind the community.</p>${comparison}<ul class="weekly-brief-mix">${mix}</ul><p class="field__hint">Showing up to three labels per group; a project can mention more than one. ${a.fullText} / ${a.active} active projects have full source text for the latest week. ${a.unknownBuilds} / ${a.arrivals} new arrivals have an unknown build state. Genres and availability use today’s metadata; model and art-style mentions use posts from the stated week. A mention does not prove use, and timing does not establish a model’s effect.</p><details class="weekly-brief-history"><summary>What changed in the catalogue?</summary>${correction}<p class="field__hint">Detail changes and source changes can overlap. Regrouped entries are merges or splits of known sources, not new games. Check dates alone do not count as changes.</p></details><div class="feedback-actions"><a class="text-link" href="#trendTitle">Explore the underlying sources</a><a class="text-link" href="#feedbackPatternTitle">Find questions to test next</a></div>`;
}
