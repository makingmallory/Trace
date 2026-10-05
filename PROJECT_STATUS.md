# Trace Project Status

This file is the concise, repository-facing orientation for development agents. It describes the checked-in implementation at the HEAD named below. It does not replace the Trace Project Bible, which remains the durable product-history, roadmap, design-decision, and future-planning record.

## Repository

- GitHub: `https://github.com/makingmallory/Trace`
- Default/current branch: `main` (`origin/HEAD` is not recorded locally, but the supplied repository context and current checkout identify `main` as the default)
- Current HEAD: `4ceb17d410b4a705914ac231660e87b832d03371` — `Add long-range planning forecasts` (2026-10-05)
- Working tree at inspection: clean and `main` was 21 commits ahead of `origin/main`. After creating this document, the only expected change is untracked `PROJECT_STATUS.md`.

## Current Development State

**IMPLEMENTED**

- Local-first Trackables, Daily Check-In, Quick Log occurrences, History/search/calendar views, reminders, portable backup/restore, Google Sheets sync, themes, PWA support, Capacitor Android packaging, and the Android quick-action widget.
- Typed Explore/Trends analysis, generic longitudinal feature generation, relationship discovery, change-point analysis, reviewable Insights, next-day forecasts, recursive 7-day forecasts, and 14–30 day planning forecasts.
- The latest implementation milestone is long-range planning forecasting. HEAD contains the engine, worker/provider integration, 30-day UI, validation logic, and tests. This is implemented in the repository but is not labeled VERIFIED; only the user can apply that status.

**LIKELY CURRENT WORK**

- There are no uncommitted application changes indicating an active partial implementation. The latest three commits form the forecasting sequence: tomorrow, 7 days, then long-range planning. The long-range milestone therefore appears newly completed and awaiting review rather than still absent.

**PLANNED / NOT YET IMPLEMENTED**

- The supplied Project Bible context names a customizable ovulation/cycle tracker as the next milestone. The repository has generic cycle/reproductive presets, but no dedicated ovulation model, cycle-tracker domain, prediction behavior, or specialized UI. Calendar cyclic features are generic date encodings and are not a menstrual-cycle implementation.
- Planning-goal types exist only as an integration hook; there is no goal editor or optimizer.

**UNCERTAIN**

- Repository evidence does not establish emulator or physical Samsung Galaxy S25+ validation of current Android lifecycle, notification, widget, WebView sync, and launcher behavior.
- No checked-in roadmap document beyond `PROJECT_SPEC.md` establishes whether the cycle tracker has formally started. Treat it as next planned work from the supplied Project Bible context, not as current code.

## Tech Stack

- Frontend: React 19, TypeScript 6, Vite 8, React Router 7 with hash routing, handwritten responsive CSS, semantic design tokens, and SVG-based charts/tooltips.
- Persistence: offline-first IndexedDB through `DataRepository`; `IndexedDbDataRepository` is the production implementation and `InMemoryDataRepository` supports tests/local use. The main database is `trace-local-data`, currently at IndexedDB version 5 with explicit upgrades.
- Android/PWA: Capacitor 8 (`app.trace.tracker`), Android min SDK 24 and target/compile SDK 36, native deep links/back handling/share integration, native Daily Check-In local notifications, `RemoteViews` home-screen widget, web manifest, and a production service worker.
- Sync: replaceable `SyncProvider`; production transport is a Google Apps Script web app bound to a user-owned Google Sheet. The Apps Script performs stable-ID upserts under a document lock.
- Analytics/predictions: replaceable `AnalyticsProvider` and `PredictionProvider`; derived analysis remains local and read-only. Relationship discovery and forecasts run in Web Workers created by the Trends UI.
- Testing/tooling: Vitest 4, `fake-indexeddb`, TypeScript project builds, Oxlint, Vite production builds, Gradle/Android lint scripts, and PowerShell brand-asset generation.

## Core Product / Data Invariants

