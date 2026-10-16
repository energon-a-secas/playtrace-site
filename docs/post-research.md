# Source-post research

The operator tool asks structured questions of existing public Reddit showcases. It does not publish labels, change project details, contact makers or create visitor contributions. Reddit remains the main feedback source.

```sh
node scripts/analyze-posts.mjs \
  --database /private/path/production-export.sql \
  --output /private/path/post-study \
  --classify --env /private/path/credentials.env \
  --days 60 --sample 120 --max-requests 24 \
  --timezone America/Santiago
```

Omit `--classify` to recalculate the report from cached labels without calling Jev. Output must be outside the repository. The tool writes a standalone `report.html`, aggregate `report.json`, a private `review.json` with source links, and resumable `classifications.json`. Directories use mode 0700 and files 0600. No database writes or website publication occur.

## Questions and boundaries

Six questions cover the post’s purpose, specificity of its feedback request, concrete development detail, wording, clarity of build access and stated limitations. Each has an unknown answer. The versioned rubric lives in `scripts/post-research-core.mjs`; a rubric change requires a version bump and a separate checkpoint directory.

The [Jev API](https://docs.typesafe.ai/api) receives at most five public posts and 30 typed questions per request. State contains only bounded title/body text. Common URLs, account mentions, email addresses, telephone numbers and credential patterns are redacted. Free text may still identify a project or person: this is minimization, not guaranteed anonymization. Scores, author fields, publication times, account data and private questionnaire answers are not sent. Classification is blind to the outcome measure. Text is treated as quoted evidence, never instructions.

Model answers below 0.8 remain unknown. Probabilities are not validated accuracy estimates. Malformed answers reject the whole batch. Changed text invalidates its cached result. One run makes at most 24 requests, saves each completed batch and stops on an error. A provider cooldown is retained across runs; there is no automatic retry loop.

Sampling takes the latest available-text post per project, orders by a stable content hash within each week, then rotates across weeks. This provides coverage without selecting popular posts, but is not a representative prevalence sample. Label counts must retain their sample denominator and unknown count. Review the source-linked private output before using an aggregate finding.

## Timing and engagement

The analysis uses original publication time and the score’s archive observation time. A later check date does not renew an old score. Reddit net score is not the number of upvotes, views, conversions or eventual engagement.

The exploratory timing cohort requires a score observed 7–14 days after publication, retains one eligible post per project, and labels the reporting timezone. Six-hour weekday cells suppress score comparisons below 20 projects, five makers or three calendar months. These thresholds are disclosure and stability gates, not significance tests. No automatic best-time recommendation is generated, even when a cell passes them.

Before making a posting-time recommendation, collect comparable observations, separate calendar periods and content types, assess maker/project clustering, predefine comparisons and test findings on a later holdout period. Avoid selecting a winner from many tiny cells. Models, art styles, genre, build access and community growth can confound associations. Missing records and unobserved impressions prevent a general claim about successful posts.

The first run on October 16, 2026 UTC covered 1,475 available source posts across 1,367 projects. Of these, 1,422 had scores observed within an hour; the median observation age was 22 seconds. No project had a score observed in the comparable 7–14-day window. The current data therefore supports **no best posting time**.

The pilot classified 120 posts from a 743-post, 60-day window in 24 requests. Preliminary labels included 26 specific feedback requests, 49 clear build-access descriptions and 47 unclear access descriptions. These are private draft counts, not population estimates or evidence of higher engagement. Wording remained unknown for 72 posts, demonstrating that this broad label needs further rubric evaluation. Twelve spaced sample records were inspected for interpretation issues; this is a diagnostic check, not a measured accuracy study. No per-author attitude profile or ranking is produced.

## Next useful studies

- Review clarity labels, then offer editors source-linked questions about missing build requirements, controls or the exact feedback sought.
- Compare specific feedback requests with the number and subjects of subsequent non-creator replies, only after establishing complete, age-matched comment coverage.
- Relate explicit first-look reactions to separately reported play experiences, keeping unmatched people and sources separate.
- Compare reported tool/model roles and constraints over time using actual source dates; evaluate association without attributing causality to a model launch.
- Publish reviewed aggregate findings with denominators and limitations. Keep source-level classifications and sensitive context private.

## Navigation

The main action is **Submit feedback**, with a game picker leading to a public note on that project. Optional questionnaires retain their existing private storage and consent. Public-note access remains available when no questionnaire is open. Home centers **Browse the collection** and **Insights** below the artwork.

GitHub Pages now serves `/browse/`, `/feedback/`, `/insights/`, `/about/`, `/admin/` and `/quiz/` as directory indexes. Existing `.html` links are client redirects that preserve query strings and fragments, with a timed HTML fallback. They are not server-side HTTP 301 redirects. Canonical URLs, internal navigation and the sitemap use the shorter paths. Game pages retain their existing `/games/<id>/` addresses.

The cached study can now be imported into the private [Admin review workspace](post-research-workspace.md). Source-matched imports reuse the existing classifications without additional Jev calls.
