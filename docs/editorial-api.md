# Editorial tools and store metadata

This extends [the public feedback contract](public-feedback-api.md). The collection stays public. Optional admins use `admin.html`; `about.html` holds the index explanation. Public project actions appear above the preview and conversation.

## Admin identity

Apply `worker/migrations/0004_editorial_tools.sql` before deploying its Worker. The migration adds `admins`, `change_requests`, `preview_overrides`, `steam_cache`, and a nullable source-media checkpoint. It seeds **luciano.adonis.villarroel@gmail.com** as the default owner with no bound account yet. It does not create a Clerk user or send email.

The Worker first verifies a normal Clerk session using the existing pinned issuer/JWKS and allowed origin. It then retrieves that subject from `https://api.clerk.com/v1/users/:id` using a **server-only `CLERK_SECRET_KEY`**. Only the user's verified **primary** email can match an enabled admin invitation. Client-supplied email, browser profile data, and user-editable metadata grant no access. Locked/banned accounts are rejected. An invitation is atomically bound to its first verified Clerk subject; recreating an account with the same email does not inherit that role. Every admin request rechecks Clerk and the enabled role. Owner-only member management cannot alter the default owner.

Production activation requires both the Clerk secret and `playtrace.neorgon.com` in the existing Clerk **Allowed Subdomains** configuration. Preserve the existing hosts. Use a Cloudflare secret binding or `wrangler secret put CLERK_SECRET_KEY`, entering the value interactively; never place it in browser config, source, a command argument, or a chat message. Missing setup reports `capabilities.admin:false` and keeps the admin workspace closed. The public account entry point is enabled after the live domain connection is checked. The admin page initializes auth independently when the server advertises admin capability.

## Routes

All paths below follow `/api/v1`. Admin routes require a verified Clerk bearer session; operator routes retain their separate credential. Reads and mutations use `Cache-Control: no-store` except the catalogue's existing sixty-second cache.

| Method and route | Body / response |
| --- | --- |
| `POST /games/:id/change-requests` | Guest `X-Feedback-Key`; `{kind,body,suggestedUrl}`. Kinds: image, details, media, removal, other. Body 12–1500 characters; optional HTTPS URL or null. Returns `{id,status:'open'}` with 201. |
| `GET /admin/me` | `{email,role}` after server verification. |
| `GET /admin/requests?status=open&cursor=…` | Up to 50 private requests, newest first, and `nextCursor`. Supports open/resolved/dismissed. No reporter hashes are exposed. |
| `PUT /admin/requests/:id` | `{status,note}`; private note up to 1200 characters. Records reviewer and review time. |
| `GET /admin/members` | Owner only; email, role, enabled and creation date. |
| `PUT /admin/members` | Owner only; `{email,enabled}` grants/restores/revokes admin access. No email is sent. |
| `GET /admin/games/:id` | Effective game, original `sourcePreview` and `sourceDetails`, image/detail override dates, `detailsRevision`, and the shared `categories` list. |
| `POST /admin/categories` | Verified admin; `{label}` (1–48 characters). Creates a shared category or returns an existing case-insensitive match. Returns `{category:{id,label},created,categories}`. Up to 200 categories; standard categories remain available. |
| `PUT /admin/games/:id/details` | `{mode:"edit", revision, details}` or `{mode:"reset", revision}`. Details contain title, summary, category, stage, projectUrl, repositoryUrl, tags, and platforms. `repositoryUrl` is a separate GitHub, GitLab, or Codeberg repository link; older clients may omit it to retain the existing value. A stale revision returns 409; removed games return 404. |
| `PUT /admin/games/:id/image` | See image modes below. Returns the updated editor record. |
| `POST /admin/games/:id/media` | `{}`. Checks up to ten previously unchecked source posts for that game. |
| `GET /games/:id/store` | `{gameId,steam}`. Refreshes expired metadata for the project's exact Steam app link. Null when unlinked or unconfirmed. |
| `POST /admin/enrich` | Operator only, `{}`. At most six due Steam lookups, followed by one bounded source-media lookup. |

Change requests remain private even though submitting one requires no login. Requests allow five per browser edit key and twenty per network per hour. Only keyed hashes are stored, not raw addresses or edit keys. A removal atomically scrubs requests and overrides along with the project's other records before media cleanup. Request submission guards the active game at SQL write time, so a concurrent removal cannot retain a new request.

## Image editing

External mode: `{mode:'external',url,alt,sourcePostId}`. Only HTTPS URLs on exact `PREVIEW_ALLOWED_HOSTS` are accepted. The chosen original post must belong to the project. This links the image at its host without proxying arbitrary network destinations.

Upload mode: `{mode:'upload',dataUrl,alt,sourcePostId,permission:true}`. PNG/JPEG/WebP only, MIME/signature checked, decoded size at most 5 MiB, request size at most 7 MiB. The UI resizes uploads and captured frames to at most 1600 pixels before submission. The server records the verified reviewer and their permission attestation. Custom previews live in a separate override table, so source imports cannot overwrite them. Stored bytes use private R2; the public media route checks R2 publication and withdrawal records for every read, independent of D1 availability. Upload, reset, replacement and consolidation maintain those records. Superseded stored assets stop being served and are retained for cleanup on project removal.

Reset mode: `{mode:'reset'}` restores the automatic preview: existing consented source image, confirmed Steam artwork if available, then original source preview. Reset removes the override, not the historical source records.

The frame picker samples four positions past the beginning and compares image brightness/variation. It supports manual scrubbing and capture. It does not play clips across every catalogue card. Cross-origin canvas access depends on the media host allowing it. Blocked, unseekable or unavailable video has a source-post/upload fallback. Dark samples are reported honestly instead of presented as a successful fix.

