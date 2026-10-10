# Playtrace Worker

Native ES modules serve the v1 API with D1, optional private R2 previews, Clerk sessions, and bounded archive ingestion. No frontend build or server package dependency is required. The frozen contract lives in the workspace at `docs/delivery/playtrace/CONTRACTS.md`.

Run from the project root with Node 22.13+ (the tests use built-in SQLite):

```sh
node --test worker/tests/*.test.mjs
python3 worker/tests/schema.test.py
```

The request tests use actual RSA signatures and SQLite transactions. Test-only fixtures inject network responses and time through `createWorker()`. The production entrypoint has no environment authentication bypass. These tests do not prove real Clerk sign-in, real user willingness to pay, or live Cron execution.

## Provisioning and enablement

1. Provision D1 and apply `worker/migrations/0001_initial.sql`; bind it as `DB`. `wrangler.jsonc` contains the operator-provisioned database identifier. The rollback is for an empty test database only.
2. Set `ALLOWED_ORIGINS` to exact site origins and `CLERK_ISSUER` to the fixed Clerk issuer origin. Session JWTs use the default session token, RS256, and its pinned `/.well-known/jwks.json`; no custom audience or Convex template is required.
3. Set `RATE_LIMIT_SECRET` and `OPERATOR_TOKEN` as independent Worker secrets, each generated from at least 32 random bytes. Use 64 hex characters or base64url encoding. Do not put either secret in the site, URLs, committed files, command history, or logs. `.dev.vars*` and `.env*` files are ignored.
4. Choose `SIGNAL_PROTECTION` on the server. The provisioned baseline is `account-rate-limit`, requiring signed accounts, one current signal per account/game, and account plus daily-HMAC-network rate limits. The default when absent is `turnstile`, which requires `TURNSTILE_SECRET_KEY`, `TURNSTILE_HOSTNAME`, and a corresponding browser site key. Unknown values disable signals. The browser reads the mode from `/status`; client input cannot select it. Never deploy a Turnstile testing secret.
5. Seed using operator-authenticated `POST /api/v1/admin/catalog` with the complete validated `data/catalog.json`. Keep the bearer credential private. Import is one six-statement D1 transaction, preserves existing published timeline entries, and cannot overwrite tombstones or invent R2 consent.
6. Check `/status`, `/catalog`, a real allowed-origin Clerk account request, and signed-out failures. Empty/unconfigured services return 503. The fleet production Clerk instance requires its allowed live domain for a real login check.
7. Set `INGESTION_ENABLED=true` for manual operator ingestion. Invoke `POST /api/v1/admin/ingest` repeatedly until the frozen initial seven-day window completes. Each call requests at most three 100-row pages, waits 600ms between successful pages, and performs at most two bounded retries per failed request. Partial runs save `resumeBefore`, `resumeAfter`, and `targetCoverageThrough`; they do not claim new complete coverage. Normal runs overlap the last completed coverage by 48 hours.
8. Only after one verified completed run, configure hourly Cron, for example `15 * * * *`, so partial windows drain promptly. The checked-in Cron list is initially empty. `scheduled()` uses the same ingestion code. Daily presentation does not imply each run has complete archive coverage. Cron and authenticated writes delete expired rate rows; keep hourly maintenance enabled when accepting signals so inactive buckets are physically pruned within 48 hours.

The full 300-candidate ingestion test uses 18 SQL statements, below the conservative 50-query free-plan limit, with JSON-bound bulk writes. Public catalogues are capped at 2,000 games. Additional new candidates remain pending at that cap; add pagination/retention before approaching it. Source IDs remain idempotent. The importer publishes clear game showcases with `reviewStatus:source-described`, conservative source-evidenced taxonomy and stage, and original titles. Ambiguous candidates and older-than-identity matches stay in `source_posts` with `status='pending'`. Review and publication use a normalized C1 operator import, not raw archive copying.

## Consent previews and removal

Bind the private bucket as `PREVIEWS` and set exact `PREVIEW_ALLOWED_HOSTS`. The operator-only preview endpoint requires a creator-consent evidence URL and note. It accepts HTTPS PNG/JPEG/WebP up to 5 MiB, with matching MIME/signature, streaming limits, no redirects, and no IP-literal/private-host selection. Consent is audit data and never appears in the catalogue. Videos remain source links.

Uploaded previews use `/api/v1/media/:assetId`, validated against the active game and current asset on every read, with explicit MIME, `nosniff`, and `no-store`. Public bucket URLs are not used, so the Worker can suppress access immediately after removal.

Removal first commits the tombstone, hides/scrubs the game, and deletes source identities, follows and prices. A per-game media lease prevents cleanup from racing an upload. Storage failure or an active upload returns 503 while the game stays unavailable; retry the same removal until it succeeds. Object keys survive failed cleanup. Tombstones survive game deletion and prevent reimport under a different game ID.

After a removal, regenerate `data/catalog.json` from the live catalogue and publish it. The static fallback is a separately distributed snapshot and cannot be erased by a Worker database transaction. External source media may disappear independently. A single account is not proof of a unique human; configure deployment edge limits for public endpoints.

Cloudflare and Clerk references: [D1 transactions](https://developers.cloudflare.com/d1/worker-api/d1-database/#batch), [D1 limits](https://developers.cloudflare.com/d1/platform/limits/), [Clerk manual verification](https://clerk.com/docs/guides/sessions/manual-jwt-verification), [Turnstile server validation](https://developers.cloudflare.com/turnstile/get-started/server-side-validation/).
