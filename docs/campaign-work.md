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
- [ ] Restore the live API after the D1 daily allowance resets or the owner approves a paid plan.

Questionnaires will live at `research.html` with an embed mode. This keeps them independently reusable without adding another hosting dependency. URL checks distinguish unavailable, blocked and reachable; a working HTTP page alone does not establish a playable game. Store artwork is source-linked, not silently uploaded as creator-authorized artwork.

Implementation checks: 154 Node tests, 11 schema checks, 37 workerd runtime checks, and 24 browser/accessibility checks using disposable storage. Eleven read-only browser checks and a cross-origin embed check passed against the live site before the quota interruption. Five additional browser checks cover the outage fallback, including search, project history, the featured game and mobile layout. No synthetic contributions were written to production.

## Production batch, October 11

- Consolidated 13 earlier repost entries; their shared URLs retain redirects.
- 990 source reference links across 682 projects. The live database has 1,296 published projects; the dated public fallback contains the 1,294 available when it was exported.
- Completed 242 Steam/itch store jobs and 525 URL checks: 459 reachable, 15 broken, 13 blocked, and 38 unverified. Blocked/unverified destinations were not removed.
- Collected 71,614 available archived comments from August 11 through October 11 at 15:18 UTC. The queued campaign reviewed 637 projects and classified 3,090 eligible comments within the documented sampling bounds.
- 244 cited drafts await admin review; 157 projects require manual interpretation and 236 had no eligible comments. All 1,404 queued jobs are ready. No review was automatically published.

The campaign reached Cloudflare D1's free daily row-read allowance. Stored data and the completed queue remain intact; live API calls are unavailable until the allowance resets at 00:00 UTC (21:00 Santiago) or billing is changed by the owner. No paid plan was enabled. Anonymous catalogue pages now use a 60-second cache with an indexed revision check; successful editorial changes invalidate it. The site can display the dated public export during an interruption, with an explicit saved-collection notice and a 24-hour age limit.
