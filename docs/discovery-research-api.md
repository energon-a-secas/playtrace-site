# Discovery, research and the review queue

The October 2026 campaign separates the landing page, catalogue and saved games, and adds guest ratings, reusable playtests, store evidence and an admin review queue. Apply migration `0009_discovery_research.sql` before deploying this Worker. Keep all earlier migrations; rollback files are only for disposable databases.

## Using the site

- Home: `/`. Existing root links with project/filter parameters redirect to `/browse.html`, preserving their state.
- Browse: `/browse.html`. Type in the Maker dropdown and select a result. Cards open project notes; independent genre, favorite, Reddit and game controls retain their own actions.
- Favorites: the star filter in `/browse.html`. Saved games work offline and reconcile after sign-in. `/profile.html` redirects to this filter.
- Quick reviews: `/research.html`. Type a title or maker into the game picker; optional topics and questionnaires are in a disclosure. Project notes link directly to the default five-question study.
- Admin: `/admin.html`. The verified owner and enabled editors can edit project details directly from a card/project popup, upload images there, curate **Weekly highlights**, edit all details under **Projects**, create studies under **Questionnaires**, and process evidence under **Review queue**.

The quiz remains at `/quiz.html`. Both the quiz and playtest page support `?embed=1`. A study link can specify `form` and `game`, for example `/research.html?form=playtest&game=g_1x2q29h&embed=1`. The admin builder produces the iframe code. Research can send height updates to an exact HTTPS `parentOrigin`; it never broadcasts to `*`. Embedding depends on the parent site's iframe/CSP policy and browser storage rules. A standalone link remains available.

## Public API

All paths below use `/api/v1`. Guest ownership uses the existing random browser edit key in `X-Feedback-Key`, stored server-side only as an HMAC. Save/delete quotas apply. Keys, account identities and network identifiers are never returned in public aggregates.

| Method and route | Behavior |
| --- | --- |
| `GET /insights?cursor=...` | At most 200 public project evidence records, accepted field sources and store-reported release dates. No account, questionnaire or editorial data. |
| `GET /highlights` | Five weekly `items` and a separate nullable `editorPick`, with current public project metadata, week and revision. |
| `GET /games/:id/resolve` | Returns the current published ID for a consolidated repost, with `redirected`. |
| `GET /games/:id/context` | Shared source links, any explicitly published cited review, and URL-bound enrichment evidence. |
| `GET /games/:id/rating` | Public count and mean. A valid edit-key header additionally returns this browser's `mine`. |
| `PUT /games/:id/rating` | `{stars:1..5}`, one editable integer rating per browser/game. |
| `DELETE /games/:id/rating` | Removes this browser's rating. Empty request body. |
| `GET /research` | Active questionnaires and research categories. |
| `GET /research/:id?game=:gameId` | Form and the selected published project. Closed forms remain readable for response removal. A project-specific form requires the matching project. |
| `GET /research/:id/responses?game=:gameId` | This browser's own saved answers and revision; requires the edit key. |
| `PUT /research/:id/responses` | `{gameId,revision,answers}`. Single answers are option indexes, multiple answers are distinct index arrays, text is bounded to 1,500 characters. At least one answer is required. |
| `DELETE /research/:id/responses?game=:gameId` | Removes this browser's response, including when a form no longer accepts answers. |

Questionnaires contain one to five questions with stable IDs. Choice questions contain two to eight distinct options. Submissions preserve the exact question/version snapshot. Editing a form increments its revision and rejects stale submissions; project scope cannot change after responses exist; aggregations keep versions separate. There is one current response per browser/form/game, not one response per visit or question. The final step saves; navigating between questions does not manufacture metrics.

Ratings are public aggregates. Research answers are private to the editorial team and can be classified by Jev, as disclosed before submission. They are separate from public project feedback. Clearing browser data loses edit access; contribution/removal assistance remains available. Account favorites and historical account prices remain private and independent.

## Admin API

These routes require a Clerk session verified server-side against the fixed issuer and a verified primary email with an enabled admin role. The browser's admin visibility flag is not authorization.

| Method and route | Behavior |
| --- | --- |
| `GET /admin/me` | Identity, role and boolean Jev/itch integration configuration, never secrets. |
| `GET /admin/research` | All forms, including disabled forms, with response counts. |
| `PUT /admin/research/:id` | `{title,category,gameId,questions,revision,active}`. Use revision `0` for a new ID; an existing form requires its current revision. |
| `GET /admin/research/:id/metrics` | Counts by project/revision and choice distributions. No guest hashes or free-text response dump. |
| `POST /admin/jobs` | `{kind,scope,gameId}`. Kinds: `links`, `store`, `feedback`, `references`, `research`; scopes: `recent`, `all`, `game`. Use `gameId:null` outside game scope. |
| `GET /admin/jobs?status=ready&kind=feedback` | Twenty jobs per page with a `nextCursor`; status counts match the kind filter. |
| `POST /admin/jobs/run` | `{}` or `{kind:"links"}`; processes one matching job under a lease. |
| `PUT /admin/jobs/:id` | `{action:"retry"}`, `dismiss`, or `publish`. Only a ready, cited Reddit feedback draft can publish. |
| `GET /admin/reposts` | Preview conservative matching groups. |
| `POST /admin/reposts` | `{}`; consolidates the next group, retaining its newest source identity. |

