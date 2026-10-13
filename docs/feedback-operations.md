# Community feedback and weekly maintenance

The product question is what attracts a first look, what people report after trying a build, and what a maker should investigate next. The unit is an attributed public contribution, not a verified player. Jev provides typed classifications; an editor writes or approves the interpretation.

## Scheduled work

| Work | Eligibility and cadence | Bound |
| --- | --- | --- |
| Reddit score refresh | Sunday, 12:50 UTC; source posts created within 35 days | Eight actual archive requests, 100 IDs each; reserve before fetching; no hidden retries |
| Initial score | Newly ingested source without a stored score | Use an observation already fetched for ingestion; no extra request |
| New public notes | Hourly editorial queue tick, after a new or edited written note | One project queued per tick; at most eight pending/running feedback jobs |
| Recent Reddit feedback | Sunday maintenance | At most eight recent projects, excluding checks from the preceding week and projects already queued |
| Editorial processing | Existing hourly queue | Shared 72-job daily default; failed jobs also consume budget; archive/Jev cooldowns respected |
| Weekly highlights | Saturday in America/Santiago | Existing pins, exclusions, ranking and editor’s pick remain authoritative |

Sunday work reuses the hourly `:50` trigger, leaving five cron definitions. Cloudflare numbers weekdays from Sunday, so highlight configuration uses `SAT` explicitly. See the [Cron Trigger reference](https://developers.cloudflare.com/workers/configuration/cron-triggers/) and [account limits](https://developers.cloudflare.com/workers/platform/limits/).

Score refreshes use Arctic Shift observations. A successful fetch does not make an old archive score a live Reddit count. The stored archive timestamp remains visible. Older, absent, invalid or failed observations never erase a good score. Posts older than the window retain their last snapshot. The request cap may leave part of an unusually busy month unchecked; Admin → Evidence queue shows the run’s status and coverage.

## Summaries and editorial review

Each draft covers 60 days and samples at most 30 eligible Reddit comments from the latest ten source posts, plus 30 public Playtrace notes. Creator comments, deleted/removed comments and automatic moderator posts stay out. Reddit uses original comment dates; Playtrace uses last-edited dates. Quick choices without a written note enter descriptive aggregates, not text classification. Each source retains separate eligible, classified and sampling counts.

The encrypted `JEV_API_KEY` is sent only to the pinned [TypeSafe API](https://api.typesafe.ai/redoc). Requests send quoted body text in groups of ten, with at most thirty typed questions per call. They do not send guest keys, account information, display names or private questionnaire answers. Topic and tone need a selected probability of at least 0.7 to become a draft citation; inferred explicit Reddit experience needs at least 0.8. These thresholds route material for editorial inspection, not statistical confidence. Mixed reactions remain mixed, and uncertainty remains unspecified.

An editor can change draft prose and the topic/tone labels, check Reddit experience against the quote, and approve publication. A Playtrace visitor’s stated perspective cannot be overwritten by the model or editor. Every numbered citation must remain in the edited summary. Only published reviews enter public pattern metrics; ready jobs and private questionnaire analysis stay private. There is no automatic publication.

Citation links open the original Reddit comment or the public Playtrace note, including notes beyond the first feedback page. Editing, hiding or deleting a copied note withdraws its review and stored draft. SQL source checks prevent an in-flight Jev response or publication from restoring a changed note. Current public reports are `no-store`, separate from the hourly catalogue snapshot.

## Measures and interpretation

| Measure | Denominator and interpretation |
| --- | --- |
| Public Playtrace contributions | Current published browser/game contributions updated within the last 60 days. One contribution may contain several quick answers. |
| Reviewed Reddit comments | Distinct cited source URLs in published summaries, dated within the report window. Not unique Reddit users or all comments. |
| Reviewed Playtrace notes | Cited public notes in approved summaries, a subset of Playtrace contributions. Never add these overlapping totals. |
| Topic by experience | One reviewed topic/tone per citation, split into first look, reported play, and unspecified. Play is never independently verified. |
| Repeated theme | At least five reviewed citations across three projects. An exploratory browsing rule, not significance or prevalence. |
| Follow-up question | A research prompt associated with an observed topic. It is not a finding or a prediction. |

Filters select a project, current genre, linked platform, feedback source and reported experience. They do not match identities across Reddit and Playtrace. Earlier summaries without topic labels remain readable and count as unclassified. Small samples, editorial selection, missing archive coverage and unclear experience limit comparisons. Questionnaire answers can inform a separate private analysis, with consent and revision-specific measures; they never enter this public endpoint.

The report offers at most three research leads, ranked by distinct projects with reviewed concerns or suggestions, then the number of those comments reporting play, then their total count. Praise and mixed reactions do not increase this priority. A lead's repeated label requires five concerns/suggestions across three projects; the topic table separately counts all reviewed tones. This prioritizes further investigation within the selected evidence, not product severity, prevalence or expected player satisfaction.

Topic drill-downs include the source links, dates and reviewed labels, with a response filter and 12-at-a-time expansion. Unclassified citations remain inspectable. CSV exports contain the same complete filtered source set, independent of the displayed page limit, plus report dates and filter context. They omit bodies and identities and neutralize spreadsheet formulas. First-look and played columns are independent comments. Separate paired-expectation counts use project/genre/platform scope, not comment-experience scope; the interface states this when an experience filter is active.

Useful next research asks for a device and failing action when controls are mentioned; the encounter and time played for difficulty; the exact point of waiting for pacing; and the barrier to reading or continuing for accessibility. First-look comments need a follow-up after play before claiming an expectation was met or disappointed. The dashboard links to the appropriate focused questionnaire.

## Deployment and checks

Apply migrations through `0014_feedback_context.sql` before the Worker, then publish the Pages build. Export D1 into a private directory first. Schema rollback instructions are for explicit recovery only; prefer a forward fix that preserves contributions.

Tests cover bounded Sunday requests, duplicate invocations, stale/missing observations, cooldowns, private-data exclusion, backward-compatible feedback writes, source edits/removals racing Jev, reviewed label validation and report denominators. Browser checks use local fixtures for writes and cover rapid panel reversals, reduced motion, narrow layouts, citation links and editor controls. Never create synthetic visitor contributions in production.


## Destination history and returning-player comparisons

Apply migrations `0015_link_observations.sql` and `0016_play_expectations.sql` before this Worker release. The first backfills the stored latest check with its original timestamp and adds bounded insert/update history. The second adds private browser/game comparisons; no visitor answers are fabricated or backfilled.

`GET/PUT/DELETE /api/v1/games/:id/expectations` require the existing guest edit key and return `no-store`. First-look writes carry `phase`, `interest` (1–5), and `revision` (0 for new). After-play writes additionally carry `expectation` (`less`, `matched`, `better`, `unsure`). Optimistic revisions and a later server timestamp protect the baseline. After-play edits retain the original first look. Deletion removes the browser’s comparison, including aliases. Public feedback patterns expose only cohort and paired-value counts.

Link maintenance enqueues at most one non-store destination per hourly queue tick, capped at eight outstanding link jobs. Healthy observations are eligible after 30 days; uncertain ones after seven. Feedback jobs retain priority, and all editorial processing shares the 72-job daily ceiling. Store URLs remain on their existing store workflow. The hosting report counts projects, not unique hosts, and does not estimate uptime. A correction to the game URL starts a separate visible history while preserving prior observations.

For a source-review batch use an explicit saved selection with `scripts/enrichment-pilot.mjs --selection`, inspect its guarded SQL and flags, then rebase onto a fresh backup before applying. `scripts/prepare-reviewed-feedback.mjs` accepts per-citation editorial topic, tone and experience labels and verifies chosen comment bodies against the archive. No automatic model output is published.
