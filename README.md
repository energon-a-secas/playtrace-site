<div align="center">

# Playtrace

Discover games, explore their history, and help the next version take shape

[![Live][badge-site]][url-site]
[![HTML5][badge-html]][url-html]
[![CSS3][badge-css]][url-css]
[![JavaScript][badge-js]][url-js]
[![Claude Code][badge-claude]][url-claude]
[![License][badge-license]](LICENSE)

[badge-site]:    https://img.shields.io/badge/live_site-0063e5?style=for-the-badge&logo=googlechrome&logoColor=white
[badge-html]:    https://img.shields.io/badge/HTML5-E34F26?style=for-the-badge&logo=html5&logoColor=white
[badge-css]:     https://img.shields.io/badge/CSS3-1572B6?style=for-the-badge&logo=css3&logoColor=white
[badge-js]:      https://img.shields.io/badge/JavaScript-F7DF1E?style=for-the-badge&logo=javascript&logoColor=black
[badge-claude]:  https://img.shields.io/badge/Claude_Code-CC785C?style=for-the-badge&logo=anthropic&logoColor=white
[badge-license]: https://img.shields.io/badge/license-MIT-404040?style=for-the-badge

[url-site]:   https://playtrace.neorgon.com/
[url-html]:   #
[url-css]:    #
[url-js]:     #
[url-claude]: https://claude.ai/code

</div>

---

## Overview

Playtrace collects games shared on r/aigamedev so players can discover a project, inspect its source history, and leave useful public feedback. An optional “Your ideal price” field lets visitors share a pricing suggestion. Reading and contributing require no account.

