# Reviewed catalogue snapshot

The current fallback snapshot contains **144 projects, 133 source authors, and 151 source posts**. It combines 51 original projects, 90 individually reviewed older projects from 95 unlabeled sources, and three subsequently reviewed showcases. The unlabeled historical sources retain `flair:null` and an explicit review marker. The live catalogue is separate and continues importing eligible archive posts.

The original 17-project snapshot was a small editorial selection from one 100-post archive page, not a frontend result limit. An initial expansion reached 90 projects, before the user narrowed the scope to the project flair. That review retained 41 snapshot projects; ten additional eligible projects complete the 20-game screenshot quiz pool. Availability and development stages follow the linked sources, not independent playtesting.

## Sources and selection

- Community: [r/aigamedev](https://www.reddit.com/r/aigamedev/).
- Retrieval: [Arctic Shift posts API](https://arctic-shift.photon-reddit.com/api/posts/search), five descending pages of up to 100 posts, overlapping at each timestamp boundary.
- Retrieved October 10, 2026 at 22:01:31 UTC: 496 distinct posts dated October 8, 14:48:32 UTC through October 10, 22:00:18 UTC.
- This is a selected snapshot, not a complete census of the community. The original expansion was subsequently filtered using fresh source-flair evidence in `data/source-flair-review.json`. News, discussions, help, resources, research, commercial promotions and media are excluded; unclassified posts need individual review before inclusion.
- Every addition retains its original author, post ID, canonical Reddit link, and source timestamp. Titles and descriptions are editorial summaries. Unknown platforms and unavailable game links are left empty.
- Images come from the selected posts' previews or galleries and remain hosted at their original sources. Projects without an image retain their original-post link.
- Retained projects preserve their IDs and eligible source histories. The 20 quiz titles and playable destinations were checked separately against their project pages; see `data/quiz-review.json`. Quiz screenshots are original gameplay assets, not generated previews.

Repeated posts do not increase the project count when both the author and canonical project URL establish the same project. An author match alone is insufficient to join projects.

## Rebuilding the expansion

`data/snapshot-review.json` now retains the 31 eligible expansion selections and ten original IDs to preserve. It records editorial metadata and the original retrieval window. Keep downloaded archive responses outside the public repository. Combine their `data` arrays into a JSON array, deduplicated by post ID, then run from the project root:

```bash
node scripts/build-snapshot.mjs --archive /path/to/posts.json --out /tmp/catalog-candidate.json
```

The input catalogue defaults to `data/catalog.json`; use `--catalog` to supply another manual snapshot. Existing games outside the manifest remain in the base. The output is validated with the same strict schema used by the Worker. The builder rejects missing or removed sources, excluded flairs, unlabeled sources without individual review, mixed authors, duplicate post selections, unsupported project links, changes to reserved project IDs, and merges without a shared canonical project URL. Repeating a build with the same inputs produces the same catalogue. Reapply reviewed quiz title/link corrections if an older manifest supplies obsolete metadata.

After reviewing the candidate, omit `--out` to replace the local snapshot atomically. This command does not import a production database or publish a site. Existing source membership cannot be silently discarded by a refresh.

The live collector is separate from this fallback snapshot and has no 90-project limit. Its operational configuration and coverage are described in the main README. To audit existing live records, use `scripts/review-source-flairs.mjs` as documented in `worker/README.md`; excluded records are hidden without deleting contributions.

## Historical review, October 11, 2026

`data/historical-review.json` records the 90 selections, their source IDs, editorial rationale and project-link checks. The reviewed builder rejects missing, removed, adult or explicitly excluded-flair sources and requires source-supported URLs. Unlabeled inclusion requires a per-selection reason; it never fabricates a Reddit flair. Five original links returned 404 and were omitted from project buttons while their historical source posts remain. The live import added 90 projects and 95 source posts. The same reviewed set is included in the fallback. Unclear candidates remain unpublished.

## Current source corrections, October 11, 2026

`data/current-showcase-review.json` adds The Manor, Cemetery Designer and Reef Shark and Shore. The Manor's archived record still showed a removal marker and Questions & Help flair, while the current canonical Reddit page was public and displayed Demo | Project | Workflow. Its `currentSourceChecks` entry records the observed state, original archived state, source identity, verification time and rationale. The builder applies only these explicitly reviewed corrections and leaves the downloaded archive unchanged. Deleted text, adult content and unreviewed removal flags remain ineligible.

Rebuild these selections with `node scripts/build-snapshot.mjs --archive /path/to/posts.json --review data/current-showcase-review.json`. When auditing their source flairs, pass `--current-review data/current-showcase-review.json` to `scripts/review-source-flairs.mjs` so stale archived metadata does not silently reverse the current-source review. If the archived state changes again, recheck the current post before updating this evidence.

The production import also records the evidence in `app_meta.current_source_review` and marks the verified source media as checked, so scheduled hydration does not immediately replace its reviewed assets with stale archive metadata.

## Completed archive scan

The October 11, 2026 verification counted **1,306 live projects, 1,381 source posts and 1,014 authors**, across seven catalogue pages. Historical collection completed from the community's creation on December 11, 2022 through October 10, 2026 at 23:13 UTC. The independent recent pass completed through October 11 at 12:55 UTC. The earliest published, individually reviewed source is April 3, 2023. Completion describes the available archive scan; excluded flairs and ambiguous candidates are not automatically published. Both coverage checkpoints, source eligibility, reviewed selections, removed-entry exclusions and the featured DROPZONE record passed the final read-only check.

## Catalogue names and links

The October 11 naming review examined all 1,306 published projects against 1,381 original source posts. `data/game-name-review.json` records 349 supported title corrections, 20 Clicker classifications, 35 separate code-repository links, and 17 project-link corrections. It leaves 811 unresolved source headlines unchanged; existing reviewed names and manual overrides remain authoritative. Only two fallback records required changes. The full live catalogue and the smaller offline fallback remain separate.

Run a future dry review with a raw source export and a source-game export (not an enriched public catalogue):

```sh
node scripts/review-game-names.mjs --games /tmp/games.json --raw /tmp/posts.json --metadata /tmp/name-metadata.json --out /tmp/name-review --fetch yes
```

Inspect the `.json` evidence and `.sql` field updates before applying. Reuse the metadata file to avoid refetching successful pages. Game names can come from Steam app IDs (including demos), itch.io metadata/slugs, explicit source names, or corroborated project paths/domains. The pass never changes source post titles, dates or authors. Playable `github.io` addresses take precedence over accompanying `github.com` repositories, which remain available as source-code links.