- IndexedDB is the immediately writable working copy. Google Sheets is an optional sync/recovery replica, never UI state and never required for logging.
- Stable entity IDs, revisions, timestamps, tombstones, and version references carry identity. Spreadsheet row numbers do not.
- Raw `LogRecord`, `Observation`, option-selection, assertion, and relationship records remain separate from analysis mappings, derived features, discovered relationships, reviews, and forecasts.
- Observation answers explicitly distinguish answered zero/false from `skipped`, `unanswered`, `not_presented`, `unavailable`, and `unknown`. Occurrence absence is not automatically explicit No.
- Semantic Trackable edits create a new `TrackableVersion`; observations and Quick Logs retain their pinned version. Old versions and stable option IDs preserve historical meaning.
- Trackable names are unique globally, case-insensitively after whitespace normalization, across active and archived Trackables and across categories. Restoring an archived duplicate is preferred over creating a second one.
- Legacy observations are not rewritten to match a current definition. Compatible values are resolved by stable option ID or an unambiguous normalized label; otherwise analysis warns, keeps them separate, or requires an explicit analysis mapping.
- Nominal categories never receive invented numeric order. Ordinal choices require explicit ordering and are treated as ranks, not equal clinical distances.
- Multi-select answers remain sets of independently identified selections. Analysis expands option presence independently; forecasting emits independent option probabilities rather than forcing them to sum to one.
- Relationship discovery and Insights describe associations and temporal proximity, not causes. Only an explicit user claim may use the `caused_by_user_claim` relationship type.
- Feature generation and forecasting must honor local-date/as-of cutoffs and must not use future observations. Derived recursive forecast inputs never become source observations.

## Trackables / Recording / History

- `Trackable` is the active user-facing definition. `recordSemantics` (`daily_value` or `occurrence`) is independent of entry surfaces: Routine membership controls Daily Check-In and `quickLogEnabled` controls Quick Log for occurrence Trackables.
- Trackable configuration supports categories, data roles, icons/colors, tags, reminders, input types, scale/unit metadata, stable choice options, Allow Other, presentation-only defaults, and version-pinned structured `TrackableField` questions with required/conditional behavior.
- Semantic edits—including name, answer definition, record semantics, options, defaults, and fields—advance the version and retire the previous definition. Presentation/organization fields that are outside the version definition update the Trackable without rewriting observations.
- A current-date Check-In is editable against the latest version; still-valid stable selections carry forward and removed selected options appear as previously selected. Older completed dates resolve the version pinned by stored observations.
- Daily values are normalized `Observation` records under a routine `LogRecord`. Quick Logs are completed `LogRecord(recordKind = quick_log)` records that pin the owner Trackable version; their structured field answers share that parent record and pin field versions.
- For an occurrence routine question, existing same-date Quick Logs synthesize Yes without duplication. A displayed default No is not persisted in a draft; completion materializes `TrackableDailyAssertion(did_not_occur)`. Choosing No when occurrences exist requires conflict resolution and soft-deletes those occurrences.
- History provides week/month calendar navigation, completion/draft state, day details, Quick Log editing, soft delete/restore, structured search and filters, last-occurrence/days-since summaries, and Trackable/occurrence calendar coloring.
- Schema-v1 Event stores remain compatibility inputs. Startup, restore, and sync run deterministic/idempotent unification into schema-v2 Trackables, Quick Logs, fields, and assertions. Duplicate observation selections are repaired idempotently.

## Explore / Trends

- Trends has three surfaces: Explore, Insights, and Forecast.
- The typed analysis layer supports continuous numbers, explicit counts, duration, time-of-day, ordinal scales/choices, booleans, nominal single choice, nominal multi-select, and occurrence timelines. Text is intentionally not coerced into an analysis type.
- Structured Quick Log fields appear as owner-qualified series. Only active definitions with recorded values enter the selector.
- Explore supports search, category/input-type filtering, multiple selected series, 7/30/90-day or all-history ranges, per-series visibility, summaries, recorded-value tables, and mapping warnings/actions.
- Quantitative series use line charts; nominal, multi-select, boolean, and occurrence data use categorical/event lanes. Compatible quantitative series may overlay as raw values, normalized 0–100 values, or z-scores. Incompatible or nominal data remain stacked rather than receiving false numeric meaning.
- Historical mappings are analysis-only records: applying one preserves the original display/value and annotates the canonical mapped value. Unsupported or incomplete mappings remain visible as warnings.

