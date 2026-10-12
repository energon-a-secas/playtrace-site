# Discovery and editorial campaign

Requested October 11, 2026. Preserve source attribution, manual overrides, public guest contributions, exclusions and existing shared project URLs.

- [x] Focused Home, dedicated Browse and Favorites pages; consistent navigation.
- [x] Searchable Maker dropdown; remove refresh and global share actions.
- [x] Branded project actions and platform icons, top favorite star, guest ratings.
- [x] Direct thumbnail editing for verified admins.
- [x] Project history references and links from source text.
- [x] Conservative same-author, same-window repost consolidation with latest entry retained.
- [x] Standalone embeddable five-step questionnaires, categories, custom admin forms and private aggregate results.
- [x] Persistent admin queue for URL health, store enrichment and cited feedback reviews.
- [x] Steam/itch artwork and availability enrichment; preserve admin choices.
- [x] Jev classification of evidence, with inspectable citations and drafts requiring admin publication.
- [x] Finish the latest-two-month review batch and verify the deployed interface.
- [x] Restore the live API after the D1 daily allowance reset; verified operational on October 12.

Questionnaires will live at `research.html` with an embed mode. This keeps them independently reusable without adding another hosting dependency. URL checks distinguish unavailable, blocked and reachable; a working HTTP page alone does not establish a playable game. Store artwork is source-linked, not silently uploaded as creator-authorized artwork.

Implementation checks: 154 Node tests, 11 schema checks, 37 workerd runtime checks, and 24 browser/accessibility checks using disposable storage. Eleven read-only browser checks and a cross-origin embed check passed against the live site before the quota interruption. Five additional browser checks cover the outage fallback, including search, project history, the featured game and mobile layout. No synthetic contributions were written to production.

## Production batch, October 11

- Consolidated 13 earlier repost entries; their shared URLs retain redirects.
- 990 source reference links across 682 projects. The live database has 1,296 published projects; the dated public fallback contains the 1,294 available when it was exported.
- Completed 242 Steam/itch store jobs and 525 URL checks: 459 reachable, 15 broken, 13 blocked, and 38 unverified. Blocked/unverified destinations were not removed.
- Collected 71,614 available archived comments from August 11 through October 11 at 15:18 UTC. The queued campaign reviewed 637 projects and classified 3,090 eligible comments within the documented sampling bounds.
- 244 cited drafts await admin review; 157 projects require manual interpretation and 236 had no eligible comments. All 1,404 queued jobs are ready. No review was automatically published.

The campaign reached Cloudflare D1's free daily row-read allowance. Stored data and the completed queue remain intact; live API calls are unavailable until the allowance resets at 00:00 UTC (21:00 Santiago) or billing is changed by the owner. No paid plan was enabled. Anonymous catalogue pages now use a 60-second cache with an indexed revision check; successful editorial changes invalidate it. The site can display the dated public export during an interruption, with an explicit saved-collection notice and a 24-hour age limit.

## UI and weekly highlights follow-up, October 11

- Replaced the single focus feature with five dated weekly highlights. Admins can reorder, replace, pin and exclude picks. Saturday rotation uses Santiago calendar dates and handles both UTC offsets.
- Added admin-only Edit controls on cards and project dialogs. The inline editor supports details, reusable categories and revision conflicts; image upload remains next to it.
- Renamed Playtest to Quick reviews and made game selection the first step. Added disabled loading controls, clear purpose, retries and an explicit service-unavailable state.
- Consolidated Browse/Favorites footer content, removed repeated play links, constrained long card headlines, aligned card actions and polished narrow layouts and controls using the Impeccable product register.
- Fixed approved uploads disappearing during D1 outages by authorizing image delivery through R2 publication/withdrawal records. Reconciled all seven existing uploads and verified HTTP 200 for each, including The Manor. Original assets and consent records are preserved.
- Refreshed the dated public snapshot: 1,296 games, 1,384 source posts and seven effective uploaded previews.

Validation at that point: 161 Node checks, 40 workerd checks, admin and guest browser checks, desktop/mobile layouts from 320–1440px, light/dark accessibility and outage behavior. Fixtures use disposable storage; no synthetic visitor contributions were written to production. The quota interruption described above was resolved after the allowance reset.

## Catalogue and ranking follow-up, October 12

The [full catalogue refresh](catalogue-refresh-october12.md) covers 1,403 source posts, 51 additional accepted field observations, one corrected mixed-project history and seven recovered game destinations. Six editorial feedback summaries are published with 25 checked citations. Browse gains a muted Reddit score and sort; weekly community ranking uses a minimum rating count and a neutral prior, with admin controls and a separate editor pick. Source gaps and unresolved review flags remain visible. Google Search Console verification/submission is the remaining owner-account step.
