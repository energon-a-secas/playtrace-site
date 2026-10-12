# Historical metadata and Steam demos — October 12, 2026

This continuation reviews earlier catalogue gaps and publishes another bounded selection of feedback. These are editorial quality batches, not representative samples of games or player sentiment.

## Earlier projects

Reviewed 31 projects first shared between September 2025 and July 2026, selected for explicit genre evidence and no existing manual detail overrides or accepted field facts. Rechecked all 36 source posts against the archive before accepting 55 field observations.

- Assigned 31 missing primary genres from the creators’ descriptions, including racing, horror, survival, rhythm and card games. Hybrid descriptions retain their original source text; one catalogue genre does not describe every mechanic.
- Recovered five names: Cosmic Egg, Pomofox: Shadow Break, Sounds Smashing!, Wyrmwood and ShuffleBall Arena.
- Corrected ten build-stage labels. Three entries previously marked playable describe a private or unfinished build: the Initial-D-inspired prototype, the real-world-quests action RPG, and the airplane-crash survival project.
- Recovered the HTTPS game links for Sounds Smashing! and ShuffleBall Arena, both returning HTTP 200. Creator-described playability remains separate from a page responding successfully.
- Kept missing names, public builds and the potential Wyrmwood history relationship flagged for review.

The accepted quotes and source URLs are in `data/catalogue-reviewed-history-october12.json`. Explicit admin details, guest contributions and all 17 approved uploaded previews were unchanged. The archive gained four additional projects during preparation; the publication snapshot contains 1,324 projects, with 665 classified genres. This is current metadata grouped by original source dates, not historical genre measurements.

## Steam demo detection

Steam gives demos separate app IDs and allows demos before full-game release; see the [Steamworks demo documentation](https://partner.steamgames.com/doc/store/application/demos). A main app’s `demos` list alone is not treated as proof of a playable build.

The refresh follows at most one listed demo per parent, verifies the child’s type, released state, free status and matching `fullgame.appid`, then retains separately dated evidence. Both records use the daily cache. Scheduled maintenance still makes at most six upstream requests in total, including related demo lookups. Missing, malformed, unrelated, future or stale demo evidence cannot produce a Play demo action. Failed child requests preserve the main listing, and full-game release dates and prices are never replaced with demo values.

A one-time backfill checked 42 catalogue entries linking to full-game Steam listings, using 56 new public requests and seven responses already collected during this investigation. It found 25 entries with a verified released demo, representing 24 distinct demo app IDs. These include Another One, Genius Simulator, Ultimate RPS Championship and Get Outta My Gut. Ten entries gain a playable label, subject to existing editorial overrides.

Cards, project pages, popup details and home highlights point to the verified demo when the full game is not released. The full-game link stays available in project details. Released full games retain their main action and offer the demo as a secondary link. Insights shows related-demo coverage and counts demo release dates separately, deduplicating apps also listed in their own showcase.

Directly opening project notes now refreshes Steam details even when the service-status request has not completed. Permanent project pages also use the report palette for shared feedback controls, fixing light-mode text contrast.

## Feedback publication

Thirteen additional summaries cite 36 comments checked against their current archived author, body, date and project membership. The decisions are in `data/feedback-reviewed-history-october12.json`. There are 40 published summaries, with 100 Reddit citations and one public Playtrace citation.

The selection includes an opening softlock reproduction lead, inverted flight controls, trailer/gameplay consistency and camera feedback. Misty and the Last Breeze’s camera criticism is reviewed as mixed feedback rather than the draft’s praise classification. Multiple messages by one person are identified where relevant; citation counts are not player counts. Only an explicit account of playing receives the played label. An inability to start a game does not establish gameplay experience or current link failure.

## Publication and validation

Prepared guarded SQL on a private snapshot, then rebased against a fresh export. A concurrent Get Outta My Gut store observation and its completed queue job were retained. Protected tables, approved previews, source membership and the complete catalogue were checked in a combined dry run. The remaining store queue is 153 entries; the usual bounded maintenance continues.

261 Node checks, 11 schema checks and 70 checks in actual workerd passed. Six browser scenarios cover demo actions, a stale popup receiving fresh store data, light/dark accessibility, 320–1440px layouts, all feedback-report pages, the corrected mixed classification and an older recovered project. Browser fixtures write no visitor data to production. Read-only API checks confirmed the four example demos, all 40 published summaries and the corrected camera-feedback labels. Worker version: `1bfad91a-03b6-4c47-8618-e345f63a3650`.

Live browser verification also exposed a light-mode contrast issue on the enabled feedback submit button that the fixture's disabled state had masked. Permanent project pages now share the collection's button and focus styles. Both themes pass WCAG 2 A/AA and 2.1 AA checks with the form enabled and the submit button hovered, plus keyboard-focus inspection and 320–1440px layout checks. These read-only checks block visitor writes and opt out of analytics.