## Feature Engineering

- `generateFeatureFrame` is a generic, read-only boundary built from canonical analysis tracks. Nothing it generates is persisted.
- Default lags are 1, 2, 3, 7, and 14 calendar days for numeric/binary/ordinal values; categorical indicators use 1- and 7-day lags.
- Rolling windows are 3, 7, 14, and 30 calendar days. Numeric features include mean, min, max, sample standard deviation, observed count, and OLS slope; ordinal features expose min, max, and count without treating rank gaps as equal.
- Event features include occurred/count today, days since, counts over 7/30/90 days, and 3/7/14/30-day post-event windows. Structured event-field predicates are supported within cardinality/candidate caps.
- Calendar features include weekend plus paired sine/cosine encodings for weekday, month, and day-of-month.
- Every cell carries missingness and contributing record/observation/version/mapping provenance. Missing, explicit No, unrecorded occurrence, observed option absence, and insufficient support remain distinct.
- Requests require an `asOfDate`; optional timestamp cutoffs filter records and definitions known after the cutoff. Target same-day/event/rolling leakage is excluded, forecasting asks only for cutoff-safe features, and exact calendar dates—not previous recorded rows—define lags.
- Limitation: storage contains current snapshots, not a complete edit audit. Strict historical timestamp mode conservatively drops a snapshot updated after a cutoff because the former value cannot be reconstructed.

## Relationship Discovery / Insights

- Discovery is target-scoped and derived. It creates one canonical target, one feature frame, aligns observed dates, screens all candidates, applies chronological expanding-window validation, and retains both ranked representatives and screened-out diagnostics. Candidate results are not persisted or synced.
- Numeric associations use Spearman rank correlation; binary combinations use rate difference, point-biserial, or Pearson as appropriate. Effects are descriptive, not causal estimates or p-values.
- Targets include numeric/count/duration/time, ordinal ranks, explicit boolean values, nominal/multi-select options as one-vs-rest outcomes, and occurrences only when logged Yes or stored explicit No establishes the outcome.
- Support gates cover aligned sample size, class/category support, distinct event episodes, fold counts, missingness, effect size, improvement, fold wins, and direction/effect consistency. Missing/unmapped cells never become zero.
- Walk-forward validation compares each univariate residual-adjustment candidate with a target-only recent-mean or smoothed-prevalence baseline. MAE, Brier, or ordinal Brier scoring is used; a candidate must improve out of sample before ranking.
- Near-duplicate windows/features are grouped into stable relationship families while exact candidate identity remains available for modeling. Technical alternatives and suppression reasons remain inspectable.
- Target-only change-point detection returns regimes and nearby events as `nearby-in-time` context. Older history remains intact; current-regime scoring is separate and optional.
- Insights runs discovery in a worker, surfaces a small diverse batch, and lets the user review a family as Yes/Probably/Unknown/Probably not/No with confidence. Reviews have supported/uncertain/questioned lifecycle labels and never replace statistical evidence.
- Reviews are stored in a separate local IndexedDB database (`trace-insight-reviews`) and are deliberately excluded from Google Sheets and JSON backup. Feature-level results and change points are regenerated, not stored as source truth.
- Important limitation: discovery is exploratory and mainly univariate; it does not control confounding, prove causation, or provide calibrated medical inference.

## Forecasting

### Tomorrow

- `forecastTargetAsOf` freezes a historical cutoff and predicts only the following local date. Supported targets are numeric, count, duration, time, explicitly ordered scales, booleans, nominal choices, and multi-select choices. Occurrence Trackables are not forecastable because an ordinary Quick Log does not establish a complete daily no-event denominator.
- Every target can fall back to a simple recent-history baseline. Small deterministic ridge or L2-logistic candidates are used only after expanding-window validation and only when they outperform the baseline across most folds.
- Predictors are cutoff-safe target lags/calendar facts plus eligible lagged relationship features. Same-day values, unknown future events, and future external Trackables are excluded. Review feedback provides only a bounded ranking preference and cannot override validation.
- Numeric/ordinal uncertainty uses holdout residuals when supported, otherwise recent dispersion or a bounded target fallback. Uninformative wide ranges are labeled/suppressed instead of shown as precise. Confidence also accounts for support, recency, validation capability, and uncertainty.

