# Longitudinal feature generation

`generateFeatureFrame(data, request)` is a read-only modeling boundary. `generateFeatureFrameFromProvider` loads the same `AnalyticsProvider` data once. The engine builds each series with `buildAnalysisTrack`, so pinned versions, historical mappings, and canonical values follow the existing analysis rules. `buildLongitudinalIndex` then indexes canonical values and answer states by local date. No feature is persisted.

Each catalog entry has a stable semantic key, source Trackable or structured-field identity, measurement type, transformation, result type, and readable label. Each cell has a value or `null`, a missingness/status code, and contributing record/observation/version/mapping provenance. `formatFeatureFrame` is a fixture/debug text view only.

## Dates and cutoffs

- A row for date `t` uses calendar dates at or before `t`. Positive lags use exact calendar dates, never the previous recorded row.
- If a daily value has multiple canonical observations on one date, lag and rolling features use the latest recorded observation (event counts still include every matching event).
- A rolling `N`-day window includes `t` and the preceding `N-1` calendar days. Mean/min/max need one observed value; sample standard deviation and ordinary least-squares slope need two. Slope uses actual day distances. Observed count can be zero. Ordinal rolling features expose min/max/count only; ranks are ordered, not assumed equally spaced.
- An event count in the previous `N` days includes `t` and the preceding `N-1` days. `days-since` uses the most recent matching event on or before `t`. A post-event `N`-day indicator includes the event day and the next `N` days; repeated events restart the window.
- `asOfDate` is required. The requested range cannot extend beyond it. An optional `asOfTimestamp` filters records, answers, definitions, options, and mappings whose creation or latest update is after that instant. With it, earlier rows also exclude facts entered after their own day-end. A same-day timestamp cutoff excludes later timed events and later-entered answers.
- `targetTrackableId` omits same-day event and rolling features from that target; past-day lags remain candidates. A forecasting caller should request features through the day before the prediction date.

The repository stores current entity snapshots, not a full edit audit. A past answer that was later edited cannot be reconstructed at its former value. Strict timestamp mode conservatively drops such snapshots when their `updatedAt` exceeds the cutoff. The per-row day-end comparison uses UTC ISO timestamps; a future sub-day local-time forecasting API should supply explicit timezone handling.

## Missingness and candidate control

`observed-zero` means a recorded categorical/multi-select answer omitted that option or a rolling observed count is zero. `explicit-no` means a stored occurrence assertion says the event did not occur. `no-recorded-event` means no matching Quick Log is present and is **not** an explicit No. Other codes distinguish absent Check-Ins, unanswered/skipped/not-presented answers, unmapped historical values, and insufficient observations. Consumers should use the status as well as the value.

The default policy limits lag/window sets, categorical cardinality, structured event predicates, and total features. Candidate definitions are deterministic by stable IDs, so option relabeling does not change feature keys or the order used for a capped catalog. `omittedCandidateCount` reports candidates dropped by the global cap. Callers may scope Trackables and feature families without changing the raw dataset. No significance testing, relationship selection, or model fitting occurs here.
