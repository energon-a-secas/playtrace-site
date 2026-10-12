# Source, feedback and destination follow-up — October 12, 2026

This release completes four bounded batches: recent-project metadata, cited feedback publication, questionable destinations and optional before/after-play comparisons. Production editorial changes were rehearsed against private backups, rebased onto a fresh snapshot and applied with row equality guards. Browser and runtime tests use disposable visitor data.

## Reviewed metadata

- Reviewed the 50 newest entries with a missing genre/build state or a headline-length title.
- Accepted 76 source-backed field observations across 38 projects, plus two older URL-format corrections. New field observations cite the exact archived post or store evidence; manual details and all 17 existing approved uploads were preserved.
- Recovered the real game destinations for Startrail, Wordminos, Boardwalk Boss and Grand Total Anarchy; removed a hardware-support page from Croissant Panic’s play action. Another One now links to its Steam page with store-backed metadata. A coming-soon full game is not silently marked released because a post mentions a demo.
- Added Survival as a reusable category. Unnamed footage, private tests and the warehouse-app showcase remain flagged where the source cannot establish a game name, public build or scope.
- Hardened destination extraction against art generators, documentation, making-of pages and Markdown punctuation. HTTPS upgrades of explicit HTTP source links are checked before being accepted as reachable.

The public fact files are `data/catalogue-reviewed-followup-october12.json` and `data/catalogue-reviewed-link-repairs-october12.json`. They overlap intentionally for the destinations included in both review batches; the database accepts 78 distinct field observations.

## Feedback publication

Twenty new editorial summaries use 38 comments rechecked against the current archive. Labels preserve preview, self-reported play and unspecified experience. For example, Frontier Pool has a reported loading hang, Ninefir has visual-polish suggestions, and the PS1 driving game has feedback on purpose and pacing. Several comments can come from one person; citation counts are not unique-player counts.

There are now 27 published summaries with 64 Reddit citations and one public Playtrace citation across the report. The source-checked decisions are in `data/feedback-reviewed-followup-october12.json`. Jev drafts remain subject to review; no pending model output was bulk-published. Public summaries and the pattern report keep source links and investigate possible themes without claiming representative sentiment or causation.

## Link standing

A single bounded batch revisited all 72 destinations previously classified as broken, blocked or unverified. Eleven are now reachable, including Freedom Wars after a Markdown correction; one hardware documentation URL was removed from the game action. Ridge Run’s punctuation was repaired, but the corrected destination still returned HTTP 404. Expired SwissTransfer download links remain visibly distinct from permanent game hosting.

The complete post-update snapshot has 1,320 projects and 605 listed game destinations:

| Latest observation | Projects |
| --- | ---: |
| Reachable page or store metadata | 542 |
| HTTP 404/410 | 17 |
| Access/rate restriction | 2 |
| Unverified | 41 |
| Not checked yet | 3 |

The last three include recently ingested entries. An inconclusive request is not a dead game. The archive gained two projects during this review; the whole-catalogue totals are dated observations, not a controlled before/after comparison.

Migration 0015 retains up to 52 checks per project and preserves the previously stored latest check with its original date. Project pages show the latest 12 observations for their current URL. Stored fields include requested/final URLs, check dates, HTTP status, redirects and failure reason. Hosting labels describe the URL; custom-domain infrastructure is not inferred. The public Insights page provides host/check filters and a follow-up list. It reports snapshots, not uptime.

Uncertain browser links become eligible weekly; reachable ones monthly. The queue adds at most one per hourly tick with eight outstanding link jobs and the shared 72-job daily limit. Eligibility is not a guaranteed execution date. Existing store maintenance handles Steam and itch.io.

## Paired expectations

An optional disclosure next to project feedback saves interest before play, then lets that browser return to compare interest and expectations after playing. The baseline is fixed once a follow-up exists. Optimistic revisions prevent stale overwrites, and duplicate consolidation keeps a complete pair together. Visitors can edit or remove their comparison without signing in.

Only aggregate counts are public. The report uses first impressions saved in the last 60 days and counts only later answers in paired results. Missing follow-ups are not treated as disappointment or conversion failure; Reddit identities are never matched to browser keys. The live report currently has no paired responses; no synthetic contributions were written to production.

## Validation

254 Node checks, 11 schema checks and 67 workerd checks passed. Eleven browser scenarios cover guest save/return/remove, dated link history, hosting filters, 320–1440px layouts, light/dark accessibility, admin publishing, reduced motion and rapid home-panel hover reversals. Read-only production checks verified the new API, published summaries, retained link history and a complete build of 1,320 project pages.
