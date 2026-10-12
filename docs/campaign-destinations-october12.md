# Game destinations and playability feedback — October 12, 2026

This bounded continuation reviews misleading or inconclusive game links and publishes source-checked feedback. The selection targets known data gaps; it is not a representative sample of the community or an uptime survey.

## Destination corrections

Reviewed 32 projects, refreshed 37 source posts, and accepted 30 field observations. The decisions and source evidence are in `data/catalogue-reviewed-destinations-october12.json`.

- Corrected 13 destinations, including links to documentation, creator articles, a game jam, an about page, and URLs with stray punctuation. Field Notes Crossword now points to the creator's GitHub Pages build; UNDER TRAINING points to its game build; Alien Marines points to its itch.io game page.
- Preserved the distinction between the original TinySkies game and a different creator's neural simulation of it.
- Recovered names and seven missing genres where the creator supplied evidence. Uncertain names and release states remain unasserted.
- Corrected creator-supplied URLs for Pilgrimage, Familiar Frenzy and Key Pong, while retaining their current HTTP 404 findings. A corrected source link is not necessarily a working build. Cached search content does not override the current HTTP result.
- Kept expired file-transfer builds flagged separately from abandonment. The fishing devlogs and possible Nightshoal history relationship still need manual consolidation; no project histories were merged in this batch.

Future source extraction now gives a creator's explicit play or latest-build link priority over other store-shaped URLs in the post. This prevents an itch.io asset pack from outranking the actual game. Existing link eligibility remains unchanged; focused checks cover Pomofox, SELK, Llama Legends and Just Dying.

## Reachability and retained evidence

Fixed the checker discarding successful HTTP responses when an HTML page exceeds its existing 1 MiB metadata limit. Oversized or interrupted bodies are discarded in full, while the received status and redirect destination remain recorded. Partial HTML never produces store metadata or playability claims. Previous successful store evidence keeps its original observation date.

All 13 reviewed Google Play destinations returned HTTP 200 but exceeded the metadata limit. Their link status is now reachable, with the extraction limitation recorded separately. The same handling applies to other large pages, including the UNDER TRAINING build. Tests cover declared and streamed oversized responses, interrupted bodies, binary downloads, missing pages, dated history and preservation of earlier store evidence.

The publication rehearsal contains 1,325 projects and 608 game destinations: 558 reachable, 21 reported missing, 26 inconclusive and three unchecked. Seven hundred seventeen projects have no game destination; those are not failed checks. The 21 missing destinations are dated HTTP observations, not proof that their games have been abandoned. There are 672 projects with a defined genre.

The database retains destination, final URL, status, HTTP result, reason, redirect count and check time. Public project details show recent checks and destination hosting; Insights aggregates that evidence. The 32 new dated observations bring retained history to 762 records. Existing observations remain intact. Six pending store jobs were completed using this review's results, leaving 141 pending at preparation time. Scheduled request limits are unchanged.

## Feedback publication

Eleven summaries add 30 Reddit citations revalidated against the current archive for author, text, date and project membership. Their reviewed wording and labels are in `data/feedback-reviewed-playability-october12.json`. The combined snapshot contains 51 published summaries, with 130 Reddit citations and one Playtrace citation.

The selection includes onboarding and registration friction, inventory discoverability, input and combat feedback, disruptive overlays, progression suggestions, visual first impressions and a reported phone startup problem. Explicit play accounts stay distinct from previews and attempts that could not start. Several comments from one person are identified as such; citation counts are not player counts. Proposed features and reported defects are not presented as implemented or independently reproduced.

This publication reuses existing Jev classifications as drafts and manually reviews the wording and labels. It makes no new model requests. Only the approved, source-linked findings enter public project notes and feedback-pattern metrics; private questionnaire responses are not published.

## Validation and publication

Guarded SQL was rebased on a fresh production export with no conflicting changes. The combined dry run preserves all project and source memberships, all 17 approved uploaded previews, admin overrides, visitor feedback, ratings, favorites, private responses and removal records. Fifteen protected tables were compared exactly.

265 Node tests, 11 schema checks and 74 checks in actual workerd passed. A complete static build from the live API contains all 1,325 projects, 506 indexable project pages, 18 directory pages and 528 sitemap URLs.

Seven browser scenarios passed both locally and against the live site: four corrected destinations and their dated link states, feedback-report pagination and filtering, and the published phone-startup summary in both themes. The public feedback form was enabled during WCAG 2 A/AA and 2.1 AA checks; layouts were checked from 320–1440px. All browser checks block visitor writes and opt out of analytics.

Published both guarded batches, deployed Worker version `40da6618-55f5-4f61-ae19-4ec8f2293443`, and invalidated public discovery caches. Read-only live verification confirmed all 30 accepted fields, all 11 new summaries and 30 citations, the 17 retained uploads, and the destination totals above at 22:34 UTC. Static publication continues through the repository's complete-snapshot Pages workflow.
