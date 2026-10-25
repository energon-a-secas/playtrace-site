# CLAUDE.md: Playtrace

Explore AI game projects, trace their updates, and share public feedback.

**Live:** playtrace.neorgon.com · **Port:** 8900

## Run

```bash
make serve
```

Then open http://localhost:8900. It must be served over HTTP: the app is ES modules, and `file://` blocks them.

## Architecture

| Module | Lines | Owns |
|---|---:|---|
| `js/neorgon-auth.js` | 1001 | `hostFromPublishableKey`, `readClientUat`, `siteIdFromHost`, `todayUTC`, `usageStamp` |
| `js/admin.js` | 378 | none |
| `js/neorgon-beacon.js` | 343 | none |
| `js/collection.js` | 259 | `categories`, `categoryChoices`, `categoryLabel`, `stages`, `projectPlatforms` |
| `js/accounts.js` | 201 | `startAccounts`, `refreshMe`, `syncLocalFavorites`, `prepareFollowing`, `followGame` |
| `js/feedback.js` | 196 | `editKey`, `clearFeedback`, `resetFeedback`, `renderFeedback`, `loadFeedback` |
| `js/render.js` | 171 | `render`, `renderDetail`, `renderAccount`, `renderSignals` |
| `js/neorgon-dom.js` | 157 | `escHtml`, `debounce`, `throttle`, `clamp`, `uid` |
| `js/admin-insights.js` | 153 | `resetInsights`, `initInsights`, `loadInsights` |
| `js/neorgon-persist.js` | 152 | `safeGet`, `safeSet`, `safeRemove`, `safeGetJSON`, `safeSetJSON` |
| `js/events.js` | 143 | `navigation`, `syncDetail`, `catalogueReady`, `bindEvents` |
| `js/quiz.js` | 141 | `bindQuiz` |
| `js/project.js` | 140 | `storeLabel`, `prepareProject`, `closeProject`, `bindProject` |
| `js/inline-editor.js` | 117 | `closeInlineEditor`, `openInlineEditor`, `bindInlineEditor` |
| `js/research-page.js` | 116 | none |
| `js/admin-campaign.js` | 97 | `evidence`, `loadQueue`, `loadResearchAdmin`, `resetCampaign`, `initCampaign` |
| `js/game-page.js` | 94 | none |
| `js/feedback-pattern-view.js` | 89 | `loadFeedbackPatterns` |
| `js/state.js` | 89 | `state`, `restoreLocation`, `saveView`, `loadCatalog`, `loadService` |
| `js/discovery-insights.js` | 80 | `renderTechniques`, `renderStores` |
| `js/showcase-images.js` | 75 | `bindShowcaseImages` |
| `js/favorites.js` | 73 | `createFavoritesStore`, `favorites` |
| `js/project-extras.js` | 73 | `loadExtras`, `closeExtras`, `openQuickImage`, `bindExtras` |
| `js/showcase-motion.js` | 68 | `bindShowcase` |
| `js/highlight-view.js` | 66 | `highlightImageHints`, `highlightPanels`, `updateHighlightPanels` |
| `js/admin-highlights.js` | 64 | `resetHighlights`, `loadHighlightsAdmin`, `initHighlights` |
| `js/insight-evidence.js` | 61 | `artRules`, `extractMentions`, `modelReleases` |
| `js/research-schema.js` | 59 | `researchCategories`, `defaultQuestions`, `builtInQuestionnaires`, `validQuestions`, `validAnswers` |
| `js/game-page-view.js` | 58 | `previewUrl`, `gameDescription`, `gameStructuredData`, `gamePageContent` |
| `js/expectation-followup.js` | 57 | `clearExpectations`, `loadExpectations`, `bindExpectations` |
| `js/quiz-images.js` | 56 | `createQuizImages` |
| `js/hosting-charts.js` | 51 | `deviceGroups`, `hostingSlices`, `hostingSliceGames`, `hostingCharts` |
| `js/feedback-patterns.js` | 50 | `feedbackTopics`, `nextQuestions`, `feedbackReport` |
| `js/store-insights.js` | 49 | `storeStates`, `priceStates`, `releaseWindow`, `storeListings`, `releaseCalendar` |
| `js/feedback-research.js` | 47 | `experienceLabels`, `responseLabels`, `feedbackEvidence`, `feedbackResearchLeads`, `feedbackEvidenceCsv` |
| `js/home.js` | 47 | none |
| `js/admin-post-research.js` | 46 | `resetPostResearch`, `loadPostResearch`, `initPostResearch` |
| `js/insight-projects.js` | 45 | `projectRows`, `renderProjectList`, `bindChart` |
| `js/link-health.js` | 45 | `destinationHost`, `linkStates`, `linkReasons`, `linkEvidence`, `hostingReport` |
| `js/challenge.js` | 44 | `clearChallenge`, `priceChallenge` |
| `js/maker-combobox.js` | 44 | `syncMakers`, `bindMaker` |
| `js/neorgon-navigation.js` | 44 | `updateQuery`, `createQueryHistory` |
| `js/feedback-research-view.js` | 39 | `researchLeadsMarkup`, `topicEvidenceMarkup` |
| `js/insight-analysis.js` | 39 | `mentionDimensions`, `missingLabel`, `periodKey`, `valuesFor`, `trend` |
| `js/search-select.js` | 38 | `searchSelect` |
| `js/rating-control.js` | 37 | `ratingControl` |
| `js/icons.js` | 36 | `icon`, `playLabel`, `playLink`, `relatedSteamLink` |
| `js/release-evidence.js` | 34 | `exactReleaseDate`, `releaseEvidence`, `releaseTimeline` |
| `js/hosting-view.js` | 33 | `renderHosting` |
| `js/post-research-schema.js` | 33 | `researchVersion`, `rubric`, `redactText`, `modelText`, `facetTitles` |
| `js/question-flow.js` | 33 | `questionFlow` |
| `js/api.js` | 30 | `apiConfigured`, `request` |
| `js/usage.js` | 28 | `measurementEnabled`, `measure` |
| `js/dialogs.js` | 27 | `openDialog`, `bindDialog` |
| `js/reddit-score.js` | 27 | `redditScoreBadge`, `bindRedditScoreTooltips` |
| `js/weekly-brief-view.js` | 26 | `weeklyBriefView` |
| `js/community-insights.js` | 24 | none |
| `js/technique-evidence.js` | 24 | `techniqueRules`, `resourceRules` |
| `js/feedback-review.js` | 22 | `revealReviewSource`, `reviewMarkup` |
| `js/feedback-options.js` | 20 | `feedbackQuestions`, `feedbackOptions`, `feedbackExperiences`, `validChoices` |
| `js/insight-navigation.js` | 19 | `initInsightNavigation` |
| `js/categories.js` | 18 | `DEFAULT_CATEGORIES`, `validCategoryId`, `validateCategories` |
| `js/guest-key.js` | 17 | `editKey`, `keyPersists` |
| `js/insight-snapshot.js` | 17 | `collectInsightPages` |
| `js/app.js` | 15 | none |
| `js/link-check-view.js` | 15 | `linkCheckMarkup` |
| `js/neorgon-auth-sites.js` | 15 | none |
| `js/site-footer.js` | 15 | none |
| `js/steam-demo.js` | 15 | `verifiedSteamDemo`, `demoPlayUrl` |
| `js/catalog-snapshot.js` | 12 | `loadPublicSnapshot` |
| `js/missing-game.js` | 11 | none |
| `js/config.js` | 10 | `CONFIG` |
| `js/alias-redirect.js` | 9 | none |
| `js/page-redirect.js` | 9 | none |
| `js/expectation-options.js` | 8 | `interestOptions`, `expectationOptions`, `expectationTotals` |
| `js/expectation-report.js` | 8 | `expectationReport` |
| `js/project-url.js` | 6 | `projectPath` |
| `js/quiz-page.js` | 6 | none |
| `js/utils.js` | 6 | `$` |
| `js/favorites-redirect.js` | 4 | none |

Vendored from `packages/neorgon-ui/`, never edit in place; run the sync script instead: `js/neorgon-header.js`, `js/neorgon-footer.js`.

## Data

- `localStorage['neo-auth:dev-key']`
- `data/`: 35 file(s)
- `worker/`: Cloudflare Worker proxy; secrets are `wrangler secret` bindings, never literals

## Conventions

- Zero build step. Plain ES modules loaded by `js/app.js`.
- Header and footer come from the shared kits. Do not add site-local `.neo-footer` or `.header-bar` CSS.
- The fleet guideline is ~500 lines per module; `js/neorgon-auth.js` is already past it. Split when touching it, do not grow it further.

## Gotchas

TODO: the non-obvious failures. What broke here before, what looks wrong but is deliberate, what a reasonable change would break. This is the highest-value section; leave it empty rather than filling it with generic advice.

## Do not touch

- `js/neorgon-*.js` and `css/neorgon-*.css`: vendored kits, regenerated by `packages/neorgon-ui/sync-*.sh`.
