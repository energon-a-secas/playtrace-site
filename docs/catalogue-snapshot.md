# Reviewed catalogue snapshot

The October 10, 2026 snapshot contains **90 distinct projects, 90 makers, and 96 source posts**. Of these projects, 65 have a creator-described playable build or release. Availability and development stages are based on the linked posts, not independent playtesting.

The original 17-project snapshot was a small editorial selection from a single 100-post archive page. It was not a frontend result limit. This expansion adds 73 projects after reviewing a larger archive window.

## Sources and selection

- Community: [r/aigamedev](https://www.reddit.com/r/aigamedev/).
- Retrieval: [Arctic Shift posts API](https://arctic-shift.photon-reddit.com/api/posts/search), five descending pages of up to 100 posts, overlapping at each timestamp boundary.
- Retrieved October 10, 2026 at 22:01:31 UTC: 496 distinct posts dated October 8, 14:48:32 UTC through October 10, 22:00:18 UTC.
- This is a selected snapshot, not a complete census of the community. Tutorials, tool promotions, questions, removed posts, and unclear project showcases were excluded from the expansion.
- Every addition retains its original author, post ID, canonical Reddit link, and source timestamp. Titles and descriptions are editorial summaries. Unknown platforms and unavailable game links are left empty.
- Images come from the selected posts' previews or galleries and remain hosted at their original sources. Three projects have no image preview; their original post remains available.
- The original 17 project records, including their IDs and source histories, remain unchanged.

Four added projects have two source posts each: Stompworks, Zoo Pet, Snowbody’s Safe, and NIGHT SHIFT. Each pair shares both an author and a canonical project URL. Repeated posts do not increase the project count. An author match alone is insufficient to join projects.

## Rebuilding the expansion

`data/snapshot-review.json` records the 73 selections, their editorial metadata, the retrieval window, and the original IDs to preserve. Keep the downloaded archive responses outside the public repository. Combine their `data` arrays into a JSON array, deduplicated by post ID, then run from the project root:

```bash
node scripts/build-snapshot.mjs --archive /path/to/posts.json --out /tmp/catalog-candidate.json
```

The input catalogue defaults to `data/catalog.json`; use `--catalog` to supply another manual snapshot. The output is validated with the same strict schema used by the Worker. The builder rejects missing or removed sources, mixed authors, duplicate post selections, unsupported project links, changes to reserved project IDs, and merges without a shared canonical project URL. Repeating a build with the same inputs produces the same catalogue.

After reviewing the candidate, omit `--out` to replace the local snapshot atomically. This command does not import a production database or publish a site. Existing source membership cannot be silently discarded by a refresh.

The live collector is separate from this snapshot and can grow the catalogue beyond 90 projects. Its operational configuration and coverage are described in the main README.
