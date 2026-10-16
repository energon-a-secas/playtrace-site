# Playtrace

## Register

product

## Users and purpose

Curious players and independent makers discover games shared by their creators on r/aigamedev. They need a preview, a clear source, a project's history and a public place to consolidate useful feedback without searching a long social feed.

## Scene

Players compare source-linked games in a calm, report-like reading surface. Pale slate, navy type and amber actions support daylight browsing; the interface follows the system dark preference in low light. Archivo headings and Source Sans 3 body text are self-hosted with their font licenses.

## Session outcome

Find a game to try, understand what changed, and share a useful note with an optional ideal price. Reading and contributing never require an account. Each browser can edit or remove its own public contribution. Collection reaches back to the community's creation in December 2022, with newest updates first and honest progress while historical collection continues.

Two optional multi-select questions invite a quick first impression, followed by an optional note. Keep the questions before existing contributions on narrow screens. Display name and ideal price expand only when wanted. Publish aggregate choices alongside the conversation without presenting visitor responses as verified players.

The screenshot quiz remains available at its dedicated route, but is not promoted in primary navigation or home. Discovery, Browse, Insights and Submit feedback take priority.

## Voice and principles

Curious, direct and grounded. Show real games before explaining the platform. Put constructive feedback before price. Treat an ideal price as a suggestion for the maker. Separate creator-described claims from reviewed metadata. Expose source dates and archive coverage. Derive collection insights from records; never manufacture votes, traction or urgency. Clearly identify visitor contributions and their public visibility.

## Anti-references

No auction pressure, invented revenue projections, cryptocurrency cues or decorative dashboard metrics. No generated game artwork passed off as an actual preview. Backend setup details stay out of the discovery flow.

## Accessibility and system

Use the canonical Neorgon tokens and Header, Footer, Auth, DOM and navigation kits. Native controls and dialogs support keyboards and touch. Keep visible focus, useful image fallbacks, reduced motion and layouts that fit narrow screens. The report-inspired visual dialect is scoped in `css/report.css`, preserving shared kit behavior. Brand amber is `#f9b73f`; action text uses navy for contrast.

## Editorial care

Project details lead with artwork filling the banner, with Project notes and a white outlined close control overlaid for contrast. Compact shortcuts sit beside the tags, with a clear Visit game button beside the title. Icon shortcuts have hover and keyboard labels, with visible captions on touch screens. Project history and source context precede player feedback, which is the final section. Each section owns its top divider, so hidden media never leaves doubled rules. The index explanation is a separate About article. Updates are subsequent source posts after the first showcase. Public change requests feed a private admin inbox; administrators can edit titles, descriptions, project links, genres, stages, device lists, tags, and previews without overwriting source history. Edits survive future archive imports and conflicting detail edits require a reload. Steam store prices stay visibly separate from player price suggestions. Only a verified server-side identity grants administrative access.

## Project platforms

The Platform filter describes the linked destination: itch.io, Steam, a code repository, another project website, or no project link. Each validated game derives its `distribution` field from its HTTPS `projectUrl`, so existing and newly collected records receive labels without reimporting the archive. This is separate from `platforms`, which describes supported devices under Runs on, and `stage`, which describes development progress. A store URL identifies a destination; it does not establish a completed release. Confirmed Steam metadata retains its own release and price labels.

## Source inclusion

Posts with the exact Demo | Project | Workflow flair are eligible for automatic inclusion. Older unlabeled game showcases can be included after individual review, with their missing flair preserved and an explicit review marker. Explicitly excluded flairs never qualify for that exception. Apply the same rule to historical imports and existing records. Hide excluded projects without deleting their stored contributions. Cards open project details across the whole surface; independent genre chips apply filters and the Reddit icon opens the latest source post.

## Names and editorial taxonomy

Use the actual game name as the title and the original Reddit headline as supporting context. Prefer verified store metadata, specific project URLs and explicit names in source text; keep uncertain headlines for review. Admin names win over automation. Categories belong to a shared saved registry: administrators can add missing genres from the editing dropdown and reuse them across projects. Clicker is included. Keep playable GitHub Pages URLs separate from the source-code repository, with independent Visit game and Source code actions.

## Discovery and research navigation

Home opens directly on six adjacent clickable game-art panels spanning the viewport, inspired by FromSoftware’s artwork-led arrangement. Five are weekly highlights; the sixth is an explicitly labeled editor’s pick that persists until an admin changes it. Each keeps its title and creator credit visible. Use existing community preview assets, preserve approved uploads, and stack the panels on narrow screens. Wide screens expand the hovered or keyboard-focused panel with moving masks and transforms, honoring reduced motion. No automatic carousel. Rotate unpinned weekly picks on Saturdays at midnight in America/Santiago, preserving exclusions, pins and the separate editor’s pick. Admins can reorder and replace selections under Weekly highlights. Link directly to r/aigamedev beneath the artwork, with Browse the collection and Insights centered together, with provenance and the feedback invitation in one footer. The first five are curated for now; a future voting policy must not label them most-voted without genuine rating evidence.

