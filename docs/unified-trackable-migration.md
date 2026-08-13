# Unified Trackable migration

Trace schema v2 makes Trackable the only active tracking definition. Record semantics and entry surfaces are independent: `recordSemantics` is `daily_value` or `occurrence`; an Occurrence Trackable may separately set `quickLogEnabled`; Nightly participation remains a `RoutineItem` relationship. A Trackable may therefore be Nightly-only, Quick-Log-only, or available through both surfaces. Structured Quick Log questions live in `TrackableFields`; explicit day-level No lives in `TrackableDailyAssertions`; occurrences are `LogRecords` with `recordKind = quick_log` and `trackableId`.

## Upgrade strategy

The local IndexedDB version is bumped to 3 to create the new stores. Before the app renders, Trace converts legacy Event data in one multi-store transaction. A failure aborts the unified writes and leaves the legacy stores available for retry. The same converter runs after Google restore and JSON backup restore.

Legacy stores are retained for schema-v1 compatibility and are not used by normal UI. Conversion preserves occurrence IDs, revisions, timestamps, temporal precision, duration/ongoing state, structured observation values and notes, tombstones, relationships, category/icon identity, routine ordering/rules, and archived state. Event fields retain their IDs while their ownership keys are generalized.

The converter is idempotent: deterministic owner/version identities and in-place record conversion prevent duplicate Trackables or occurrences on rerun. It also corrects data written by the original schema-v2 implementation: legacy `behavior = daily` becomes Daily Value with Quick Log disabled, while `behavior = quick_log` becomes Occurrence with Quick Log enabled. The compatibility field is then removed. A routine Trackable reconciled with a matching Event keeps its stable Trackable ID and `RoutineItem`, becomes Occurrence, and enables Quick Log, so both entry surfaces remain available.

## Duplicate reconciliation

An EventDefinition is reconciled with a Trackable only when they share a stable ID, or exactly one Trackable has the same normalized name and category and uses a boolean answer compatible with occurrence semantics.

Fuzzy matches, multiple candidates, different categories, and incompatible answer types are not merged. The EventDefinition becomes a separate Occurrence Trackable with Quick Log enabled so no data is lost. This conservative case remains visible in Trackables for manual review.

## Nightly completion semantics

Routine membership alone controls whether a Trackable appears in Nightly Check-In. Existing occurrence records prefill Yes and provide the logged-today count without creating another occurrence. With no occurrence, the form displays a default No but does not write a `TrackableDailyAssertion` while the Check-In remains a draft. Successful completion persists `did_not_occur`; abandoning the draft remains missing. Quick Logs outside the routine appear once in Logged Today and do not become required questions.

## Google Sheets

The Apps Script schema remains v2. It appends `recordSemantics` and `quickLogEnabled` after the original v2 columns, preserving compatibility with existing workbooks. Rows that still contain the original `behavior` field are decoded into the corrected concepts and then normalized on-device. Legacy v1 Event rows migrate through the same converter. A future-version workbook is rejected.

Physical-device verification is still required for a real existing Sheet and Android lifecycle; automated coverage validates protocol compatibility and local restore/migration behavior.
