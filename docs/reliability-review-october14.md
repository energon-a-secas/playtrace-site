# Reliability and targeted review — October 14, 2026

Two background writes scanned the published catalogue before matching small incoming JSON batches. Cloudflare's rolling 24-hour report attributed 1,372,926 row reads to saving source references and 923,412 to seeding missing Reddit scores. These measured Playtrace costs do not establish that Playtrace alone exhausted the account's earlier allowance.

Both writes now start from the incoming records and look up source/game primary keys. Unchanged references no longer produce another write. The hourly feedback queue starts from eligible written notes. No schema migration or billing change is required. See [Cloudflare's query metrics](https://developers.cloudflare.com/d1/observability/metrics-analytics/) and [SQLite's join-order guarantee](https://sqlite.org/optoverview.html#manual_control_of_query_plans_using_cross_join).

## Measurement

Local workerd/D1, 1,400 synthetic projects, identical saved rows. Each write was measured separately and returned these counts:

| Incoming records | Previous rows read | Revised rows read |
| --- | ---: | ---: |
| 1 | 5,599 | 3 |
| 40 | 60,199 | 120 |
| 100 | 144,199 | 300 |

The 40-record probe saves about 99.8% of reads for these operations. This is a controlled query measurement, not a reduction already observed in daily production usage. Recheck the rolling report after a complete deployed day, separating revised query shapes from older versions.

## Archive coordination

Ingestion and media hydration now honor the archive deadline used by source refresh, citations, scores and editorial jobs. Ingestion publishes a 429 deadline before its bounded short retry. Atomic updates preserve longer deadlines and the independent Jev cooldown. Deferred collection preserves its coverage checkpoints.

Citation maintenance recovered on schedule before deployment: eight projects checked, one existing creator-link 404 flagged, no summaries withdrawn. Its request budget is unchanged; no additional citation-maintenance run was forced.

## Editorial results

Reviewed 22 targeted projects and accepted 21 new field observations, changing 13 visible entries. Six destination checks were refreshed. [Source-linked decisions](../data/catalogue-reviewed-october14.json) include Easy Roads, Quank's tentative name, Ictus's Rhythm category and development context for Mechrachnophobia.

A creator reply supplies Misty and the Last Breeze's Steam page. Store evidence confirms Windows and an upcoming release, without establishing a playable demo or selling price. Mind Bender Simulator's itch.io URL still returns 404. Fjordfall's skateboarding page needs an identity check against the NPC-art showcase. Both remain flagged without removing their entries.

Toilet Plunge already has an accepted Clicker fact, but an explicit admin category of Other overrides it. That choice is preserved and explained in its review flag. Missing URLs remain unlisted when a creator says a link was added but the archive does not contain it.

Ten [reviewed summaries](../data/feedback-reviewed-october14.json) use 24 individually checked comments, including The Manor. Explicit play reports, preview reactions and unspecified experience remain separate. Full evidence and SQL backups stay in private operator files.

The feedback preparation command checks source-health records and guards them against concurrent changes. `--comments` can reuse a saved archive response no older than 24 hours during rebasing. Selected summaries report their reviewed sample rather than inheriting a larger draft's classification count.

Public summary coverage now counts the actual citations by source. This keeps a selected review from displaying a missing draft count or implying that every retained comment appears in its published evidence.

Validation covers query plans, saved-row equivalence, shared cooldowns, checkpoint preservation, feedback deduplication and source changes before publication. Operator checks preserve existing reviews, visitor/account data, admin edits and uploaded previews. No synthetic visitor activity is sent to production.

## Publication checks

Validation passed for the complete JavaScript suite, 11 schema tests and 89 local workerd checks. The combined data transaction was rehearsed against a fresh production export: 1,348 active projects retained, 81 published summaries after the batch, all 17 uploaded previews preserved, and no changes to visitor contributions or administrative overrides. Six dated link observations were added without dropping prior observations.

The Worker was deployed as `50be39dc-4dbe-423a-9b32-96df6d973af2`. Production accepted all 155 guarded statements; that editorial transaction read 310 rows. The query-cost improvement still needs a complete deployed day of production observations before evaluating its effect on daily usage.