Append `shared.akamai.steamstatic.com,cdn.akamai.steamstatic.com` to the existing preview allowlist, preserving its Reddit, Fastly and Cloudflare hosts. The HTML CSP pins the exact Steam image and Reddit media hosts used by these features.

## Steam and secondary media

Only exact HTTPS `store.steampowered.com/app/:id` project links are looked up, without guessing an app from a title. The Worker uses the Storefront `appdetails` endpoint with `cc=us`, validates `success`, `steam_appid`, and `type:'game'` or `type:'demo'`, and labels a game released only when `release_date.coming_soon === false`. Prices require integer cents and `currency:'USD'`; no currency conversion is implied. Explicit free games are labelled free. Coming-soon listings do not display a purchase price. A badge confirms the linked store app, not the maker's identity.

Successful/negative lookups are cached for 24 hours; transient failures retry after an hour and preserve the original successful check date. The UI hides prices older than 36 hours. The US region and check date appear in project details. Steam availability and regional prices can change. There is no API key in the browser and no dependency on another site's proxy deployment.

Source posts can now include up to six validated image, GIF, or video asset URLs. New ingestion extracts these directly. Older posts are hydrated in batches of ten using Arctic Shift's ID lookup, with one request and no immediate retry. A shared ingestion lease avoids concurrent archive passes. A separate hourly `5 * * * *` maintenance invocation refreshes up to six due Steam apps, then hydrates media only if both recent and historical checkpoints are complete. Archive collection stays on `35 * * * *`. Each complete handler and the operator enrichment route remain below 50 D1 statements; the regression fixture includes six cold app caches and ten unchecked media posts. Setting `INGESTION_ENABLED=false` also stops scheduled media hydration, even if old checkpoints are complete. Steam maintenance remains independent of archive throttling and this collector switch. Reimporting a seed without asset fields preserves media already found in the source records. Visitors explicitly choose playback; source links remain available if a host blocks embedding or a Reddit clip lacks audio.

## Release and validation

Publish the compatible static frontend and apply migration 0004 before deploying the new Worker. Configure both `35 * * * *` for archive collection and `5 * * * *` for bounded maintenance. Existing guest endpoints and history cursors keep their contracts. Keep account features gated until live Clerk setup is verified. Public change requests, Steam metadata and source media can operate while admin sign-in is waiting on that setup.

Run Node tests, schema forward/rollback checks, HTML shell/nesting checks, and disposable browser/runtime flows. Do not post synthetic feedback or requests to production. The author browser harness has 27 checks and covers public request → private inbox → resolution, image replacement/reset, real video frame selection/upload, member grant/revoke, sign-out clearing, mobile layout and accessibility. Sixteen runtime checks exercise the bundled production entrypoint in actual workerd with local D1/R2 and test-only fixed upstream fixtures, including real RSA verification and the Clerk server profile boundary. Node suites have 91 passing tests; schema forward/rollback suites have 10. Live Clerk sign-in remains unverified pending account configuration.

Prefer a forward fix. Once posts have `assets`, older strict Worker validators will reject those records. A code rollback must retain the compatible source validator, media serving rules, and additive tables. The destructive SQL rollback is for disposable test databases or an explicitly authorized data rollback.

References: [Clerk backend users](https://clerk.com/docs/reference/backend/types/backend-user), [Steam Storefront endpoint](https://store.steampowered.com/api/appdetails?appids=620&cc=us&filters=basic,price_overview,release_date), [Arctic Shift ID lookup](https://github.com/ArthurHeitmann/arctic_shift/blob/master/api/README.md#id-lookup), [cross-origin canvas restrictions](https://developer.mozilla.org/en-US/docs/Web/HTML/How_to/CORS_enabled_image).

## Project details

Migration `0007_project_details.sql` adds separate editorial overrides. Importers continue to match the original creator and project URL, while the public catalogue, store lookup and Steam maintenance use the effective edited URL. Reset clears only the details override and advances the revision, retaining stale-tab protection. Removing a game erases its overrides. Names, descriptions, genre, stage, devices and tags are editable; source authors, post titles, timestamps and IDs remain unchanged. The UI preserves unsaved details when saving an image, exposes a reload action after a conflict, and warns before leaving unsaved details.

## Categories, names and project links

Migration `0008_game_categories.sql` seeds the core category registry, including Clicker. Every catalogue page and editor response includes `categories:[{id,label}]`. Admins can choose “Add category…” inside the dropdown, name it, and then save details to assign it. Creating the category preserves the rest of the draft; saved categories are immediately reusable on other projects and supported by public search, badges and shared filters. Imports cannot create unknown categories. The image-permission checkbox starts checked; an explicit uncheck blocks uploads both in the UI and at the API.

New source imports resolve names conservatively from explicit source names and game URL slugs. Steam’s existing scheduled cache supplies authoritative names by app ID, including demos and URLs with no slug. Public names respect editorial overrides and previously reviewed titles. The original Reddit headline is displayed beneath a distinct game name and retained unchanged in history. Generated “Source post by…” summaries no longer duplicate the card headline.

Playable GitHub Pages addresses remain website destinations, while GitHub/GitLab/Codeberg URLs identify code repositories. If both appear in a post, the playable destination takes priority and the repository appears as a separate Source code shortcut. Neither a playable website nor a store URL proves a completed commercial release.

`scripts/review-game-names.mjs` gathers bounded public-page/Steam metadata and produces a catalogue-wide review JSON and compare-before-update SQL; it does not mutate production. Website metadata must agree with a specific URL or an explicit source name. Opaque hosting IDs, generic paths, error pages and ambiguous titles stay unresolved. Apply only reviewed changes. Field-scoped SQL retains history, contributions and independent admin overrides and skips fields changed since the export.
