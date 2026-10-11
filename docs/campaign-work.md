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
- [ ] Finish the latest-two-month review batch and verify the live deployment.

Questionnaires will live at `research.html` with an embed mode. This keeps them independently reusable without adding another hosting dependency. URL checks distinguish unavailable, blocked and reachable; a working HTTP page alone does not establish a playable game. Store artwork is source-linked, not silently uploaded as creator-authorized artwork.

Implementation checks: 148 Node tests, 11 schema checks, 37 workerd runtime checks, and 24 browser/accessibility checks using disposable storage. Eleven additional read-only browser checks passed against the live site. The live batch preserves real contributions and publishes no automated review drafts.
