# Screenshot recognition game

The API base is `/api/v1`. Five screenshots are selected without replacement from 20 curated projects with available builds. Some builds are demos or works in progress. `worker/src/quiz-pool.mjs` contains the names, destinations, original-host screenshots and descriptive alt text; `data/quiz-review.json` records the page evidence. Long Reddit headlines are not used as game names. Only published, nonremoved games in the pool are available.

## Routes

| Route | Method | Contract |
| --- | --- | --- |
| `/quiz` | GET | `{poolSize, roundSize:5, available}`; fewer than five available games disables play |
| `/quiz/rounds` | POST | `X-Feedback-Key` and `{id}` with a client-generated lowercase UUID v4; returns 201 with `{id, expiresAt, poolSize, questions}` |
| `/quiz/rounds/:id` | PUT | Same key and `{answers}` containing five ordered answers; returns saved results |
| `/quiz/rounds/mine` | DELETE | Same key, no body; deletes this browser's rounds and answers, returns `{deleted:true}` |
| `/admin/quiz-metrics` | GET | Verified editorial admin session; aggregate rounds and chosen-name counts |

Each public question contains `index`, `image`, `alt`, `trimTop` (a 0–0.15 display fraction), and four unique `choices: [{id,title}]`. The optional top trim hides small in-game title headers in two clues using CSS; the original hosted image stays untouched. The server persists the question's game and offered choices; it does not return a correct-answer field before completion. Answer bodies contain exactly `{index,choiceId,skippedReason}`. A choice must have been offered for that question and has a null skip reason. A skipped answer has a null choice and reason `skip` or `image-unavailable`. Partial rounds, duplicate indices, arbitrary choices, extra fields and client-provided scores are rejected.

The completion response is `{id,score,answered,saved:true,results}`. Each result contains its index, real game ID/title/link, chosen title or null, correctness, skip reason, and aggregate recognition `{attempts,correct}`. Skips are excluded from attempts and scores. Replays count as new rounds; these metrics do not represent unique people, game quality, playtesting, or reviews. Public aggregate counts appear with the reveal. The admin endpoint additionally shows the distribution of names guessed and total skips for each current pool game. Neither surface exposes browser hashes.

## Persistence, retries and lifecycle

Start requests with the same UUID and owner return the same persisted questions. A UUID belonging to another key returns 404. A completed round cannot be restarted. Incomplete rounds expire after 24 hours and are purged on subsequent starts. Changing the pool version or removing a referenced game expires affected rounds with 410.

Completion is atomic and immutable. The Worker rechecks the publication state of every referenced game inside the write, computes correctness itself, and inserts each answer once. Identical retries return results without increasing counts; changed answers after completion return 409. A removal that wins the completion race cannot acquire new metrics. Removing a project also deletes answer rows where that project was the clue or chosen answer. Guest deletion cascades from rounds to answers and updates aggregates immediately.

## Guest access and limits

`DB` and a strong `RATE_LIMIT_SECRET` enable `capabilities.quiz`. Guest play does not require Clerk or Turnstile. The browser reuses its 256-bit local edit key as `X-Feedback-Key`, never in a URL, with omitted credentials. The Worker derives a quiz-specific HMAC from the feedback-domain HMAC, so the persisted quiz and public-feedback identifiers differ. Raw keys and IP addresses are not stored. Clearing local browser storage loses removal access; operator assistance remains available. Rotating the secret changes identities and requires the same data-access care as feedback.

Starts allow ten per key and sixty per daily-HMAC network bucket per hour, with a separate namespace from feedback saves. Starts/completions also use the 30-per-hour quiz subject quota. Idempotent retries do not charge another mutation. Deletion has its own 60-per-hour privacy quota. Responses are `no-store`; configured-origin CORS permits `X-Feedback-Key`. A failed image can be retried or skipped without being counted as a wrong answer.

## Release and verification

Apply pending migrations through `0006_name_game.sql`, deploy the Worker, verify `/quiz` and `/status`, then publish the frontend. The new image hosts are narrowly included in the site's image CSP. Images stay at their original hosts and are not uploaded or synthesized.

Regression tests use disposable SQLite and real signed test sessions. Actual workerd/D1 tests and browser tests cover saves, guesses, skips, image failures, retry after a committed response is lost, removal, authenticated metrics and mobile accessibility. Do not invent activity by playing or posting test feedback on production. Production checks should read availability, the catalogue and feedback, and inspect the interface without starting a round.
