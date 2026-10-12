# Catalogue refresh, October 12, 2026

This campaign expanded the 100-project evidence pilot to every published project, added a separate Reddit score to discovery, and prepared weekly community ranking. All counts below are dated observations of this community archive, not estimates of the games market.

## Evidence and corrections

The preparation checked 1,403 source posts belonging to 1,313 projects and 220 due destinations. A source-specific identity correction separated STARBATTLE from Chapel Knights, bringing the collection to 1,314 projects without adding a source post. The other game's contributions and approved image stayed attached to Chapel Knights.

| Public evidence measure | Before | After |
| --- | ---: | ---: |
| Source posts with retained full text | 175 / 1,403 | 1,267 / 1,403 |
| Projects with a classified primary genre | 561 | 606 |
| Projects with a stated development stage | 558 | 580 |
| Projects with a game destination | 534 | 601 |
| Projects with recognized model/tool mentions | 265 | 627 |
| Projects with recognized art-style mentions | 51 | 117 |
| Projects with structured store evidence | 120 | 323 |

Both sides use the same current public projection and mention matcher. The increased mentions reflect recovered evidence, not an increase in creative output. The remaining 136 posts use their title/excerpt; missing art, model, release and genre evidence remains unknown.

There are 51 additional reviewed field observations: 41 from source/store evidence and ten from creator replies. Seven replies supplied missing destinations, including 1001 Nights, Quest Machina and Echoes of Somewhere. Six of those destinations responded successfully; the AI Odyssey destination remains unverified. A successful page response does not prove the game runs. Four reusable categories were added: Creature collector, Card game, Party game and Social deduction.

Unambiguous store genres can fill an otherwise unclassified primary genre. Mixed genres and general store tags such as Indie or Casual do not silently become a genre. Demo availability is separate from a full release. Link extraction now distinguishes a creator's earlier game from the project being introduced and recognizes browser-build wording following a link.

The preparation retained concurrent changes in 16 project groups instead of forcing a stale plan through. Source corrections do not overwrite admin details, uploaded artwork, favorites, ratings, feedback, questionnaire answers or price suggestions. All 15 approved previews matched the pre-campaign values. Unresolved scope, identity, destination and classification flags remain in the admin queue; they are not evidence for deleting a project.

## Reddit score and weekly picks

Every current project has a score observation, covering all 1,403 source posts. Browse can sort by Reddit score and shows a muted source link on each card. Its label exposes the archive observation date and coverage. The number is a net score from the archive, not a live count of upvotes or a Playtrace player rating. A multi-post project uses its highest individual post score, never a sum. Unknown values sort after observed zero and negative scores. The separate Reddit icon still opens the latest post.

Scores are retained independently of imported post payloads. Older archive observations cannot overwrite newer ones. Ingestion and the existing bounded source refresh update them; a score-only refresh invalidates the public discovery cache.

Weekly community picks use Playtrace stars. A project needs at least three ratings; its ranking score is `(sum of stars + 15) / (rating count + 5)`. This neutral three-star prior limits the effect of tiny samples. Qualifying older projects remain eligible. Admin pins, exclusions and the separate sixth editor pick still apply, and admins can choose recent-project rotation instead. Saturday rotation continues on the Santiago calendar.

At this campaign's verification there were no qualifying player ratings. The five recent/editorial selections therefore remain the fallback, with Aetherfall as the separate editor pick. No ratings were fabricated to populate a ranking.

## Published feedback

Six summaries were selected and rewritten from the existing review queue, supported by 25 individually checked archived Reddit comments. They cover 1565 — The Great Siege, the bike game, The Big Suck, the medieval settlement project, Tiny Tactics and Avoid Bubbles. Each citation was checked for author, text, project membership and membership in the August 11–October 11 review window. The summaries distinguish reactions to footage, reported play experiences and unverified technical advice.

The original AI classification was treated as a draft, not as proof of a theme. The public copy identifies an editorial summary and its citation count. Other drafts remain available for review; they were not bulk-published. This pass did not invoke additional paid classification.

## Repeatable preparation and validation

1. Apply `0013_reddit_scores.sql` before deploying the Worker. Keep the production export in a private directory with mode `0700`, and the export file at `0600`.
2. Run `scripts/enrichment-pilot.mjs` with `--backup`, `--output`, `--all`, `--due-only` and `--reviews data/catalogue-reviewed-facts.json`. The default remains the original 100-project pilot. Preparation only reads upstream services and writes a local report/SQL plan.
3. Use `scripts/rebase-catalogue-campaign.mjs` with the baseline, a fresh export, the prepared plan and a private output directory. Review skipped concurrent groups and guarded changes before applying through D1. Do not remove guards to force a conflict.
4. `scripts/prepare-reviewed-feedback.mjs` and `scripts/prepare-creator-facts.mjs` prepare the separately reviewed decisions. Citation checks and live-row equality guards must pass before applying their SQL. Creator replies need individual interpretation because they can recommend another person's game.
5. Invalidate discovery caches, fetch consistent complete public catalogue/insight revisions, and build the public artifact. Raw exports, comments, editorial queues and credentials are excluded from the artifact.

Validation includes 236 Node tests and 55 disposable workerd runtime checks. Browser checks cover sorting and shared URLs, the independent source link and whole-card action, combined search filters, tooltip dismissal, 320–1440px layouts, light/dark accessibility, and admin ranking-mode persistence. All interaction writes use local fixtures, never synthetic production contributions.

The generated site contains 1,314 project pages, of which 497 meet the current indexing threshold, plus 18 directory pages and 519 sitemap URLs. Google Search Console ownership and sitemap submission require the property owner's account; publishing valid metadata and a sitemap does not complete that step.