### Seven days

- The h1–h7 engine freezes source data at cutoff D and recursively feeds successful prior target forecasts only into a derived in-memory copy. Raw observations and training outcomes are unchanged.
- Future feature availability is typed as calendar-known, historically-known, recursive-target, or unavailable-future. Target lags may become recursive; external lags are usable only while their source date remains at or before D.
- Numeric estimates, thresholded binary values, highest-probability nominal options, and independently thresholded multi-select options drive documented recursion. Horizon-specific calibration expands uncertainty/shrinks probabilities, and each day may be ready, rough, or insufficient.
- No direct horizon-specific model is implemented; the seven days use the validated recursive one-step strategy.

### 14–30 day planning

- `forecastPlanningAsOf` implements 14–30 day forecasts. Days 1–7 retain the recursive engine; h8+ compares recent-history continuation, generic weekday seasonality, and recursive continuation. A richer strategy must beat the preferred baseline in temporal validation by at least 2%.
- Historical 7/14/21/30-day evaluation points freeze their own cutoffs. Missing future outcomes are skipped, never filled with zero. Only deterministic calendar facts and the target's own derived prior forecasts may contribute beyond the cutoff.
- The 30-day UI groups days into 1–7, 8–14, 15–21, and 22–30 windows with useful/rough/insufficient state, conservative confidence, usable-day coverage, aggregate range/probability, and neutral change-versus-recent-pattern language. Very broad bounded ranges are suppressed after day 14.
- Trends offers Tomorrow, 7 days, and 30 days using the same persisted target selection and worker-backed local provider. A revision-aware derived cache includes source/review/configuration state. Home intentionally shows Tomorrow only, with at most three ready selected targets, and links to Trends → Forecast.
- Forecasts are derived local objects; they are not persisted or synced as observations. They are estimates, not diagnoses. No dedicated cycle assumptions or planning-goal optimizer exists.

## Sync

- Settings supports manual **Sync now**, connection/reconnection to a bound Apps Script endpoint, conflict review, disconnect, JSON export, and JSON import/upgrade.
- Auto Sync is opt-in and shares the same `SyncRunCoordinator` with manual requests. One run is active at a time; overlapping requests coalesce and request one follow-up if pending changes remain.
- Auto Sync requests on startup, app foreground (throttled to 60 seconds unless changes are pending), connectivity return, and local writes after an 8-second debounce. Offline requests safely no-op; local writes continue in IndexedDB.
- Pulls are fully parsed before a transactional local apply. Pushes are batched (default 200), stable-ID upserts are idempotent, and the Sheet assigns a monotonically increasing remote revision under `LockService`.
- A known common base permits automatic normalization of identical/metadata-only changes and non-overlapping field merges. Differing values, delete-vs-edit, and identity collisions remain durable blocked conflicts until the user chooses Keep Local or Keep Synced.
- Tombstones are synced; hard row deletion is not used. Keep Both is intentionally unsupported because connected graph identities cannot yet be duplicated safely. Direct edits of canonical Sheet tabs are unsupported.
- The browser-compatible Apps Script deployment uses anonymous “Anyone” access. Possession of the high-entropy endpoint URL is effectively access; the URL must never be committed or broadly shared. Workspace policy may prevent this provider entirely.
- Local connection URLs, sync metadata, per-device reminder firing state, analysis mappings, Insight reviews, and Forecast selection are not synchronized as user observations. In particular, `analysisMappings` are stored locally but are absent from `syncedCollections` and portable backup records.

## UI / Design State

