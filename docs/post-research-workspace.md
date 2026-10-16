# Post research workspace

The Admin **Post research** tab turns the local Jev study into a source-linked review queue. The public site receives none of its records. This workflow is separate from private player questionnaires and published comment summaries.

## Review flow

1. Run `scripts/analyze-posts.mjs` against a private D1 export, following `docs/post-research.md`.
2. Preview the import: `node scripts/import-post-research.mjs --input /private/study/classifications.json`.
3. Import with `--apply --credentials /private/operator-secrets.json`. Each request carries at most 20 typed records, with no source prose or credentials in logs. Imports make no Jev or Reddit requests.
4. In Admin → Post research, open a draft's source excerpt and original post. Inspect all six labels. Unknown is a valid answer. Edit or remove the proposed follow-up questions.
5. Approve the reviewed labels and questions, or dismiss the draft. Approval saves a private decision. It does not publish, message a creator or change a catalogue field. Use **Edit listing** for an independently supported correction.

The importer checks the exact model-input fingerprint against current stored source text, binds each draft to the source content hash and project membership, and rejects removed or unavailable evidence. Reimporting unchanged evidence preserves reviews. Revisions prevent concurrent overwrite. Changed sources leave the accepted report until reclassified and reviewed; withdrawn sources delete their research records.

The dashboard defaults to source-reviewed labels. A separate selector exposes the unreviewed model sample. Every answer, including unknown, remains in the denominator. It displays source inspection by an assistant separately from signed-in Admin inspection; neither is an independent model accuracy evaluation. The initial 120-post study is week-balanced and is not a population prevalence estimate. Success, causation, personal attitudes and best posting times are not inferred from these labels.

## Engagement observations

Migration 0019 retains up to 52 dated observations per source post, with provider, net score and comment count when supplied. Existing scores seed one archive observation at their original observation date. Missing dates and comment counts are never fabricated. Repeated or older archive snapshots do not count as new observations. Removing a scored source removes its observations.

Sunday maintenance keeps the last-35-day window and the eight-HTTP-request ceiling. The default provider remains Arctic Shift. Approved Reddit access can be enabled using encrypted `REDDIT_CLIENT_ID` and `REDDIT_CLIENT_SECRET`, a descriptive `REDDIT_USER_AGENT`, and `REDDIT_API_APPROVED=true`. OAuth token acquisition consumes one of the eight requests; up to seven remaining batches read 100 public posts each. HTTP errors and throttling stop the run, with no anonymous fallback or automatic retry. Missing or mismatched posts do not overwrite existing observations.

As checked on 2026-10-16, no Reddit credentials were configured locally or on the production Worker. Current score/comment collection therefore remains unavailable. The adapter is covered by fixed API fixtures, not a live authenticated integration test. Reddit's [Data API Wiki](https://support.reddithelp.com/hc/en-us/articles/16160319875092-Reddit-Data-API-Wiki) explains registration, OAuth and the access request. Endpoint fields come from [Reddit's API documentation](https://www.reddit.com/dev/api/#GET_api_info); app-only authentication follows [the OAuth documentation](https://github.com/reddit-archive/reddit/wiki/OAuth2#application-only-oauth).

The dashboard counts projects with observations at 7–14 days old to expose the coverage gap. This is not a sufficiency threshold or an engagement ranking. Future comparisons still need time-matched cohorts, maker/project dependence, content and calendar controls, and a later validation cohort. Retention and data-use requirements must be checked against the actual API approval before enabling the provider.

## Hosting charts

The public Where games live section has desktop and mobile destination pies. Windows, macOS, Linux, PC and Desktop labels establish the desktop cohort; Android, iOS and Mobile establish the mobile cohort. Browser alone establishes neither. Explicit cross-device entries appear in both; unspecified devices are reported outside the pies. Each project contributes one destination, including no listed link. Small destinations group into Other destinations without losing their count. Counts are current catalogue labels, not tests of compatibility or market share.
