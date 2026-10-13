# Metadata behind published feedback — October 13, 2026

This batch reviews the 34 projects with published feedback that still had an unspecified genre or build state, or a headline longer than 60 characters, and no admin detail override. It is a deliberate quality review of the existing feedback sample, not a representative sample of community games.

The accepted decisions are in [catalogue-reviewed-feedback-projects-october13.json](../data/catalogue-reviewed-feedback-projects-october13.json). Each field retains its public source, exact supporting excerpt and review time. Primary categories inferred from the described gameplay are identified as editorial judgments in the review flags. Unknown names and availability remain unknown when the source is insufficient.

## Changes

49 accepted field observations improve 28 projects. Including the resulting source/store projection changes, this corrects nine displayed titles, 16 primary categories, 19 build states, five destinations, two platform lists and one description.

- Recover the explicit names **Mechrachnophobia, Tiny Tactics, Ninefir: The Black Book, Yolk Sumo, WINDWARD, Powerstate and RaidMade**. The linked 90to90 page also corroborates its displayed name through `og:site_name` and navigation.
- Correct **Antkeeper** from the Wikipedia inspiration link to the creator's game. Its HTTPS path without a trailing slash redirects to HTTP; the slash variant serves Antkeeper directly over HTTPS. Recover the offered links for **WINDWARD, 90to90 and 1-Bit Terror**. All four corrected destinations return successful responses; that is a page check, not a gameplay test.
- Separate an **unnamed 3D swordfighting/parkour prototype** from the same creator's earlier **BoneHeads** game. The original headline and source video replace the unrelated store name, description, Windows claim and artwork. Its source history and published feedback remain attached. Link extraction now excludes a first-game promotion when the creator explicitly identifies the showcase as a later game; ordinary first-game showcases and explicit current-build links remain eligible.
- Mark **Grimoire of Hecate** as having a playable demo, rather than treating the demo launch as a full-game release. The coming-soon full game and independently verified Steam demo keep their separate dates and identities.
- Add source-supported card game, sports, racing, party game, platformer, horror and other primary categories. Clear Wrongosaurus's inherited Action label: the source's “repeated action” describes a digging task, not a genre.
- Retain **Pilgrimage** as a creator-offered browser build with a separately dated broken-link finding. A GitHub repository, an unfinished video or a tentative name does not become a verified public release.

## Effect on feedback comparisons

Across the same 51 projects with published reviews:

| Coverage | Before | After |
| --- | ---: | ---: |
| Assigned primary genre | 28 / 51 | 40 / 51 |
| Known build state | 27 / 51 | 44 / 51 |

These changes improve Browse and feedback-report filters without generating more comments, changing their interpretation or manufacturing stronger trends. They describe improved metadata coverage, not growth in the community or proof that a model release caused a genre shift. Build state records what the creator offers or demonstrates; dated URL health remains a separate observation.

## Preservation and verification

The preparation refreshes 34 source posts in one archive batch and checks four corrected destinations. Fresh store metadata is reused; no Steam, itch API or Jev classification batch is run. Sunday score refresh and all scheduled request limits remain unchanged.

The complete transaction is rebased on a fresh private production export. Full-row guards reject intervening changes; no project group conflicted. Rehearsal checks preserve 22 unrelated tables exactly, including all 17 approved uploads, 51 published feedback reviews, admin edits, visitor contributions, scores and previous link observations. Four dated link observations and 34 admin review records are added. Unresolved name, genre and destination questions stay in the admin queue.

279 Node tests, 11 schema checks and 77 checks in actual workerd pass. The rehearsed catalogue contains 1,324 projects and 1,424 source posts and validates against both public and import schemas. Its static build has 508 indexable project pages, 18 directory pages and 530 sitemap URLs.

Worker release `c588537a-b20a-4004-9971-79d9ec325751` and the guarded database corrections are deployed. A complete build from the live API matches those counts. Public API checks confirm all 49 accepted facts, matching Insights classifications, the four reachable destinations, removal of the unrelated Steam metadata, all 17 unchanged uploaded previews and all 51 unchanged published reviews.

## Remaining review work

The [creator-reply follow-up](creator-replies-october13.md) resolves the space game, flying Snake, eyes-closed platformer, synchronized driving demo and bike-game names, repairs Pilgrimage's destination, and consolidates three reviewed development histories. Quank's tentative name and public build remain unconfirmed; mixed or unclear primary genres remain open.