Browse owns collection search and filters, including a star toggle for Favorites. The old profile route redirects to this filter. Favorites save without login and reconcile with the account after sign-in. The Maker field supports typing and keyboard selection. A guest rating is one editable one-to-five-star contribution per browser/game. Branded Steam, itch.io and Reddit actions open independently of the card. A verified released Steam demo has one Play demo action. Hover glints are brief and disabled for reduced motion.

A full-game Steam listing can also have a separately verified released demo. Check the related app’s type, release state and parent identity before offering Play demo; retain the main store link and its own release status. Demo and full-game release dates count separately, with each Steam app counted once. Related lookups use the existing cache and scheduled six-request budget; stale or unavailable evidence falls back to the main listing.

Submit feedback (`/feedback/`) is a standalone surface with a public-note action and an optional embeddable questionnaire. Start with one searchable game combobox, a primary link to the project’s public feedback and an obvious link to try it; keep optional questionnaire topics in a disclosure. Disable loading forms and replace unavailable ones with a retry and a Browse route. Present one question at a time, with back/skip controls and a final save. Admins can create reusable or project-specific forms with one to five questions and research topics. Preserve revision-specific metrics. Research answers are private and may be analyzed by Jev, with that use disclosed before submission. Public project comments retain their existing visible consent and removal controls.

## Evidence queue

Editors can inspect link health, store metadata, linked source posts and cited feedback drafts. Distinguish a broken link from blocked access or a timeout. HTTP success alone never implies a playable build. Steam/itch evidence can improve automatic artwork or playable labels, while manual editorial choices win. Do not delete entries or publish AI reviews automatically after checks. Every review statement must link to real original comments and show sampling limits. Model probabilities are not guarantees.

Keep HTTP reachability separate from metadata extraction. Oversized or interrupted HTML may prevent reading game details without invalidating the received HTTP status. Discard incomplete metadata and keep the previous store evidence's date. Prefer creator-labeled play links over asset-store references; an expired download does not establish that development stopped.

Near-identical reposts by the same author within 48 hours keep the latest entry and combine source history, with redirects and preserved contributions. Different known project links prevent consolidation. The source timeline and original attribution remain readable.

Administrators see Edit buttons directly on cards and in project notes. Edit details in the existing project dialog with revision conflict protection; keep thumbnail uploads beside that editor. Approved uploaded images are served from R2 without catalogue database reads. Source and privacy controls belong in the single site footer.


## Discoverability and measurement

Each project has a permanent `/games/<id>/` page with prerendered content, original sources, sharing metadata and structured data. Browse retains quick popup details. Search-ready pages enter the sitemap; uncertain source headlines remain accessible with noindex until enrichment improves them. A server-rendered game directory provides crawlable links. A complete live catalogue build runs hourly and refuses partial or changing snapshots. Removed projects disappear on the next successful build; live pages check withdrawal immediately when JavaScript runs.

Anonymous usage counts measure actions, never unique people or verified plays. No account IDs, browser IDs, search terms, referrers or written feedback enter this dataset. Respect DNT, GPC and the About-page opt-out. Delivery UUIDs deduplicate retries for one day; hourly network hashes limit spam. Retain daily totals for 180 UTC dates and purge expired records during hourly maintenance. Do not calculate a conversion funnel from unrelated action totals.

## Community insights and admin research

The public Community Insights page uses an hourly, dated catalogue evidence snapshot. A separate admin view adds operational usage and contribution counts. Accounts, private questionnaire answers and editorial notes remain server-gated. Accepted source-linked facts are stored separately from imports, and explicit admin edits always take precedence. Exact, past Steam release dates have their own timeline; first community posts never stand in for release dates.

Distinguish original post-date mention trends from first-shared cohorts labeled with current metadata. Show denominators, unknown classifications, text coverage and source excerpts. Art styles, engines and models are explicit text matches, not screenshot analysis or proof of use; preserve unspecified versions. Compare equal 28/56/84-day windows around sourced provider announcements, deduplicate each project per window, show small/partial samples and state that timing does not establish causation. CSV exports and accessible chart tables retain the same definitions.


## Feedback evidence and refresh cadence

Existing Reddit scores refresh only on Sundays at 12:50 UTC for original source posts from the previous 35 days. Reserve at most eight requests of 100 IDs before fetching; preserve dated snapshots on missing/stale/error responses. Initial ingestion may seed a missing score from data already fetched. Reuse the hourly maintenance trigger to remain within five cron definitions; use explicit SAT for highlights.

