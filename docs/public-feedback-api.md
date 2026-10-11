# Public feedback and historical collection

This extends the original v1 contract for the user's explicit choice: **read and contribute without login**. The API base remains `/api/v1`. These additions do not republish legacy private account responses.

## Catalogue and stable identity

`GET /catalog?pageSize=200&cursor=…` returns the existing schemaVersion 1 catalogue fields plus `pagination: { total, nextCursor }`. Page size is 1–200, default 200. Games sort by newest source update, then ID ascending for ties. The opaque cursor is base64url-encoded `[updatedAt, gameId]`; do not construct it in clients. A null next cursor ends pagination. Counts exclude removed games. The total public catalogue has no 2,000-game cap; individual operator imports remain bounded to 2,000 games.

The client validates each page, renders the first page immediately, and fetches the remaining pages. While incomplete, search, filters, and counts explicitly describe the loaded subset. Rendering expands in groups of 60. Changed revisions, duplicate IDs, invalid totals, and repeated cursors fail visibly; already validated initial pages remain available with a retry. Refreshing a previously complete collection replaces it atomically, including removals. A shared project absent from an incomplete load is not declared removed.

`g_<sourcePostId>` is the permanent source anchor, which must be present somewhere in the project's timeline. It no longer has to be the earliest source. Older posts from the same author and canonical project URL extend `firstSeenAt` while preserving IDs, follows, private prices, and public feedback. `updatedAt` remains the maximum included source date. Author equality alone never merges projects. Imports cannot reassign an existing source to a different game, and removals remain tombstoned.

## Guest endpoints

| Route | Method | Request / response |
| --- | --- | --- |
| `/games/:gameId/feedback` | GET | Public page: `{gameId, entries, count, choices, idealPrices, nextCursor}`; optional `cursor` query |
| `/games/:gameId/feedback/mine` | GET | Edit key header required; `{gameId, feedback: entry \| null, moderated: boolean}` |
| `/games/:gameId/feedback` | PUT | Edit key header and `{displayName, body, idealPriceCents, choices?}`; other fields rejected; returns `{gameId, feedback}` |
| `/games/:gameId/feedback` | DELETE | Edit key header, no body; removes the caller's published contribution, returns `{deleted:true}` |
| `/admin/feedback/:id/hide` | POST | Operator bearer token and `{reason}`; returns `{hidden:true}` |

An entry contains `id`, `displayName`, `body`, `choices`, `idealPriceCents`, `currency:"USD"`, `createdAt`, and `updatedAt`. No browser key, key hash, IP, account identity, or moderation reason is public. Pages contain twenty entries ordered by creation date descending and UUID ascending. Edits retain the original creation date and ID. `idealPrices` is `{currency:"USD", count, medianCents}`; an empty cohort has count zero and a null median. Hidden/deleted entries disappear from counts, choice aggregates, and medians. Legacy account prices are never queried here.

`choices` on an entry is an array of up to ten unique IDs from `js/feedback-options.js`: `idea`, `visuals`, `gameplay`, `world`, `sound`, `guidance`, `controls`, `performance`, `content`, and `accessibility`. The two multi-select questions are optional; one choice alone is a valid contribution. Unknown or duplicate choices fail validation. The page-level `choices` contains all ten `{id,count}` values, aggregated across all published feedback, independently of pagination. Cached older clients may omit `choices`; an edit then preserves existing choices, while a new entry defaults to an empty array. Sending `[]` explicitly clears them, subject to the content requirement.

The browser generates 32 random bytes, represented by exactly 64 lowercase hex characters, and stores them under `playtrace:feedback-edit-key:v1`. It sends the key only as `X-Feedback-Key`, with `credentials:omit`. The server derives HMAC-SHA256 with `RATE_LIMIT_SECRET` and the domain separator `guest-feedback:`. It never persists the raw key. Key possession allows editing/removing that browser's contribution; it does not authenticate a person. Clearing storage loses editing access. If storage is blocked, the UI explains that edits are available for the current visit only. Operator reports remain available.

