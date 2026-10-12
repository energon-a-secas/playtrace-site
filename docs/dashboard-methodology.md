# Catalogue insights, pilot methodology

The business question is what this community is making, how its visible output changes over time, and whether shifts coincide with new model capabilities. The unit is an archived project or an eligible source post, not a verified developer, player, launch, sale or unique site visitor.

## Views and denominators

| View | Date and unit | Meaning |
| --- | --- | --- |
| Genre, stage, linked platform | One project at its first source-post date | Arrival cohorts with current editorial labels. Not past states or verified launch dates. |
| Art, model and engine mentions | Distinct projects with a source post in each month/quarter | Explicit matches in the latest retained text. Each project can count in several periods and several labels. |
| Model announcement comparison | Distinct projects with posts in equal windows | 28, 56 or 84 days before/after an official announcement; intervals do not overlap. The launch date begins the after window. |
| Current collection | All currently published, non-withdrawn projects | Storefront destination, current stage, genre, store evidence and link-health coverage. |
| Quick choices | Current published contributions | Multiple answers allowed. Divide by contribution count, not site visits or all games. |
| Anonymous usage | Saved actions by UTC day | Repeated actions count. No unique-person, retention or funnel claim is possible. |

Shares use **all observed projects in the period**, including unknown classifications. Missingness is displayed separately. No source posts in a month means zero observed projects; it does not prove a complete empty archive. Source excerpts may omit model or art mentions. A missing explicit model version remains unspecified. Keywords can describe a comparison or negation, so every match includes an inspectable excerpt and original Reddit URL. No image or language model silently assigns art styles.

Full-text evidence is drawn from `source_evidence` where the source remains available. Otherwise the title and public excerpt are used. Removed source text is not classified. Later source edits can create hindsight bias because the chart retains the original post date. Current catalogue labels preserve administrator overrides. A demo is counted as such only when store evidence says demo; a playable entry is not necessarily a demo or a finished release.

## Model releases

`js/insight-evidence.js` contains a curated calendar with dates linked to official OpenAI, Anthropic and Google announcements. Experimental availability is labeled. This is not a complete release calendar. Never derive a release date from an unverified Reddit mention, version number or current marketing page.

The comparison reports matched projects, total observed projects, unknowns, full-text coverage, explicit model mentions and co-mentions in the same project/window. Percentage-point differences are descriptive. Samples below 20 projects on either side and incomplete after windows are flagged. Multiple releases, community growth, creator selection, duplicate grouping and unequal evidence coverage confound comparisons. There are no significance claims, causal estimates or predictions in this pilot.

## Collection and participation outcomes

Useful measures now available include which game types arrive, which stores are linked, how often working-build evidence is missing, what quick-feedback options are chosen, project opens, outbound game-link clicks, favorites, ratings and saved reviews. Counts of clicks do not establish that anyone played a game. Research response metrics remain separated by questionnaire revision in the existing admin view.

Better next evidence comes from the existing bounded Steam/itch queue and source-text hydration. Before a public analytical release, audit the largest unknown groups, review a sample of keyword matches in each period, and document archive selection gaps. A public edition should publish the catalogue aggregates and linked public evidence only, with a dated methodology and coverage summary. Keep private questionnaire answers, account data, editorial drafts and operational usage controls behind the server admin check.

## Privacy and operations

The analytics client uses an in-memory queue and no stable visitor identifier. It respects DNT, GPC and a local opt-out on About. Allowed events exclude written text, searches, full URLs, referrers and account IDs. Independent random delivery UUIDs prevent retries from inflating totals, with 24-hour receipt expiry. Hourly rotating network HMACs limit spam. Daily totals retain 180 UTC dates; an hourly job removes expired totals and receipts. CSV exports neutralize spreadsheet formulas.

`/admin/insights` is paginated, has `no-store` responses and requires server-verified admin access. The UI rejects duplicate, incomplete or changing catalogue pagination. `/admin/usage` is separately authorized. No admin response or private database export belongs in the Pages artifact.

Google Search Console clicks, impressions and queries are a separate search dataset. Property ownership and submission are not completed merely by deploying pages and a sitemap.