- `AppShell` provides the shared header, sync status, bottom navigation, native coordinator, and responsive main-page layout. Routes cover Home, Daily Check-In (including historical dates), Quick Log/editing, Trends, History, Trackables/categories, Settings, conflicts, and the historical sync-spike screen.
- Themes are token-driven and support multiple palettes, light/dark/system appearance, chart series, artwork filters, shadows, spacing/radii, and reduced motion. Generic components should continue consuming tokens rather than embedding the original pink/purple palette.
- Accessibility behavior in current code includes semantic labels/landmarks, keyboard calendar navigation, focus restoration, reduced-motion handling, non-color status copy, large touch targets, and categorical alternatives to inappropriate numeric charts. Accessibility remains a baseline for changes.
- Home and History intentionally share the full-width `sun-decoration.png` header artwork through `app-shell--decorative-header`. Preserve its geometry/visibility; readability is provided by layering and a localized radial backdrop rather than hiding or reshaping the artwork. Other main pages do not opt into this decorative header.
- Home includes Daily Check-In/Quick Log actions, current-day status and events, plus a Tomorrow-only forecast glance. History combines calendar/agenda/search interactions with edit, soft-delete, and undo/restore behavior.

## Important Files and Directories

- `PROJECT_SPEC.md` — product and architecture authority; read before architectural/domain/persistence/sync/analytics/navigation changes.
- `src/domain/models/` — shared entities, value types, explicit missing states, stable/versioned records.
- `src/domain/trackables/`, `checkin/`, `events/`, `history/`, `reminders/` — domain engines independent of React.
- `src/data/repository/` and `src/data/local/` — repository abstraction, IndexedDB implementation/migrations, in-memory implementation, local Insight-review store.
- `src/data/migrations/` — schema-v1 Event unification and duplicate-selection repair.
- `src/data/sync/` and `apps-script/` — protocol, provider boundary, orchestration, conflicts, backup/restore, Google Apps Script transport.
- `src/analytics/analysisModel.ts` and `src/analytics/features/` — typed canonical analysis, historical mappings, longitudinal indexes/features, and cutoff logic.
- `src/analytics/relationships/` and `src/analytics/insights/` — discovery, temporal validation, change points/regimes, family grouping, wording, review lifecycle.
- `src/analytics/forecasting/` and `src/predictions/` — next-day, 7-day, planning engines and replaceable prediction provider.
- `src/features/trends/` — Explore, Insights, Forecast UI plus worker entry points and visualizations.
- `src/features/` — React screens/adapters; components must not absorb persistence, sync, migration, or feature-engineering logic.
- `src/themes/`, `src/index.css`, `public/icons/` — theme definitions/tokens, responsive design, and shared decorative/brand assets.
- `src/platform/`, `capacitor.config.ts`, `android/` — native adapters, notification coordination, deep links, Android shell, and widget.
- `docs/` — setup and implementation notes. Check code and commit history when a doc conflicts with newer implementation.

## Testing / Validation

Run from the repository root:

```powershell
npm.cmd test
npm.cmd run typecheck
npm.cmd run lint
npm.cmd run build
```

Focused Vitest examples:

```powershell
npm.cmd test -- src/analytics/forecasting/planningForecast.test.ts
npm.cmd test -- src/analytics/relationships/relationshipDiscovery.test.ts
```

Android checks when the required JDK/SDK are installed:

```powershell
npm.cmd run android:build
npm.cmd run android:lint
```

Current documentation-task validation on 2026-10-05:

- `npm.cmd test`: 68 files and 463 tests passed.
- `npm.cmd run typecheck`: passed.
- `npm.cmd run lint`: passed.
- `npm.cmd run build`: passed.
- Non-failing warning: Vite reports production chunks over 500 kB (`TraceEmojiPicker` and the main application bundle). This is a size/code-splitting warning, not a build failure.
- Before handoff, inspect `git diff -- PROJECT_STATUS.md` and `git status --short` to ensure this documentation file is the only working-tree change.

Do not freeze the counts above as a future requirement; run the current commands and report their actual result.

## Known Limitations / Deferred Work

