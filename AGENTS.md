# AGENTS.md

## Project authority

`PROJECT_SPEC.md` is the architectural and product source of truth for this repository.

Before making architectural, domain-model, persistence, sync, analytics, or navigation changes:

1. Read `PROJECT_SPEC.md`.
2. Identify the current milestone explicitly requested by the user.
3. Implement **only that milestone**, plus the minimum scaffolding required to make it coherent.
4. Do not opportunistically implement later milestones.

If the user's direct instruction conflicts with `PROJECT_SPEC.md`, follow the user's instruction and clearly call out the conflict in your final summary.

## Core architectural rules

- Keep domain logic independent from React components.
- UI components must not know Google Sheet row/column positions, Apps Script implementation details, schema migration logic, or ML feature-engineering logic.
- Use abstractions for replaceable infrastructure, especially:
  - `DataRepository`
  - `SyncProvider`
  - `AnalyticsProvider`
  - `PredictionProvider`
  - `AssetProvider`
- Do not hard-code named health concepts such as acne, migraine, menstruation, iron infusion, or specific medications into generic rendering/storage logic.
- Generic behavior should be driven by Trackable/Event configuration, input type, rules, data role, and relationships.
- Preserve the distinction between:
  - zero
  - explicit No
  - skipped
  - unanswered
  - not presented
  - unknown
- Preserve historical meaning through Trackable versioning.
- Use permanent IDs; never use spreadsheet row numbers as entity identity.
- Keep raw observations separate from derived analytics and predictions.
- Relationships are generic ID-to-ID records, not nested special-case fields.
- Treat local data as immediately writable/offline-first.
- Treat Google Sheets as a replaceable sync/recovery provider, not as UI state.
- Use theme/design tokens. Do not hard-code the initial pink/purple aesthetic into generic components.
- Accessibility is a baseline requirement, not later polish.

## Scope discipline

The project is intentionally large. Avoid “while I'm here” expansion.

For every task:
- state the requested milestone
- make a short plan
- implement it
- run relevant tests/checks
- stop

Do not start:
- Google sync before the sync spike milestone
- ML/prediction implementation before explicitly requested
- Android native/widget work before its milestone
- advanced dashboard building before Trends V1
- legacy Excel migration unless explicitly requested

## Quality expectations

- Prefer clear, boring data models over clever abstractions.
- Prefer configuration-driven behavior over special-case branches.
- Avoid premature framework complexity.
- Add runtime validation where external/untrusted data enters the application.
- Write tests for domain behavior with high future-breakage risk.
- Keep migrations explicit and versioned once persistence begins.
- Flag architectural uncertainty instead of silently guessing.

## End-of-task report

After each coding task, summarize:
- what changed
- files added/modified
- tests/checks run
- unresolved questions
- any conflict or risk discovered against `PROJECT_SPEC.md`
- the next logical milestone, without implementing it unless asked
