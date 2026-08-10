# Codex Task: Milestone 0 — Technical Skeleton

Read `PROJECT_SPEC.md` completely before making changes. Treat it as the architectural and product source of truth.

Read and obey `AGENTS.md`.

## Goal

Create **only Milestone 0: Technical Skeleton**.

I want a clean foundation that knows where this project is going without prematurely implementing later features.

## Implement

### Project setup
- Scaffold a React + TypeScript application suitable for:
  - web/PWA development now
  - later Capacitor Android packaging
- Choose a lightweight modern build setup appropriate for GitHub Pages deployment later.
- Keep the project as a normal single application; do not create a monorepo unless there is a concrete need.

### App shell and routing
Create the five core screens:

1. Home
2. Trends
3. History
4. Trackables
5. Settings

Add a responsive bottom navigation matching those five destinations.

The app should be usable at narrow mobile widths first, while remaining reasonable on desktop.

Do **not** implement full feature functionality on these screens yet. Appropriate placeholders are fine.

### Theme architecture
Create a semantic theme/design-token system from the beginning.

The initial visual direction can be pink/purple, soft, cute, and fantasy-inspired, but generic components must consume semantic tokens rather than hard-coded assumptions like “primary means pink.”

Design for future switchable themes.

Include foundations for:
- background
- surfaces/cards
- primary
- secondary
- accent
- text
- muted text
- borders
- success
- warning
- danger
- chart series colors
- spacing/radius/motion tokens if useful

Do not build a full theme editor.

### Domain model
Create TypeScript domain interfaces/types for the core entities described in `PROJECT_SPEC.md`, including at minimum:

- Category
- Trackable
- TrackableVersion
- TrackableOption
- Routine
- RoutineItem
- EventDefinition
- EventField
- LogRecord
- Observation
- ObservationOptionSelection
- EventDailyAssertion
- RecordRelationship
- RelationshipAssessment
- Settings
- SyncMetadata

Also create shared enums/unions/value objects needed by those entities, such as:
- input types
- data roles
- value direction
- event timing modes
- time precision
- relationship types/provenance
- routine completion behavior
- trend tracking modes
- event reminder behavior
- record source

Important:
- Do not create domain types that assume acne, migraine, menstruation, or another named condition is structurally special.
- Preserve missing-vs-zero semantics.
- Preserve Trackable versioning.
- Preserve explicit negative event assertions.
- Preserve generic event relationships.

### Repository abstraction
Create a `DataRepository` interface that will eventually hide local persistence from the rest of the application.

For this milestone, provide a simple in-memory implementation or similarly minimal placeholder so the app can compile and domain tests can run.

Do **not** implement Google Sheets or Apps Script yet.

Do **not** let React components directly manipulate persistence details.

### Future provider boundaries
Define minimal interfaces/placeholders, without implementing them, for:
- `SyncProvider`
- `AnalyticsProvider`
- `PredictionProvider`
- `AssetProvider`

Keep them intentionally small. Do not invent a large speculative API surface.

### Tests
Add useful tests for foundational domain behavior where practical.

Prioritize tests that prove the model can represent:
- zero separately from missing/unanswered
- explicit “event did not occur” separately from “no event record exists”
- Trackable identity separately from TrackableVersion
- generic relationships between records

Do not spend time building tests for placeholder screen text.

### Documentation
Add/update a short README describing:
- what the project is
- how to install dependencies
- how to run locally
- how to run tests
- current milestone status

## Explicitly do NOT implement

- Google Sheets integration
- Apps Script
- authentication
- real sync
- backup/import/export
- Daily Check-In functionality
- Event logging UI
- History calendar
- History search
- charts
- relationship discovery
- ML
- predictions
- Capacitor Android setup unless absolutely required by the chosen scaffold
- Android widget
- custom icon uploads
- multiple finished themes
- legacy Excel/CSV import

## Decision handling

If you encounter an ambiguity:

1. Prefer the simplest option consistent with `PROJECT_SPEC.md`.
2. Avoid locking the project into a hard-to-replace dependency.
3. Document the decision.
4. If the ambiguity could materially affect future architecture, flag it rather than building a large speculative solution.

## Completion

When finished:

1. Run tests.
2. Run type checking.
3. Run the production build.
4. Fix failures caused by your changes.
5. Stop after Milestone 0.

Then report:
- architecture chosen
- files created/modified
- tests/checks run and their results
- any assumptions made
- any contradictions or risks found in `PROJECT_SPEC.md`
- what Milestone 0.5 would logically do next, without implementing it