Community summaries combine at most 30 archived non-creator comments from ten source posts and 30 public written Playtrace notes in a 60-day window. Jev classifies bounded groups of ten; it supplies typed topic, tone and explicit experience labels, not factual prose. Editors can correct labels and prose, and must approve every publication. Mixed feedback remains mixed. New public notes queue automatically ahead of store backlog; up to eight recent projects queue on Sundays, with an eight-feedback-job backlog cap and the shared daily budget. Nothing auto-publishes.

Public notes offer an optional first-look / played perspective; old or skipped answers stay unspecified. Self-reported play is never verified play. Public summaries retain source-specific counts and citations, including stable links to Playtrace notes. Edits, moderation and deletion withdraw copied reviews and drafts; an atomic source check prevents in-flight jobs from restoring stale copies. Private questionnaires stay in their separate admin analysis flow.

The public feedback pattern report reads live, no-store data, separately from the catalogue snapshot. Count quick answers per current browser/game contribution and reviewed comments per source URL; never add these overlapping measures or infer identities across sources. Compare by game, genre and linked platform, with missing experience and unclassified comments visible. Five citations across three projects is an exploratory repeated-theme label, not statistical significance. Follow-up questions are proposed research, never predictions about likely success or causality.

The weekly brief compares complete Monday–Sunday UTC weeks and keeps unknowns in its denominators. Daily fingerprint checkpoints distinguish recent arrivals from backfills, metadata corrections and regrouped histories. Show the real baseline date, including when less than a week of checkpoints exists. Keep old prose and identities out of checkpoint history. Cited-source maintenance uses bounded weekly-eligible checks; missing archive records are not deletions. Newer confirmed changes withdraw dependent reviews for editorial inspection, while guest contributions and explicit admin edits remain intact.

Let readers filter reported experience and inspect each topic's original comments inline. Research leads rank distinct projects with reviewed concerns or suggestions before comment volume; positive and mixed reactions stay separate. The lead's repeated label needs five concerns/suggestions across three projects, independent of the full topic's coverage. Evidence lists and CSV exports use the same selected records, retain source links and dates, and exclude comment bodies and identities. First-look and played columns are independent comments, not matched people. Paired expectations retain their separate cohort and scope.


## Destination observations and paired expectations

Retain up to 52 dated destination checks per project, including requested/final URL, HTTP status, redirect count and failure reason. Show the latest 12 for the current URL on the project page. Missing (404/410), restricted, inconclusive and unchecked are distinct. Never infer game abandonment or host uptime from these snapshots. Hosting labels use the visible domain; custom-domain infrastructure remains unknown. Browser destinations become eligible weekly when uncertain, monthly when reachable; enqueue one per hourly tick, cap pending/running link jobs at eight and share the 72-job daily budget. Store destinations retain their existing maintenance.

Offer an optional, collapsed first-impression → after-play comparison alongside public feedback. Use the existing guest edit key, a 1–5 interest scale before and after, and a separate less/matched/better/unsure expectation answer. Require a previously saved first impression and a later timestamp; freeze the baseline after the first follow-up. Revision conflicts, project withdrawal and duplicates must never join unrelated answers. Publish only grouped counts for first impressions saved in the last 60 days; incomplete follow-ups do not contribute to paired outcomes. Allow same-browser editing/removal, with no login or cross-source identity matching.

Reviewed histories across longer periods require explicit source evidence and a separate guarded operator plan. Keep original source dates, former project URLs, saved favorites and superseded link observations. Shared authors or similar titles alone do not establish identity. Stop for a separate contribution or consent review when an archived entry has visitor data, admin edits or uploaded artwork that needs to be carried over.

## Post research and route compatibility

Run source-post research locally from a private D1 export. Jev answers six typed questions about purpose, feedback specificity, development detail, wording, access clarity and stated limitations. Describe text, never personalities or sensitive attributes. Keep private questionnaire responses outside this study. Redact common identifiers and send bounded public text only, with scores, dates and author fields omitted. Save model probabilities and unknowns; no automatic publication.

Compare score observations at similar post ages, not the dates Playtrace downloaded them. The initial October study found scores were usually archived within seconds of posting, so no best posting time or successful-post ranking is supported. Keep small cohorts suppressed and treat future associations as observational. Reddit remains the primary discussion source.

Use /browse/, /insights/, /about/, /feedback/ and /admin/. The Pages build creates directory indexes and legacy .html redirects that preserve queries and fragments. Canonical metadata and the sitemap use the shorter routes. Project ID URLs remain stable.