Operator automation has a separate `POST /admin/campaign` route. Its body is `{action,options}` with `enqueue`, `run`, `jobs`, or `reposts`; it requires the existing operator bearer token. Operator runs process at most two jobs. This credential is never sent to the frontend. Publishing reviews still uses the editorial admin route.

## Queue behavior and evidence

Enqueue is idempotent for each game/kind/calendar-day window. Feedback and research windows begin two calendar months before enqueue. `recent` selects projects updated in that period; use `all` to inspect recent comments on older inactive projects too. Store jobs match effective Steam and itch.io links; collection-wide link jobs omit entries without a destination. Explicit admin link removal takes precedence over imported data.

Jobs move from pending to running to ready or failed. A lease recovers interrupted running jobs after three minutes. Failures retain a retry action and do not loop indefinitely. Upstream rate-limit reset times are persisted: affected jobs remain pending, other job types can continue, and subsequent invocations honor the cooldown. Minute 20 of each hour processes a job and queues a bounded number of due store checks, with a seven-day refresh interval and a backlog ceiling. Minute 50 checks one repost group. Existing minute-05 Steam/media maintenance and minute-35 source ingestion are unchanged. Admins can run a job immediately.

Link checks distinguish `reachable`, `broken` (404/410), `blocked` (401/403/429), and `unverified` (timeouts, other responses or inaccessible metadata). HTTPS destinations, DNS answers and every redirect are checked; no credential is forwarded to a supplied URL. Checks cannot prove that a game executes or that a parked domain still hosts its original project. Human playtests and the change-request inbox cover that gap. Nothing is automatically removed after a failed request. Reference jobs separately record whether the archive has a source post or marks it removed; these observations can lag behind Reddit.

Steam uses its public app-details endpoint and existing USD price cache. Itch community pages use public HTML metadata; its API token only grants access to games owned/editable by that account. The integration caches public game fields, never purchases or earnings. External store artwork is linked with its source. An actual itch embed/download/buy control or released Steam app supports an available-build label. HTTP 200 alone does not. Automatic playable status is time-limited, and explicit admin stage/image choices always win.

Reddit reviews inspect up to ten latest source posts, the latest 100 comments per post from adaptive archive pages, then classify up to 30 eligible recent comments. Creator replies, removed text, bots and mismatched source IDs are excluded. Drafts show window, sample/coverage limits, model, classifications and source comments. Jev performs typed theme/tone choices; a deterministic composer includes sufficiently supported statements with numbered links. Ambiguous/mixed classifications remain inspectable and do not become confident claims. No generated reviewer quotes are invented. A draft does not become public until an admin selects **Approve & publish review**.

Research analysis uses up to 30 recent responses, labels the sample and remains private. Editing or deleting a response invalidates stored analysis for that project so copied evidence cannot outlive the response. Treat metrics as browser contributions, not verified people or purchases. Jev's selected probabilities are model outputs, not calibrated assurances of correctness.

## Secrets and data maintenance

Store `JEV_API_KEY` and `ITCHIO_API_TOKEN` as encrypted Worker secrets. Jev credentials are used only at `https://api.typesafe.ai/v1/systemone`; itch credentials only at `https://api.itch.io/profile/games`. Public arbitrary-page fetches contain neither token. No secret belongs in HTML, JavaScript, committed files, public environment variables, URLs or logs.

Reposts require the same author, closely matching long source headlines, a 48-hour window and no conflicting known project URLs. Matching uses complete groups rather than transitive similarity. Admin-corrected URLs are respected. Consolidation preserves original posts, redirects, favorites, ratings, research and editorial overrides; moderation remains enforced. Quiz choices retain their curated identity while resolving visibility through the new canonical project. Aliased IDs cannot be republished by a later archive import. A project's removal also removes associated alias records and private/public contributions.

To backfill shared links from already retrieved source evidence:

```sh
node scripts/backfill-project-references.mjs --raw /private/path/posts.json --linked /private/path/linked-posts.json --output /tmp/playtrace-references
```

Inspect the generated JSON/SQL, then apply the SQL with the usual D1 operator workflow. It joins current published source membership and author identity, so hidden posts, removals and consolidated projects remain authoritative. It does not import games or change names. New source ingestion extracts references automatically; a reference job resolves linked Reddit titles from the archive.

