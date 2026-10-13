# Creator replies and development histories — October 13, 2026

This follow-up checks eight projects with unresolved names or destinations in the published-feedback sample. It uses 58 current creator replies, the eight original posts, four earlier/later history posts, and three additional NOVA Defender replies. Author identity, parent post, inclusion flair and source availability are checked before accepting evidence. The public decisions and excerpts are in [catalogue-reviewed-creators-october13.json](../data/catalogue-reviewed-creators-october13.json).

## Accepted corrections

19 field observations improve seven canonical projects:

- Recover creator-supplied play links for **NOVA DEFENDER — Last Signal, Snake Orbit 3D, Shut-Eye Summit and Ictus**. Their linked pages supply the names; the original Reddit headlines remain in project history.
- Replace **Pilgrimage**'s broken Vercel destination with its current creator-linked domain. The original post and creator replies link its assets section; the site's root names the same game, offers Play, and links back to the exact repository supplied by the creator. The repository's stale homepage field is not used as evidence. Add that repository separately as source code, without claiming its non-commercial license is open source.
- Read **Relax Bicycle Ride** from its existing game's page title, omitting the Three.js suffix. Confirm **AI Ascendancy** directly from the newer creator post.
- Add the explicit arcade category for NOVA Defender, three creator/store-supported playable states, and browser evidence for Snake Orbit 3D and Ictus. AI Ascendancy retains the older post's strategy description, playable state and supported devices.

Ictus retains the creator's `/fourway` URL with a dated redirect observation to `/ictus`. Its listing says **In development** and offers an embedded browser build. Rhythm and Racing remain separate store labels rather than an invented single primary genre. Bicycle progression and story mode likewise do not prove competitive racing.

Seven destination checks return HTTP 200. These verify page availability, not gameplay. AI Ascendancy exceeds the bounded HTML reader: its successful response is retained with `metadataStatus: too-large`, while the accepted title comes from its creator's post. The old Pilgrimage failure and all other historical link observations remain stored.

## Consolidated histories

| Current project | Sources retained | Former project IDs |
| --- | ---: | --- |
| NOVA DEFENDER — Last Signal | 3 | `g_1wszjg7`, `g_1wr30mq` |
| Relax Bicycle Ride | 2 | `g_1vf84kn` |
| AI Ascendancy | 2 | `g_1wmzmez` |

The latest source anchors each project. These reviewed identity decisions do not broaden automatic same-author matching. Former URLs and local favorites resolve through aliases; source dates, references and past link observations remain available. Two new projects arrived through normal ingestion during preparation. At publication, four duplicate listings disappear, taking the catalogue from **1,326 to 1,322 projects**, with **all 1,426 source posts retained**.

AI Ascendancy's older entry has a published Reddit feedback summary. The operator planner now permits an explicitly named review to move to an empty destination only when all citations belong to the verified combined history. Its payload, citations, publication date and publisher remain byte-for-byte unchanged. A competing review, new visitor contribution, changed source or intervening edit aborts the transaction. Site contributions and uploaded artwork still require their own conflict review; they are not silently transferred.

Source refresh also withdraws accepted facts derived from creator comments when their parent post is removed. It matches the exact canonical comment-path prefix, preserving unrelated store evidence and admin edits. Individual comment removals are not polled continuously.

## Effect on the feedback sample

| Coverage among the same 51 reviewed projects | Before | After |
| --- | ---: | ---: |
| Assigned primary genre | 40 / 51 | 41 / 51 |
| Known build state | 44 / 51 | 47 / 51 |
| Listed project destination | 34 / 51 | 38 / 51 |

This improves filter coverage and project identity, not the amount or representativeness of feedback. No new visitor responses, stronger sentiment claims or model-related causal conclusions are created. Quank's tentative name and planned GitHub release remain unconfirmed.

15 existing editorial review records are reconciled: resolved flags close, while mixed genres and Quank's missing build remain visible. Previous flags are retained in each review's audit history. AI Ascendancy's former-entry jobs are retained as dismissed history records.

## Verification

The private preparation rehearses the full guarded transaction against a fresh production export. It verifies both catalogue schemas, all 17 uploaded previews, all 51 published reviews, 19 unrelated tables and every previous link observation. Retried preparations reuse successful checks with their original observation times. Scheduled score, archive, store and Jev budgets are unchanged.

285 Node tests, 11 schema checks and 82 checks in actual workerd pass. The runtime checks exercise review relocation, source withdrawal and the canonical path in disposable D1/R2. No production visitor data is generated.

Worker release `83f3df30-7691-45ea-82e3-47e6738f9b32` and the 331-statement guarded database transaction are deployed. A new production export matches the rehearsed project, source, fact, override, upload, review and alias records, and retains all 791 prior link observations, including Pilgrimage's failed URL. Public API checks confirm all 19 accepted fields, four alias resolutions, all 17 unchanged uploads, 51 unchanged published summaries and matching Insights classifications.

A complete build from the live API contains 1,322 projects, 510 indexable project pages, 18 directory pages and 532 sitemap URLs. The Pages release uses this same complete-snapshot build; former project IDs redirect to the canonical page and stay out of the sitemap.

## Follow-up navigation fix

After the catalogue release, the browser review found that shared Quick Reviews links still returned 404 for a former project ID. The public questionnaire read now resolves that alias before checking the form's project restriction. Its response names the current project, so the page updates its URL and subsequent answer requests use that canonical ID. Private response reads, saves and deletes retain their explicit project scope; discovery never silently reassigns answers. Closed forms, unrelated project restrictions and withdrawals remain enforced.

This follow-up is deployed in Worker release `8a3d4167-6856-4d4c-825d-fa074eb42ede`. Thirteen live browser checks pass: six corrected project pages, the AI Ascendancy redirect/review/favorite at 320–1440px, favorite-only Browse, the arcade feedback filter, and all four old Quick Reviews links including embedded mode. The live sitemap serves XML with 532 URLs, excluding the superseded IDs. Automated browser sessions opt out of metrics, block writes and submit no answers, ratings or comments.