Display names are optional, trimmed, single-line, and at most 40 characters; blank becomes `Guest`. Notes are trimmed and at most 1,500 characters. A submission requires a quick choice, at least eight note characters, or an ideal price. Price must be null or an integer from 0 to 10,000 cents, inclusive; zero is valid and blank is null. The UI explicitly states that choices, name, note, and optional price will be public before submission. Output is rendered as escaped text.

Guest saves have independent per-key and network hourly limits (10 and 60), plus the existing shared subject limit (30). Deletion uses a separate privacy quota (60). Network identifiers are temporary daily HMAC values, never raw addresses. Standard API errors include 400 invalid input, 403 denied/moderated, 404 unknown/removed project, 429 rate limited with retry timing, and 503 unavailable setup. Feedback responses are `no-store`. Allowed-origin preflights permit `X-Feedback-Key`. Clerk and Turnstile are not requirements for guest feedback.

## Historical checkpoint

`POST /admin/backfill` accepts `{}` and uses the existing independent operator bearer token. It scans ascending from the archive-confirmed group creation timestamp, `2022-12-11T12:00:48.000Z`, up to a frozen start-of-pass target. Each invocation requests at most three 100-row pages, overlaps the timestamp boundary, and stores state under `app_meta.history`. Completed historical passes become a no-op. The separate `app_meta.ingestion` checkpoint retains recent descending scans with a 48-hour overlap.

The historical state contains `state`, `startedAt`, `communityCreatedAt`, `scannedThrough`, `resumeAfter`, `resumeBefore`, `targetCoverageThrough`, `lastAttemptAt`, `lastSuccessAt`, `coverageThrough`, per-run counts, and a safe internal error code. Failed archive requests keep their retry window. Persistence failures cannot advance committed coverage. Long rate-limit waits stop the invocation rather than shortening the advertised wait. A stalled full page remains incomplete for operator investigation.

`GET /status` adds `capabilities.feedback` and public `history: {state, communityCreatedAt, startedAt, scannedThrough, completedThrough, lastAttemptAt}`. `completedThrough` is null until historical completion. No internal cursor or upstream diagnostics are exposed. Historical scans do not overwrite recent coverage. The hourly `35 * * * *` UTC schedule runs recent collection first and attempts history only after a successful complete recent pass, avoiding an extra call after partial/throttled work.

Creation evidence: the archive subreddit metadata and its first post `zipbkg` both report epoch `1670760048`. The fixed boundary is independent of publication eligibility. Games can be absent because posts are deleted, unavailable to the archive, not clear showcases, or awaiting review. Historical completion means the available archive window was checked; it is not a promise that every Reddit project is represented.

## Migration and release order

Apply all pending migrations in numeric order before deploying the current Worker. Migration 0002 adds public feedback, 0003 adds the pagination index, and 0004 adds editorial tools. Migration 0005 rebuilds feedback to allow choice-only content while preserving IDs, edit access, names, notes, prices, timestamps and moderation. Migration 0006 adds [the screenshot quiz](name-game-api.md). Private account rows are unchanged. For this release, apply 0005/0006, deploy and verify the Worker, then publish the frontend. Older three-field feedback clients remain supported. Test positive guest and quiz writes in disposable storage; production verification is read-only.

After historical records attach, rolling back to the old earliest-source identity validator can make valid timelines unreadable. After passing 2,000 games, rolling back to the old unpaginated catalogue also fails. Retain the new validator and pagination during any feature rollback, keep feedback records available for removal requests, and disable collection/writes through a compatible forward change. Destructive rollback SQL is only for disposable databases.

Archive query timeouts using HTTP 422 are retried only when the upstream error exactly identifies a timeout. HTTP 429 reset instructions are persisted as an internal `retryAt` checkpoint; later runs do not contact the archive early and return `Retry-After` when deferred. Neither failure advances coverage.