Authoritative integration references: [Jev API](https://docs.typesafe.ai/api), [itch.io server-side API](https://itch.io/docs/api/serverside), [Arctic Shift API](https://github.com/ArthurHeitmann/arctic_shift/blob/master/api/README.md).

For larger feedback campaigns, a complete archived comment window can be reused across jobs:

```sh
node scripts/prepare-feedback-window.mjs --catalog /private/path/catalog.json --comments /private/path/comments-window.json --output /tmp/playtrace-feedback-window
```

The input includes `windowStart`, `windowEnd`, `complete:true` and archived `rows`. The script refuses incomplete windows, applies the same source/author/date filters as normal queue reads, and writes bounded evidence only to matching pending feedback jobs. Inspect and apply its SQL separately. Cached evidence avoids repeated archive requests; Jev rate limits and the explicit publish step still apply. This staging operation creates no visitor responses, ratings or quiz metrics.

The classification phase can also run outside the Worker using its same typed Jev implementation:

```sh
node scripts/classify-feedback-jobs.mjs --jobs /private/path/pending-jobs.json --catalog /private/path/catalog.json --env /private/path/credentials.env --output /private/path/review-results
```

Export `id,game_id,window_start,payload_json` for pending feedback jobs with staged `archiveBatch` evidence using D1's JSON output. This runner reads only `JEV_API_KEY` from the supplied environment file, checkpoints completed classifications and honors provider cooldowns. Its SQL only changes a still-pending job whose evidence is unchanged; running jobs and newer evidence are preserved. Inspect and apply that SQL separately. Results remain private drafts and require normal admin approval before publication.

## Discovery availability

Anonymous catalogue, weekly highlight and status responses use a 60-second Worker cache. Each lookup reads one indexed revision row; successful catalogue edits, operator updates and scheduled maintenance advance that revision. Authorization, guest edit keys, cookies and all personal/contribution routes bypass the shared cache. CORS is checked before lookup and applied separately to each response.

On a first-load service interruption, Home and Browse may use `data/public-catalog.json`, a dated export from the public API. It must be less than 24 hours old and pass normal provenance validation. Browse labels it as a saved collection. It never replaces a partially loaded live archive, hides invalid server data or accepts offline contributions. Keep its timestamp equal to the actual export time; do not renew an old file's date. The curator seed in `data/catalog.json` remains separate.

## Weekly highlights and uploaded images

`GET /admin/highlights` returns the selection plus exclusions. `PUT /admin/highlights` accepts `{revision, items:[{gameId,pinned}], excluded:[gameId], editorPickId:gameId|null}` with exactly five distinct published weekly games. The editor’s pick is a separate sixth project, excluded from weekly rotation, and stays until an admin replaces or clears it. Omitting `editorPickId` preserves it for older clients. All choices must be published; the editor’s pick cannot duplicate a weekly or excluded project. Withdrawn entries disappear from public picks. A conflicting revision returns 409. Removed weekly picks remain excluded from automatic rotation until allowed again. Metadata is stored under `app_meta.weekly_highlights`; no additional migration is required. The weekly five remain curated, not vote-ranked.

The Worker runs `0 3,4 * * 6` in UTC. `highlightWeek()` derives the Saturday in America/Santiago, so only the invocation at local midnight rotates the week; the other is an idempotent no-op. The selection retains pins, excludes broken links and overly long titles, prefers available builds and different makers, and reduces repeats from recent weeks. It reads a bounded window of 200 recent projects plus pinned projects. Initial picks were installed with an insert-only metadata operation; existing editorial choices are never overwritten by deployment.

Uploaded images use R2 publication records at `published-previews/<asset-id>.json`. These records contain only the approved object key, MIME type and project ID. Public delivery reads R2, without consulting D1, so a database read quota cannot hide approved artwork. Upload, replacement, reset and repost consolidation maintain those records. A `withdrawn-previews/<game-id>.json` tombstone denies all that project's images before database removal or object cleanup, including concurrent uploads. This remains a private R2 bucket exposed through the existing Worker media route; no public bucket URL is used. Responses remain `no-store` to honor withdrawals.

For an existing deployment, prepare publication records for **only** current uploaded previews on published, non-removed games before deploying the R2-only route. The seven current uploads were reconciled and their live URLs verified. Keep all original consent and asset records in D1.

The dated public collection includes effective manual details and image overrides. It is regenerated from public records, never the small seed catalogue. `data/highlights.json` is an explicitly labeled fallback with a seven-day age limit; the catalogue fallback remains limited to 24 hours. Neither fallback pretends feedback or admin writes can be saved while the API is unavailable.