**Live:** [playtrace.neorgon.com](https://playtrace.neorgon.com/) · **API:** [service status](https://playtrace-api.neorgon.workers.dev/api/v1/status)

Public feedback uses a random browser edit key so visitors can update or remove their contribution. Favorites are an optional account feature. Star a project to save it to your private Favorites page. Existing private account price responses stay private. See [account activation](#account-activation).

## Features

- **Focused navigation** -- Home showcases five weekly picks; Browse includes a star filter for local/account favorites. Quick reviews and About have dedicated pages. The quiz remains available but is not promoted in navigation. Existing shared project/filter links still work.
- **Source-linked discovery** -- Real previews, genre and development-stage filters, a searchable Maker dropdown, search, grid/list layouts, and shareable project links.
- **Project platforms** -- Filter by itch.io, Steam, mobile stores, game portals, code repositories, other websites, or projects without a link. Cards and details identify the destination automatically from the project URL. Hosting, supported devices, and development stage remain separate facts.
- **Project histories** -- Older and newer posts join an existing game only when author and canonical project link match. Existing project links stay stable when an earlier source is found. Closely matching same-author reposts within 48 hours retain the newest entry, with old links redirected. Sharing an author alone never merges games.
- **Historical collection** -- A resumable pass starts at the community's creation on December 11, 2022. An independent recent pass keeps new updates fresh. Newest updates appear first; the interface reports historical progress without claiming the archive is complete.
- **A growing catalogue** -- Cursor pages replace the old 2,000-project public limit. The first page appears promptly; further pages expand search and filters with visible loaded counts. Cards render in groups of 60.
- **Public feedback** -- One editable contribution per browser and game, with a note, optional display name, and optional ideal price in USD from $0 to $100. Notes and prices are explicitly public. The median includes only these public suggestions.
- **Favorites and ratings** -- A top star saves a game to a signed-in visitor’s private Favorites page. Separate one-to-five-star ratings need no login and can be updated or removed from the same browser.
- **Reusable playtests** -- One question per step, up to five, with single choice, multiple choice and optional written feedback. Admins can create project-specific studies, view versioned metrics and embed the form elsewhere. Research responses are private, separate from public comments.
- **Visitor controls** -- Browser and network limits reduce spam. Contributions have report links and operator moderation. Clearing browser storage loses editing access; the correction link remains available for help. A browser key does not prove a unique person.
- **Private account data** -- Existing account prices, their thresholded aggregates, follows, and account-data deletion remain separate from public feedback. Guest contributions never reveal or import old private responses.
- **Editorial tools** -- A private change-request inbox, verified admin roles with the requested default owner, persistent project details and image edits, and a video-frame picker. See [activation and endpoint details](docs/editorial-api.md).
- **Review queue** -- Persistent link checks, Steam/itch enrichment, shared source links, and Jev-assisted reviews of recent Reddit comments or questionnaire responses. Cited Reddit reviews require explicit admin publication. See [the discovery and research runbook](docs/discovery-research-api.md).
- **Store and media context** -- Branded game/Reddit buttons, confirmed Steam app badges, cached US prices, Steam/itch artwork, source videos/GIFs, shared links beside project history, and an original-post fallback. Admins can edit thumbnails directly from cards or project notes.
- **Name that game** -- A highlighted header button opens [a dedicated five-screenshot quiz](https://playtrace.neorgon.com/quiz.html). Source-hosted images use smaller variants when available and preload the next clue. Anonymous results contribute recognition counts and remain removable from the same browser. See [the quiz API and delivery notes](docs/name-game-api.md).
- **Managed previews** -- R2 can store bounded, validated images with a recorded creator permission. Initial previews remain at their original hosts. Removal hides a game immediately and cleans up its stored data and media.

The bundled snapshot is dated local exploration data; the live catalogue grows separately. No votes, demand figures, or user accounts are seeded.

## Running locally

There is no frontend build step. From this directory:

```bash
make serve
```

Open `http://localhost:8900`. `js/config.js` pins the production API address, whose CORS policy does not allow localhost. To explore the bundled snapshot, set `apiBase` to an empty string in your local checkout. Guest feedback and account features will then show as unavailable. Restore the pinned value before publishing. A configured API failure never switches silently to the bundled snapshot. For interactive local feedback, use the disposable Worker setup in [the runbook](worker/README.md#local-feedback-preview).

The Worker uses Cloudflare D1 and R2. See [the Worker configuration](worker/wrangler.jsonc), [the database migrations](worker/migrations), and [the API modules](worker/src/index.mjs). Operator credentials belong in Worker secrets, never in `js/config.js`, a commit, or browser storage. The visitor's random edit key is intentionally browser-local. Local server secrets belong in an ignored `worker/.dev.vars` file. Authenticated account testing requires an HTTPS origin permitted by both Clerk and `ALLOWED_ORIGINS`.

## Verification

```bash
node --test tests/*.test.mjs
node --test worker/tests/*.test.mjs
python3 worker/tests/schema.test.py
```

Client tests cover source validation, shared filters, progressive pagination, incomplete loads, guest posting and removal, storage failure, escaping, and stale responses. Backend tests use synthetic signed sessions, a SQLite-backed D1 adapter, and controlled archive/media responses. Use a Node runtime with `node:sqlite`. They cover guest ownership, moderation, rate limits, privacy separation, collections over 2,000 projects, resumable historical/recent collection, stable project identity, atomic imports, removal, and media validation. They do not manufacture activity in the live database.

## Architecture

![Playtrace architecture](docs/architecture.svg)

[Editable diagram](docs/architecture.mmd)

| Area | Files | Responsibility |
| --- | --- | --- |
| Browser shell | `index.html`, `browse.html`, `profile.html`, `css/campaign.css` | Focused landing page, catalogue, favorites and project dialogs |
| Research | `research.html`, `js/question-flow.js`, `worker/src/research.mjs` | Reusable guest playtests, versioned forms and private metrics |
| Editorial queue | `js/admin-campaign.js`, `worker/src/jobs.mjs`, `worker/src/insights.mjs` | URL/store checks, source references and cited review drafts |
| Client behavior | `js/state.js`, `js/render.js`, `js/events.js` | Validated collection state, filtering, navigation, rendering |
| Feedback client | `js/feedback.js`, `js/api.js` | Public notes, optional ideal prices, browser edit keys and guest controls |
| Account client | `js/accounts.js`, `js/challenge.js` | Optional authenticated follows and legacy private data controls |
| Collection | `worker/src/archive.mjs`, `worker/src/ingestion.mjs` | Archive normalization, conservative categorization, cursors and scheduling |
| Trust and storage | `worker/src/feedback.mjs`, `worker/src/auth.mjs`, `worker/src/limits.mjs`, `worker/src/store.mjs`, `worker/src/media.mjs` | Public contributions, identity, quotas, D1 records and consented R2 previews |
| Initial data | `data/catalog.json` | Dated, reviewed source snapshot for local exploration and initial import |

The interface uses pale slate, navy type, and warm amber actions, with system dark preference support. Archivo headings and Source Sans 3 body text are self-hosted with their font licenses. `css/report.css` owns the visual layer; vendored Neorgon kits provide shared header, footer, auth, persistence, and navigation behavior.

## Collection and trust boundaries

Arctic Shift is a third-party archive and may be delayed or incomplete. Original Reddit posts remain the primary source. A listed author, game stage, or AI-use claim is not independently verified. Clear showcases can publish automatically; ambiguous candidates require operator review. Earlier posts can extend a matching timeline while its original source anchor and project ID remain unchanged. “Historical” means checking available archived posts, not claiming every project or deleted post can be recovered. Reddit discussion remains linked at its source; it is not copied into the visitor feedback feed.

Guest writes require a 256-bit browser edit key and a server HMAC secret, with independent browser/network quotas. The server stores only an HMAC of the edit key. Public responses contain the contributor's chosen name, note, and optional price; they never include keys, network identifiers, or private account prices. The separate legacy account API uses server-verified sessions and its own configured protection mode.

Catalogue pages contain up to 200 projects. There is no 2,000-project public collection cap; individual imports remain bounded to 2,000 records and each game's timeline to 1,000 posts. Excess or ambiguous timeline candidates remain pending for review. Public preview storage is not an open upload endpoint. Endpoint details and rollback constraints are in [the API contract](docs/public-feedback-api.md).

## Account activation

The production Clerk domain connection and encrypted Worker secret are configured. Open [the admin desk](https://playtrace.neorgon.com/admin.html) and sign in with the verified primary owner email. Real owner sign-in binds that account on its first successful request. No Clerk secret is stored in this checkout.

The live sign-in form is verified and `accountsReady: true` is published in `js/config.js`. Admin edits, account authorization and persistence are covered with signed fixture sessions; the owner's real Google account has not been used in automated checks. Guest notes and ideal prices remain independent of sign-in. The browser flag controls availability only; the Worker always verifies sessions for private endpoints.

## Possible next steps

- A creator claim flow that proves control through the original Reddit account.
- A private daily digest of followed projects with a new demo or release.
- A prediction game for upcoming releases, with scores kept separate from willingness-to-pay responses.

---

<div align="center">
<sub>Part of <a href="https://neorgon.com/">Neorgon</a></sub>
</div>


### Search pages and admin insights

The Pages workflow in `.github/workflows/pages.yml` builds `_site/` from a complete live catalogue hourly, on pushes to main and on manual dispatch. It publishes permanent `/games/<id>/` pages, a crawlable directory and `sitemap.xml`. Project metadata and JSON-LD are present without JavaScript. The artifact allowlist excludes Worker code, private files and editorial analysis documents. An incomplete fetch fails without replacing the last deployment. The Pages repository must use GitHub Actions as its build source.

For a local snapshot build: `node scripts/build-site.mjs --catalog data/public-catalog.json`. For current production reads: `node scripts/build-site.mjs`. `_site/` is generated and ignored. Search Console ownership and sitemap submission require the property owner; generating a sitemap does not guarantee indexing.

Admin desk → Insights (`admin.html#insights`) provides catalogue trends, model-release comparisons, source inspection, CSV export, community choices and anonymous usage counts. See [the dashboard methodology](docs/dashboard-methodology.md). The pilot endpoints require verified admin authorization; do not publish their response files in Pages. Apply migration `0011_usage_metrics.sql` before deploying the Worker. Existing comments, ratings, favorites and editorial overrides are unaffected by this additive migration.