- Forecasting does not support occurrence targets, direct horizon-specific 2–7 day models, future endogenous/external features, dedicated cycle logic, or planning-goal optimization. Long-range output may legitimately become insufficient before day 30.
- Relationship discovery is exploratory/univariate and cannot control confounding or establish causation. Insight reviews are local-only and not part of backup/sync.
- Analysis mappings are local-only despite affecting historical continuity in Explore/model inputs; reconnecting/restoring on another device will not recover them from current Google Sheets/JSON backups.
- Snapshot persistence cannot reconstruct the former value of an observation edited later; strict historical cutoff logic drops such facts conservatively.
- Sheet canonical-tab editing and Keep Both conflict resolution are unsupported. Apps Script anonymous deployment is a documented confidentiality risk.
- Android hardware/emulator behavior is not demonstrated by repository evidence. Keep physical-device validation explicit for lifecycle persistence, notification timing/permissions, widget taps/resizing, WebView sync, share flows, system Back, keyboard layouts, launcher masking, and system-bar contrast.
- Configurable widget shortcuts, per-widget configuration, native direct entry, widget charts/predictions, and time-of-day widget layouts remain deferred.
- The production build currently emits a large-chunk warning.
- Some docs lag the code: the root README still says predictions are deferred; `docs/reminders-v1.md` still describes native notifications as unimplemented; `docs/android.md` says JSON import UI is absent although Settings now implements import/restore. Prefer current source for those areas.

## Current / Next Work

- Actual latest milestone: **long-range 14–30 day planning forecasting is implemented at HEAD**. It should be reviewed against product expectations and device/browser behavior, but must not be called VERIFIED without the user.
- No partial application work is present in the working tree. The next supplied roadmap item is a **customizable ovulation/cycle tracker**, but it is planned only and must begin with explicit scope against `PROJECT_SPEC.md`; do not mistake generic cycle presets or calendar features for that milestone.
- Before cycle work, resolve whether local-only analysis mappings and Insight reviews are intentionally excluded from recovery, because both influence interpretation/modeling even though neither is a raw observation.

## Recent Meaningful Checkpoints

- `4ceb17d` — long-range 14–30 day planning forecasts.
- `dc0a1fa` — recursive seven-day forecasting and forecast UX.
- `194274f` — next-day forecasting.
- `da8f590` — reviewable relationship Insights and local review lifecycle.
- `48e04f8` — relationship discovery, temporal validation, and change-point analysis.
- `de238d3` — automatic Google Sheets sync coordination.
- `cfffa4b` — longitudinal feature generation and typed Trends refinement.
- `2d8d699` — expanded analysis and Trackable configuration/mapping.
- `23dedb7` — configurable theme palettes and appearance modes.
- `001ab1b` — global unique Trackable names.
- `4a4b711` — safer sync conflict resolution and decorative-header readability invariant.
- `a79b990` — unified Trackable/Quick Log schema-v2 behavior.
- `4645ece` — Capacitor Android packaging and first widget.
- `9cfa20a` — production Google Sheets sync.

## Agent Rules

- Read `PROJECT_SPEC.md`, identify the requested milestone, inspect existing code, and implement only that milestone plus minimum coherent scaffolding.
- Preserve stable IDs, Trackable versions, missing/No/zero distinctions, timing precision, tombstones, raw historical observations, and non-destructive historical mapping.
- Keep domain logic independent of React. UI must not know Sheet columns, Apps Script details, migration rules, or feature-engineering internals.
- Prevent future leakage in features, relationship validation, and forecasts. Preserve as-of provenance and never turn derived recursive values into raw observations.
- Never describe association or nearby timing as causation. Prefer interpretable/simple models; use richer models only when they demonstrate better out-of-sample performance.
- Do not hard-code named health concepts into generic engines. Drive behavior from Trackable configuration, input type, role, relationships, and stable IDs.
- Preserve working functionality unless the task explicitly changes it. Add focused tests for high-breakage domain behavior.
- Never include secrets, Apps Script deployment URLs, private health data, or user-specific configuration in source or reports.
- Do not commit or push unless explicitly asked. Do not mark work VERIFIED.
- Update this file after meaningful implementation work when its contents materially change, while keeping it concise enough to serve as orientation.
