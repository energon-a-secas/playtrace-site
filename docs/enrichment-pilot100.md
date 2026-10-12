# 100-project evidence pilot

The pilot improves what a visitor can learn and try, and tests whether catalogue trends have enough evidence to be useful. It covers 100 existing projects and 116 source posts across 2023–2026, balanced across first-shared year and destination. Four regression examples are retained: The Manor, Underbloom, Wayward Crown Demo and Physical Digivice Game. Selection is deterministic, not random or representative; do not extrapolate its percentages to all games or developers.

## Applied results — October 12, 2026

The dated, machine-readable counts are in [`data/enrichment-pilot100.json`](../data/enrichment-pilot100.json).

| Measure within the 100-project pilot | Before | After |
| --- | ---: | ---: |
| Retained nonempty source bodies | 5 / 116 | 97 / 116 |
| Projects with a classified primary genre | 58 / 100 | 78 / 100 |
| Projects with recognized model/tool mentions | 17 / 100 | 38 / 100 |
| Projects with recognized art-style mentions | 5 / 100 | 8 / 100 |

The same revised mention matcher is used on both sides, so the difference measures recovered evidence, not a real change in game creation. Nineteen available source posts have no text body; they are not archive failures. There are 10 improved names, 41 descriptions, 20 genre classifications, nine platform lists and two corrected destinations. One unsupported playable label returns to unknown for review. The operator checked 79 distinct destinations, including the corrected BattleBorg link and the discarded roadmap example link. Two pages return 404/410; inaccessible checks remain unverified, not dead. Approved images and existing manual fields are unchanged.

Twenty-nine accepted field observations across 22 projects retain a source URL and a short quote. Six shared categories are registered: Board game, Educational, Sports, Horror, Rhythm and Racing. These are reviewed mappings to a primary catalogue genre, not provider taxonomies copied without interpretation. Administrators can change them through the existing editor.

The review was performed by Codex against source and store evidence, not by two independent human reviewers. All 100 entries retain review records in the admin queue. Sixty-two still have a missing field or a flag, including mixed-project history, tool/workflow scope, possible duplicates and destination uncertainty. Flags do not delete or merge anything. In particular, the Chapel Knights history contains a STARBATTLE post referring to the former as a different game; this remains an identity review task. Broad public charts describe archived projects, not independently verified game releases.

Production verification confirmed 1,310 projects, 1,399 source posts, 172 retained nonempty source bodies, all 29 accepted observations and 100 ready review records. All 15 uploaded previews match their pre-pilot values. Public evidence is available without login; private admin insights, visitor totals and the correction inbox continue to require authorization.

## What this supports

Follow-up: the [October 12 full-catalogue campaign](catalogue-refresh-october12.md) resolved the Chapel Knights/STARBATTLE identity issue, recovered additional creator-linked destinations and expanded source recovery beyond this pilot. The original pilot counts above remain the dated record of that first pass.

The strongest immediate improvement is discovery: visitors get useful descriptions, real game names, device labels and more meaningful genre filters. Full-text recovery substantially increases model mentions, but explicit art-style coverage remains sparse. Public model-announcement comparisons therefore show source coverage, unknowns and window sizes, and never claim that a model caused a creative trend.

Release dates have their own timeline. Only a distinct Steam app with released status and a valid past day enters it. Demo and Early Access builds are separate from full games. A store date can precede the AI work discussed in a later Reddit post. Itch listing status alone supplies no exact release date. First shared always means the earliest retained source post, never an inferred launch.

## Repeatable operator workflow

1. Export a fresh production D1 backup to a private directory, with mode `0600`. Apply migration `0012_reviewed_project_facts.sql` before publishing this Worker version.
2. Run `node scripts/enrichment-pilot.mjs --backup /private/backup.sql --output /private/pilot --plan-only` to inspect the deterministic selection.
3. Run the same command without `--plan-only`. The runner reads public archive/store endpoints with bounded requests, safe redirect/DNS checks, retry limits and local checkpoints. No paid classification or private itch account data is needed. Inspect `report.json`, `apply.sql` and the source evidence. The script never applies production SQL.
4. Accepted field decisions live in `data/pilot-reviewed-facts.json`. Every quote must be found in the matching source or retrieved store evidence before preparation succeeds. Existing accepted facts are preserved. `project_overrides`, approved media and all contribution tables are checked for changes.
5. Rebase on a fresh backup before applying, using `--selection /private/pilot/plan.json` to retain the reviewed 100 projects. Public response checkpoints expire after 24 hours. Equality guards reject concurrent row changes. Apply the reviewed SQL transaction with the existing D1 operator workflow; never remove guards to force a stale preparation through. The file contains public evidence and guarded changes, never credentials or contribution values.
6. Invalidate discovery caches, deploy the Worker, and publish the Pages artifact. Compare the production catalogue, accepted facts, queue count and approved previews with the reviewed preparation. Do not place a private backup, raw archive response or queue export in `_site/`.

The existing hourly source refresh checks at most ten due posts; store maintenance queues bounded Steam/itch updates and honors provider cooldowns. This continues evidence recovery beyond the pilot without making every page visit perform enrichment. The public dashboard rebuilds hourly. Search Console verification and submission remain a separate property-owner task.

## Source contracts

- [Arctic Shift ID lookup](https://github.com/ArthurHeitmann/arctic_shift/blob/master/api/README.md): archived observations can lag Reddit and missing results are not deletion proof.
- [itch.io server-side API](https://itch.io/docs/api/serverside): the account token is not an API for arbitrary creators' private statistics. Community enrichment uses public listing metadata.
- [Steam release process](https://partner.steamgames.com/doc/store/releasing): store availability, demos and release state are separate evidence from community sharing. The existing public app-details adapter is best effort and preserves source labels.
