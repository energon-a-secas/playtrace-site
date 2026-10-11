# Reviewed catalogue snapshot

The current fallback snapshot contains **141 projects, 131 source authors, and 148 source posts**. It combines 51 projects from exact `Demo | Project | Workflow` sources with 90 individually reviewed older projects from 95 unlabeled sources. Those historical sources retain `flair:null` and an explicit review marker. The live catalogue is separate and continues importing eligible archive posts.

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

The input catalogue defaults to `data/catalog.json`; use `--catalog` to supply another manual snapshot. Existing games outside the manifest remain in the base. The output is validated with the same strict schema used by the Worker. The builder rejects missing or removed sources, wrong or absent flair, mixed authors, duplicate post selections, unsupported project links, changes to reserved project IDs, and merges without a shared canonical project URL. Repeating a build with the same inputs produces the same catalogue. Reapply reviewed quiz title/link corrections if an older manifest supplies obsolete metadata.

After reviewing the candidate, omit `--out` to replace the local snapshot atomically. This command does not import a production database or publish a site. Existing source membership cannot be silently discarded by a refresh.

The live collector is separate from this fallback snapshot and has no 90-project limit. Its operational configuration and coverage are described in the main README. To audit existing live records, use `scripts/review-source-flairs.mjs` as documented in `worker/README.md`; excluded records are hidden without deleting contributions.

## Historical review, October 11, 2026

`data/historical-review.json` records the 90 selections, their source IDs, editorial rationale and project-link checks. The reviewed builder rejects missing, removed, adult or explicitly excluded-flair sources and requires source-supported URLs. Unlabeled inclusion requires a per-selection reason; it never fabricates a Reddit flair. Five original links returned 404 and were omitted from project buttons while their historical source posts remain. The live import added 90 projects and 95 source posts. The same reviewed set is included in the fallback. Unclear candidates remain unpublished.
