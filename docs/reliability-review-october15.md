# Production follow-up and editorial review — October 15, 2026

The follow-up was measured and prepared on October 15 in Chile (October 16 UTC). It checks the previous deployment's database costs, reduces two remaining query costs, repairs verified destinations, and publishes another small editorial selection.

## Production read costs

Cloudflare's latest rolling 24-hour report is entirely after the previous deployment. The two previously expensive import writes now use indexed lookups:

| Operation | Earlier window: reads / executions | Latest window: reads / executions | Average reads, earlier → latest |
| --- | ---: | ---: | ---: |
| Save source references | 1,372,926 / 27 | 380 / 11 | 50,849 → 34 |
| Seed missing Reddit scores | 923,412 / 20 | 460 / 24 | 46,170 → 19 |

These are different workloads and rolling windows. Their combined reads fell from 2,296,338 to 840, while reads per execution also fell sharply. This is not a measurement of total account savings or proof that this site caused the earlier account quota issue.

The largest remaining query shape was project-score aggregation: 612,977 reads across 243 executions. It now looks up each requested project's best scored post and coverage through the existing indexes. It preserves negative scores, the date/ID tie-break, coverage, duplicate-ID handling, and current membership after history merges. Scores are still the highest single post score, never the sum of multiple posts.

The hourly feedback queue also needed an explicit join order: its earlier `IN` condition still allowed SQLite to scan published games even with no eligible notes. It now starts with eligible written feedback and looks up matching game IDs. The broader weekly selection and queue limits are unchanged.

Measured in local workerd/D1 with the production snapshot's actual post and score records:

| Operation | Previous reads | Revised reads |
| --- | ---: | ---: |
| Score lookup, one selected project | 14 | 10 |
| Score lookup, 20 selected projects | 249 | 205 |
| Score lookup, 200 selected projects | 2,486 | 2,060 |
| Score lookup, all 1,370 active projects | 17,178 | 14,227 |
| Hourly queue, no notes | 1,372 | 2 |
| Hourly queue, six eligible test notes | 1,388 | 24 |

Result rows were identical in every comparison. The six notes exist only in the local measurement database. The all-project score query saves about 17% in this controlled measurement; another full deployed day is needed to measure its production effect. No schema migration or polling increase is required.

## Verified catalogue corrections

The [field decisions](../data/catalogue-reviewed-october15.json) record 16 accepted observations, including two explicitly reviewed replacements of earlier accepted facts. Administrative overrides retain precedence.

- **Mind Bender Simulator:** the [current itch.io listing](https://fantastico-studio.itch.io/mind-bender-simulator) identifies the same game and studio. Its account name includes a hyphen missing from the old URL. The corrected listing returned 200 and identifies Windows support. Its download was not installed or playtested.
- **Merlion Defense:** the creator's old repository redirects to [merlion-defense](https://github.com/mhwang-1/merlion-defense), whose homepage points to the working browser build. The game destination and source-code repository remain separate fields.
- **Fjordfall:** four explicit posts by the same creator describe the skateboarding game, workshop, cats, UI and experimental NPCs. The [reviewed history decision](../data/history-reviewed-october15.json) combines them under the latest entry, preserving dates, source posts, the existing feedback summary, and redirects from the three old IDs. The entry now describes the underlying browser game; the NPC art feature remains explicitly a proof of concept.
- **Apple Gravity:** the creator supplies the name and draw-to-catch mechanics, replacing the generic post headline as its title.
- **Unnamed Clash Royale-inspired prototype:** Strategy replaces Simulation. The source describes a local development preview, so Playable becomes Prototype. No official name or public game link was invented.

Four destination checks were refreshed. Earlier failed URLs remain in stored, dated link history, alongside the new working destinations. The public project panel shows checks for the current URL, so an old address's 404 is not presented as a failure of its replacement. Eight obsolete reference-review flags were dismissed with an explicit resolution attached to their existing records.

After consolidation, the rehearsed catalogue contains 1,367 active projects. Its 629 listed destinations have 587 reachable observations, 15 broken observations, 24 unverified observations and three unchecked destinations. Another 738 projects have no listed destination. These are retained observations with their own check dates, not a simultaneous uptime survey. A 404 is not evidence of abandonment, and an HTTP 200 does not establish working gameplay.

## Feedback evidence

Seven [editorially reviewed summaries](../data/feedback-reviewed-october15.json) cite 11 freshly checked Reddit comments: Formula 8, Afterglow 86, Apple Gravity, the unnamed strategy prototype, Pixel Art Game Test, HADAL and Merkalis: Conquest.

Six citations describe playing, three concern previews, and two leave play experience unspecified. Merkalis includes a trailer reaction followed by a demo report from the same person; the summary explicitly avoids presenting these as independent playtests. The trackpad report keeps device context separate from a demonstrated cause. Difficulty reactions do not establish typical scores, and reported navigation problems are not labelled reproduced bugs.

This is an editorial sample, not a random sample of community sentiment. One-comment summaries identify their limited basis. Generic model arguments, creator replies and comments advertising unrelated games were excluded. Selected labels and prose were reviewed directly; model classifications were not treated as validation.

All 11 selected IDs were checked in one archive request. Two additional bounded archive requests checked source posts for this batch. Recent saved responses were reused when rebasing; citation-maintenance budgets and cooldowns were not bypassed. Published summary storage rises from 81 to 88 while all 81 previous summaries remain unchanged.

## Validation

All 311 JavaScript tests, 11 schema tests and 89 local workerd checks passed. Controlled query measurements cover the production snapshot and a synthetic 1,400-project catalogue. Production received no synthetic ratings, notes or usage events.

The combined data plan was rehearsed against a fresh production export. Its 103 precondition guards precede content changes; all 170 statements are under the D1 statement-size limit. Rehearsal preserves all 17 uploaded previews, admin overrides, visitor/account records, existing feedback summaries, source-post counts and historical link observations. Three aliases replace duplicate catalogue entries without deleting their archived records.

The Worker query update was deployed as `65d61d86-a1ba-49e9-8d37-357db4da3d42`. Production accepted the 170-statement editorial transaction, reading 598 rows. Public API verification confirmed all seven summaries and 11 citations, six relevant project records, both repaired destinations, all three aliases, and Fjordfall's preserved summary.

Remaining follow-up is to measure the query update's full-day production costs and review the other 15 broken and 24 unverified destinations using creator evidence rather than guessed replacements.
