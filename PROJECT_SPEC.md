# Personal Health & Pattern Tracker
## Master Product + Architecture Specification

## Unified Trackable architecture amendment (schema v2)

This amendment supersedes every later section that describes Trackables and Event Types as separate active product concepts. Those passages remain only as historical context for schema-v1 restore compatibility.

- A **Trackable** is the only user-facing tracking definition.
- Trackables have independent **record semantics** and **entry surfaces**. These must never be modeled as one mutually exclusive Daily/Quick Log choice.
- `recordSemantics = daily_value` means one canonical value for a calendar day. `recordSemantics = occurrence` means zero, one, or many occurrence records per day.
- `quickLogEnabled` is an optional entry capability for Occurrence Trackables. Quick Log Trackables may own optional, version-pinned `TrackableField` details and timing configuration.
- Nightly Check-In participation is represented only by configured `RoutineItem` membership. A Trackable may be Nightly-only, Quick-Log-only, or available through both surfaces.
- The user-facing action is **Quick Log**. “Event Type,” “Create Event Type,” “Manage Events,” and “Log Event” are legacy schema terms, not active UI concepts.
- A Quick Log occurrence implies day-level Yes. A `TrackableDailyAssertion(status = did_not_occur)` stores explicit No. Neither means missing; absence never implies No.
- Nightly Check-In is a review/completion surface. A routine Occurrence Trackable always remains in its configured position. Existing occurrences prefill Yes without creating duplicates; no occurrence defaults the UI to No; nightly Yes creates one date-only occurrence only when none exists; nightly No creates an assertion and requires conflict resolution before soft-deleting existing occurrences.
- A default Nightly No is presentation state only. Opening, autosaving, or abandoning the draft does not persist it; successful Check-In completion materializes the explicit `did_not_occur` assertion. Missing and explicit No remain distinct.
- **Logged Today** lists same-day Quick Logs that are not already routine questions and never becomes required questionnaire content.
- `EventDefinition`, `EventField`, and `EventDailyAssertion` stores are retained read-only as schema-v1 migration inputs. Active data uses Trackable, TrackableVersion, TrackableField, LogRecord(`recordKind = quick_log`), and TrackableDailyAssertion.
- Schema-v1 JSON backups and Google Sheets are upgraded through deterministic, transactional, idempotent migration. Stable record IDs, revisions, timestamps, timing precision, tombstones, relationships, icons, categories, routines, fields, and historical version references are preserved.
- Duplicate reconciliation is automatic only for identical stable IDs or one exact normalized name + category + boolean-compatible Trackable. Fuzzy names and incompatible answer formats remain separate to avoid data loss.

Implementation details and upgrade limitations are documented in `docs/unified-trackable-migration.md`.

**Version:** 0.1  
**Status:** Pre-development source of truth  
**Date:** August 10, 2026  
**Project name:** TBD

---

# 1. Product Vision

Build a highly customizable, visually delightful personal tracking application designed around one core idea:

**People should be able to collect rich longitudinal data about themselves with as little daily friction as possible, retain full ownership/access to that data, visualize patterns in meaningful ways, and eventually use personalized machine-learning models to predict future states and discover relationships.**

The product begins as a personal daily health/symptom tracker but must not be architected specifically around menstrual cycles, acne, migraines, autoimmune disease, or any one health condition.

The system must support arbitrary user-defined Trackables and Events.

A user should be able to track things such as:

- mood
- depression
- anxiety
- acne
- eczema
- energy
- fatigue
- sleep
- discharge
- menstrual bleeding
- pain
- migraines
- headaches
- iron infusions
- medication
- GI symptoms
- calories/macros
- work stress
- exercise
- treatment effectiveness
- or something the developer never anticipated

without requiring schema changes or application rewrites.

The application should feel:

- personal
- cute
- pleasant
- fast
- non-clinical
- data-rich without being overwhelming
- useful to casual users
- extremely satisfying to people who enjoy analytics

The primary developer/user prefers a pink/purple, girly, fantasy-inspired aesthetic. That theme should drive the initial product without becoming hard-coded into the application architecture.

---

# 2. Core Product Principles

## 2.1 Logging must be extremely low-friction

The application expects users to interact with it repeatedly for months or years.

Therefore:

- most daily answers should require one tap
- text entry should be optional whenever possible
- conditional follow-ups should hide unnecessary questions
- the nightly check-in should be one scrolling experience rather than a long multi-page wizard
- answers should autosave locally
- interrupted check-ins must be resumable
- event logging should take approximately a few taps
- common events should be pin-able and quickly accessible
- users should be able to enter the app and reach Daily Check-In or Log Event immediately from Home

The application must never punish the user for having many possible Trackables.

Complexity should live in configuration and analytics, not in every nightly interaction.

## 2.2 Missing data must remain missing

The system must distinguish between:

- value = 0
- explicitly answered “No”
- deliberately skipped
- never presented
- unanswered
- unavailable
- unknown

These are not interchangeable.

Example:

If Headache appears in a nightly check-in:

- user selects **No** → explicit evidence that no headache occurred
- user selects **Yes** → event occurred
- user skips it → unknown
- Headache was not part of their routine → no observation at all

The system must preserve these distinctions.

## 2.3 Data ownership is a core feature

The application should not trap user data inside a proprietary backend.

Primary design:

**Local app copy + user-owned Google Sheet + portable backup/export**

The user should always be able to see, export, analyze, and recover their data.

No paid backend is required.

## 2.4 Raw observations and derived intelligence must remain separate

The application should conceptually contain three layers:

### Tracking layer
What the user actually recorded.

### Analytics layer
Things calculated from those observations, such as:

- rolling averages
- frequency
- correlations
- days since an event
- lag relationships
- averages
- periodicity

### Prediction layer
Future ML predictions.

The raw dataset must never be reshaped around the needs of one particular model.

Changing a future ML approach must not require changing historical data.

---

# 3. V1 Scope

V1 should include:

## Data collection

- Daily Check-In
- event logging
- point events
- duration events
- untimed/day-level events
- preset Trackables
- custom Trackables
- preset Events
- custom Events
- conditional questions
- configurable nightly routine
- event reminders inside nightly check-in
- subjective Better / Same / Worse tracking
- event treatment follow-ups

## Organization

- customizable categories
- preset packs
- active/inactive Trackables
- Trackable ordering
- pinned events
- event favorites/recent events

## History

- calendar history
- completed-check-in indicator
- incomplete-check-in indicator
- event icons on calendar
- day-detail view
- edit historical data
- delete/restore
- calendar visualization mode
- filtering
- **search**
- last occurrence
- days since last occurrence

## Dashboard / Trends

- basic customizable dashboard
- basic time-series charts
- calendar heatmaps
- event overlays
- rolling summaries
- event counts
- treatment-effectiveness summaries where data exists
- relationship exploration framework
- placeholder architecture for future predictions and suggested relationships

## Storage

- local-first storage
- Google Sheets synchronization
- reconnect existing app-format Google Sheet
- JSON backup/export
- backup import
- CSV data export
- soft deletion
- sync status

## Platforms

- responsive web application
- installable PWA
- Android app through Capacitor
- simple Android home-screen widget
- iPhone users supported through web/PWA

## UI

- theme-aware architecture
- initial pink/purple fantasy-inspired theme
- icon library
- emoji support
- accessibility foundations

---

# 4. Explicitly Not Required for Initial V1

The architecture must allow these later, but they do not need to ship immediately:

- machine-learning predictions
- automatically suggested relationships
- advanced lag analysis
- full dashboard drag-and-drop grid builder
- multiple complete themes
- user-uploaded custom icons/images
- native iOS App Store release
- complicated recurring schedules
- arbitrary user-written formulas/scripts
- automatic legacy Excel import
- cloud-hosted centralized backend
- social/community functionality

---

# 5. Technology Architecture

Recommended high-level stack:

### Frontend
React + TypeScript

### Native wrapper
Capacitor

### Web hosting
GitHub Pages

### Local data
Local-first structured browser/app storage behind an abstraction layer.

Initial implementation may use IndexedDB or another suitable local persistence layer.

The UI must never directly depend on a particular storage technology.

### Remote sync
Google Sheets through a Sync Provider abstraction.

Initial provider:

Google Apps Script + Google Sheets.

### Android widget
Native Android code, likely Kotlin + Glance.

### Future analytics
TypeScript/browser analytics initially.

### Future ML
Technology deliberately unspecified.

The ML layer may later use:

- Python-generated models
- browser-executed models
- JavaScript ML
- exported model artifacts
- another approach

The application architecture must not assume one yet.

---

# 6. Important Architectural Rule: Use Adapters

UI code must never directly call Google Sheets or directly manipulate IndexedDB.

Create interfaces such as:

```text
DataRepository
SyncProvider
AnalyticsProvider
PredictionProvider
AssetProvider
```

Example:

```text
React screen
↓
TrackerService
↓
DataRepository
↓
IndexedDB implementation
```

And separately:

```text
SyncService
↓
SyncProvider
↓
GoogleSheetsAppsScriptProvider
```

This matters because the Google integration is one of the most replaceable parts of the system.

If Apps Script becomes awkward for public distribution later, a direct Google Sheets API provider should be able to replace it without rewriting the application.

---

# 7. Domain Model Overview

The user-facing concept can remain simple:

> Everything I track is a Trackable or an Event.

Internally, the model should be slightly more structured.

Core entities:

1. Category
2. Trackable
3. TrackableVersion
4. TrackableOption
5. Routine
6. RoutineItem
7. EventDefinition
8. EventField
9. LogRecord
10. Observation
11. ObservationOptionSelection
12. EventDailyAssertion
13. RecordRelationship
14. RelationshipAssessment
15. Settings
16. SyncMetadata

Future entities:

17. DerivedFeatureDefinition
18. RelationshipSuggestion
19. RelationshipFeedback
20. Prediction
21. ModelMetadata
22. Asset

---

# 8. Category

Categories exist for organization and presentation.

They must **not determine how data is stored or modeled**.

Default categories:

- Mood & Mental
- Sleep & Energy
- Skin
- Cycle & Reproductive
- Pain
- General Health
- Diet & Hydration
- Medication & Treatment
- Lifestyle & Activity
- Custom / Other

Users should eventually be able to:

- rename categories
- create categories
- reorder categories
- move Trackables between categories
- hide categories

Changing a category must not alter historical observations.

---

# 9. Trackable

A Trackable represents **something measurable**.

Examples:

- Mood
- Fatigue
- Acne severity
- Discharge color
- Pain severity
- Sleep duration
- Calories
- Protein
- Medication effectiveness

Proposed core identity fields:

```text
id
categoryId
active
createdAt
archivedAt
currentVersion
tags
dataRole
```

Trackable identity should remain stable over time.

Meaning-changing properties live in TrackableVersion.

---

# 10. Trackable Versioning

Historical meaning must never change retroactively.

Example:

For six months:

```text
Fatigue
1–5
```

Then user changes it to:

```text
Fatigue
1–10
```

A historical value of 5 cannot suddenly be interpreted as “moderate.”

Therefore semantic changes create a new TrackableVersion.

TrackableVersion may include:

```text
trackableId
version
name
description
inputType
scaleMin
scaleMax
scaleStep
unit
valueDirection
configuration
createdAt
retiredAt
```

Observations record:

```text
trackableId
trackableVersion
```

Changes requiring versioning include:

- scale range
- meaning of scale
- option meanings
- input type
- units when interpretation changes

Purely cosmetic changes such as color/icon may not require versioning.

---

# 11. Trackable Input Types

Core system should support:

## Scale
Examples:
- mood 1–5
- pain 0–10
- fatigue 0–5

Scale points may have:
- numeric value
- display label
- icon
- optional descriptive text

Example:

```text
1 Awful 😭
2 Low 😕
3 Okay 😐
4 Good 🙂
5 Great 🥰
```

## Boolean
Examples:
- nausea today?
- exercised?
- bleeding present?

Must support explicit Yes / No. Unanswered remains separate.

## Single Choice
Example discharge consistency:
- Dry
- Sticky
- Creamy
- Watery
- Egg-white
- Other

## Multi-select
Example acne locations:
- Forehead
- Left cheek
- Right cheek
- Chin
- Jaw
- Back
- Chest

Selections must be stored relationally rather than flattened into one ambiguous text field.

## Number
Examples:
- bowel movement count
- calories
- steps
- weight
- temperature

May include:
- minimum
- maximum
- decimal precision
- unit

## Duration
Examples:
- sleep duration
- exercise duration
- migraine duration
- nap length

Internally store duration in a consistent unit.

## Time
For cases where the user explicitly answers a clock-time question.

## Text / Notes
Optional free text.

Free text must never be the only way to record common categorical data.

---

# 12. Trackable Options

Choice-based Trackables should use stable Option IDs.

Each TrackableOption may contain:

```text
id
trackableId
trackableVersion
storedValue
label
iconRef
colorRef
sortOrder
active
```

Historical observations reference Option IDs, not merely labels.

Renaming “Really bad” to “Severe” therefore does not break historical records.

---

# 13. Icon Architecture

Trackables and TrackableOptions should support:

```text
iconType
iconValue
```

Possible icon types:

```text
library
emoji
customAsset
```

Examples:

```text
library | cloud-rain
emoji   | 😭
custom  | asset_abc123
```

V1 supports:
- built-in icon library
- emoji

Future:
- uploaded icons
- uploaded images

Uploaded assets must not be assumed to live inside Google Sheets.

Future custom assets may use:
- local cached assets
- Google Drive-backed asset storage
- exported backup asset package

The schema must support this later without changing how Trackables reference icons.

---

# 14. Data Role

Trackables/Events should optionally carry a semantic role to help future analysis.

Possible roles:

- symptom
- treatment
- behavior
- exposure
- context
- measurement
- outcome
- other

Examples:

```text
Migraine → symptom
Nurtec → treatment
Sleep duration → measurement
Alcohol → exposure
Travel → context
Iron infusion → treatment
Mood → outcome/symptom
```

This is descriptive metadata.

It must **not automatically imply causation**.

Any Trackable may later become a prediction target regardless of role.

---

# 15. Value Direction

Trackables may optionally describe whether higher values are generally:

```text
better
worse
neutral
```

Examples:

```text
Mood → higher is better
Fatigue → higher is worse
Weight → neutral
Calories → neutral
```

This helps:
- dashboard summaries
- improvement indicators
- coloring
- interpretation

But the system must not make medical judgments from this metadata.

---

# 16. Routine Model

Properties such as:

```text
required
sortOrder
dailyCheckInBehavior
```

must **not** live directly on Trackables.

These properties belong on a **RoutineItem**.

A Trackable describes *what something means.*

A RoutineItem describes *how and when it is asked.*

---

# 17. Routine

V1 ships primarily with:

**Nightly Check-In**

The data model must support future routines such as:
- Morning Check-In
- Weekly Review
- Medication Review
- Flare Check-In

Routine fields:

```text
id
name
icon
active
createdAt
scheduleType
```

Scheduling complexity can remain minimal in V1.

---

# 18. Routine Item

RoutineItem may contain:

```text
routineId
trackableId OR eventDefinitionId
sortOrder
section
enabled
frequency
weekdays
conditionalRule
completionBehavior
trendTrackingMode
eventReminderBehavior
```

Possible frequency values in V1:
- every day
- selected weekdays

Future:
- every N days
- weekly
- monthly
- advanced schedules

---

# 19. Required vs Optional

Avoid hard “required field” behavior that traps users inside a check-in.

Instead use:

```text
completionBehavior:
optional
expected
```

Expected means:

> You left 2 usual questions unanswered. Finish anyway?

The user can still complete the check-in.

This prevents users from inventing fake answers just to satisfy the form.

---

# 20. Conditional Rules

Conditional follow-ups are critical.

Example:

```text
Acne today?
No / Yes
```

If Yes:

```text
Severity
Location
New breakouts
```

Rules must be declarative data, not custom executable JavaScript.

Example conceptual rule:

```text
IF acne_present == true
SHOW acne_severity
```

Supported V1 operators may include:

```text
equals
notEquals
greaterThan
lessThan
contains
isAnswered
```

Future rule complexity can expand.

The rule engine must be reusable across:
- nightly check-in
- event logging
- routine visibility
- treatment follow-ups

---

# 21. Daily Check-In

Primary goal:

**fast, one-screen, one-tap-heavy data entry.**

Home opens directly to a screen where Daily Check-In is one of two dominant actions.

Daily Check-In should be:
- vertically scrolling
- grouped by category
- collapsible
- conditional
- icon-friendly
- autosaving locally
- resumable

Example:

```text
Mood & Mental

Overall mood
😭 😕 😐 🙂 🥰

Depression
0 1 2 3 4 5

Irritability
0 1 2 3 4 5
```

Then:

```text
Skin

Acne today?
No   Yes
```

Selecting Yes expands:

```text
Severity
Mild / Moderate / Bad / Severe

Location
Chin / Jaw / Cheeks / Forehead
```

---

# 22. Check-In Completion

A Daily Check-In has explicit state:

```text
draft
completed
```

A check-in becomes completed when the user intentionally taps:

**Finish Check-In**

Completion does not require every optional Trackable to have a value.

This state drives the History calendar indicator.

---

# 23. Autosave Behavior

Every answer:

1. saves locally immediately
2. updates draft state
3. does not necessarily trigger a Google Sheet call

Remote syncing should be batched/debounced.

Suggested sync moments:
- after finishing check-in
- after saving event
- when app goes to background
- periodic debounce
- when app reopens
- manual Sync Now

Do **not** send one Apps Script request per tap.

---

# 24. Subjective Trend Tracking

Many Trackables may optionally ask:

> Compared with yesterday?

Possible mode:

```text
Better
Same
Worse
```

Another mode:

```text
New
Improving
Same
Worsening
```

This value is **separate from the actual measurement**.

Example:

```text
Fatigue = 4/5
Subjective trend = Better
```

Both are meaningful.

The app should ask the current value first so yesterday’s state does not anchor the user’s rating.

RoutineItem configuration controls whether trend tracking appears.

---

# 25. Event Model

An Event represents something that happened at a particular time or over a period.

Examples:
- migraine
- headache
- bowel movement
- medication taken
- iron infusion
- exercise
- period start
- travel
- sexual activity
- food reaction
- heating pad treatment

Events may occur multiple times per day.

---

# 26. Event Definition

EventDefinition describes a reusable event type.

Fields may include:

```text
id
name
description
categoryId
iconRef
colorRef
timingMode
dataRole
active
nightlyReminderDefault
treatmentFollowUpEnabled
createdAt
```

Possible timing modes:

```text
point
duration
either
dayOnly
```

---

# 27. Event Fields

An Event may contain follow-up Trackables.

Migraine:

```text
Severity
Aura?
Location
Notes
```

Bowel movement:

```text
Bristol type
Urgency
Pain
```

Exercise:

```text
Type
Duration
Intensity
```

These are Trackables attached to EventDefinition via EventField configuration.

Do not hard-code migraine-specific UI logic.

---

# 28. Generic Log Record

Use a generic LogRecord container for recorded activity.

Conceptually:

```text
id
recordKind
routineId
eventDefinitionId
localDate
timePrecision
startTime
endTime
timezone
status
createdAt
updatedAt
deletedAt
revision
source
```

recordKind may be:

```text
routine
event
momentary
```

Observations attach to LogRecords.

---

# 29. Observation

Observation stores an answer/value attached to a LogRecord.

Conceptually:

```text
id
logRecordId
trackableId
trackableVersion
valueKind
numericValue
booleanValue
textValue
durationValue
timeValue
trendValue
createdAt
updatedAt
deletedAt
revision
```

Choice selections are stored separately using stable Option IDs.

The model should avoid overloading a single generic text field for all values.

---

# 30. Time Precision

Time handling must explicitly preserve uncertainty.

Possible precision:

```text
exact
approximate
day
unknown
```

Example:

User logs migraine immediately:

```text
start = 10:14 AM
precision = exact
```

At night user remembers:

> Oh yeah, I had a migraine earlier.

Record:

```text
localDate = Aug 10
startTime = null
precision = day
```

Do not invent noon or another fake timestamp.

---

# 31. Timezones

For timestamped records, preserve:

```text
UTC timestamp
local date
IANA timezone where possible
```

This helps avoid problems from:
- daylight saving time
- travel
- timezone changes
- day-boundary analysis

Daily Check-Ins primarily belong to a local calendar date.

---

# 32. Events in Nightly Check-In

Events can optionally appear in a routine.

Routine Event Reminder behavior:

```text
always
if_not_logged
never
```

Example:

Headache = `if_not_logged`

If headache already logged:

```text
🤕 Headache
✓ Logged at 2:14 PM

Add another
```

If none logged:

```text
Any headache today?

No
Yes
```

Selecting Yes creates an untimed event if the user does not provide a time.

---

# 33. Explicit Event Absence

This is critical.

“No migraine today” is useful information.

Simply having no Migraine event does **not** mean no migraine occurred.

Therefore introduce:

**EventDailyAssertion**

Possible state:

```text
occurred
did_not_occur
unknown
```

Fields:

```text
id
date
eventDefinitionId
status
sourceRoutineId
recordedAt
updatedAt
revision
```

Rules:

- an actual event record implies occurrence
- nightly explicit No creates did_not_occur
- skipped question remains unknown
- if event later gets recorded after a No, occurrence overrides/reconciles the previous assertion rather than leaving contradictory truth

This dramatically improves future ML quality.

---

# 34. Event Relationships

Relationships must not be implemented as special migraine fields.

Use a generic relationship entity.

RecordRelationship:

```text
id
sourceRecordId
targetRecordId
relationshipType
provenance
confirmedByUser
createdAt
updatedAt
deletedAt
revision
metadata
```

Example:

```text
Migraine event
↓ treated_by
Nurtec event
```

Other possible future relationship types:

```text
treated_by
triggered_by
associated_with
followed_by
caused_by_user_claim
part_of
```

The application itself should be cautious about automatically asserting causal relationship types.

---

# 35. Relationship Provenance

Relationship should record how it was created:

```text
manual
user_confirmed_suggestion
system_inferred
imported
```

System-inferred relationships should remain clearly distinguishable from user-confirmed relationships.

---

# 36. Treatment Relationships

The first major relationship use case:

Symptom Event → Treatment Event.

Example:

```text
Migraine 10:00 AM
↓ treated_by
Nurtec 10:20 AM
```

Or:

```text
Period cramps
↓ treated_by
Heating pad
```

Therefore nightly follow-up wording should be:

**Did you treat this?**

Not:

> Did you take medication?

Treatment may include:
- medication
- heat
- ice
- rest
- stretching
- food
- hydration
- therapy
- exercise
- another custom intervention

---

# 37. Suggested Event Association

If:

```text
Migraine = 10:00 AM
Nurtec = 10:20 AM
```

the system may suggest:

> Was your 10:20 AM Nurtec used to treat this migraine?

User confirmation creates the relationship.

This is only a convenience heuristic.

Do not silently infer relationships from timing.

---

# 38. Relationship Assessment / Treatment Effectiveness

A relationship can have structured assessments.

For treatment relationships, default question:

> Did it help?

Suggested options:
- Not at all
- A little
- Moderately
- A lot
- Completely
- Unsure

**Unsure is required.**

Forcing users to provide false certainty creates bad data.

RelationshipAssessment may support:

```text
id
relationshipId
assessmentType
trackableId
value
recordedAt
```

Future relationship assessments may include:
- effectiveness
- side effects
- duration until relief
- user confidence

---

# 39. Event Pinning / Quick Log

Home → Log Event should show:

### Pinned
User-selected frequent events.

### Recent
Recently logged events.

### Other Event
Full event library/search.

Example:

```text
🤕 Headache
💊 Medication
🩸 Period started
🔥 Cramps
+ Other
```

---

# 40. Home Screen

The application should open directly to Home.

Top region:

**modular hero area**

Initial V1 content may include:
- cute illustration
- theme artwork
- quote
- positive message
- humorous message

The architecture should allow this region to later become prediction-driven.

Immediately beneath:

Two highly prominent side-by-side actions:

```text
Daily Check-In
Log Event
```

No navigation should be required to reach either.

---

# 41. Home — Today Section

Below primary actions:

```text
Today

Daily Check-In: Not completed

Events:
🤕 Migraine 2:14 PM
💊 Nurtec 2:32 PM
```

Possible compact mini-summary or mini-chart may appear below.

Do not turn Home into the full dashboard.

---

# 42. Bottom Navigation

Locked V1 navigation:

```text
Home
Trends
History
Trackables
Settings
```

Daily Check-In and Log Event are Home actions, not bottom-nav tabs.

---

# 43. History Screen

History answers:

> What did I record and when?

Primary interface:

**calendar**

Calendar cells should communicate:
- completed nightly check-in
- incomplete/draft check-in
- no check-in
- events

Example:

```text
✓
🤕 💊
```

If many events:

```text
🤕 💊 +3
```

Tapping a date opens Day Details.

---

# 44. History Day Details

Example:

```text
Monday, August 10

✓ Daily Check-In

Mood 🙂 4/5
Energy ⚡ 3/5
Acne 🌸 Moderate — Worse
Discharge 💧 Creamy

Events

10:00 AM 🤕 Migraine — severity 4
↳ 10:20 AM 💊 Nurtec
↳ Effectiveness: A little

3:45 PM 🔥 Cramps
↳ Heating pad
↳ Effectiveness: A lot
```

Actions:
- edit
- delete
- restore
- add forgotten event
- finish incomplete check-in

---

# 45. Calendar Visualization Mode

A major feature.

Calendar can be recolored/re-encoded by Trackable.

Example selector:

```text
Color calendar by:

Completion
Mood
Acne
Fatigue
Pain
+ Choose metric
```

For numeric/ordinal Trackables:
- intensity scale

For categorical Trackables:
- option color and/or icon

Accessibility requirement:

**color cannot be the only encoding.**

Use:
- icons
- pattern
- label
- tooltip
- text detail

where appropriate.

---

# 46. History Search — V1 Requirement

Search is mandatory in V1.

Use cases:
- “When was my last iron infusion?”
- “When did I take Nurtec?”
- “Find all migraines.”
- “When did this flare happen?”
- “Search notes for travel.”

Search should include:
- event names
- Trackable names
- option labels
- treatment names
- categories
- tags
- notes

Results sorted newest first by default.

---

# 47. Last Occurrence

Search and Event detail may display:

```text
Iron Infusion

Last recorded:
July 7, 2026

34 days ago
```

This is valuable before ML exists.

The same time-difference engine can later produce derived features.

---

# 48. Trends Screen

Trends answers:

> What patterns exist in my data?

History and Trends remain separate.

History = records.

Trends = interpretation.

---

# 49. V1 Trends Structure

Suggested sections:

## At a Glance
Examples:
- 7-day average mood
- 7-day average fatigue
- biggest improvement
- biggest worsening
- days since pinned event
- events this month

Users select favorite Trackables.

## Timeline
Choose 1–3 Trackables.

Optional event overlays.

Example:

```text
Mood
Fatigue
Energy
+
Iron infusion markers
Migraine markers
```

## Calendar Heatmap
Same calendar visualization technology, used analytically.

## Event Statistics
Examples:
- migraines this month
- average severity
- average duration
- most common treatments
- treatment-effectiveness distribution
- days since last iron infusion

## Relationships
User manually selects:

```text
Metric A
vs.
Metric B
```

Possible later controls:

```text
Same day
1 day later
3 days later
7 days later
```

---

# 50. Suggested Relationships — Future

The application should eventually automatically surface interesting associations.

Wording must remain cautious.

Example:

> These things **might** be related.

> Higher joint pain has tended to occur on days with higher work stress.

Controls:

```text
Explore
Not meaningful
```

Never phrase an observational relationship as established causality.

---

# 51. Relationship Types for Analytics

Future relationship discovery should distinguish:

## Concurrent
```text
Pain ↑
Stress ↑
on the same day
```

## Leading / Lagged
```text
Poor sleep
↓
higher fatigue 1–2 days later
```

## Event-relative
```text
Iron infusion
↓
energy changes over the following 14 days
```

## Frequency-based
```text
More migraines during weeks with X
```

---

# 52. Relationship Feedback

When the user says:

**Not meaningful**

store that feedback.

Future structure:

```text
relationshipKey
trackableA
trackableB
lag
analysisType
userVerdict
createdAt
```

Possible verdicts:

```text
dismissed
interesting
known
```

User dismissal should stop repetitive suggestions.

Important:

User feedback should initially control **presentation**, not automatically rewrite statistical truth or model training.

Possible future UX:

```text
Not this relationship
Never compare these
```

Rejecting one lag should not necessarily reject every lag unless explicitly requested.

---

# 53. Future Predictions

Predictions should eventually become a major component of Trends.

Possible presentation:

```text
Your Outlook

Energy tomorrow:
Low–moderate

Acne flare in next 5 days:
68%

Mood tomorrow:
Likely stable
```

Prediction cards should include:
- predicted outcome
- horizon
- uncertainty/confidence
- most influential recent factors where feasible
- model freshness
- data sufficiency

---

# 54. Morning Widget Prediction Mode — Future

The Android widget should eventually change based on time of day.

Morning / afternoon:

```text
Today's Outlook

Mood: likely 3–4
Energy: moderate
Acne: mild
```

Optional quote:

> Your model has been wrong before. Go ruin its confidence interval.

Evening:

```text
Ready for today's check-in?

Log today
```

After completion:

```text
✓ Today complete
```

---

# 55. Prediction Targets

Do not assume every Trackable must be predicted.

Future Trackable/analytics configuration should allow:

```text
Use as prediction target
Yes / No
```

Target types may include:
- numeric value
- ordinal class
- categorical class
- event probability
- event count
- duration

The Prediction schema must support multiple output types.

---

# 56. Derived Features

Derived features are calculated data used by analytics/ML.

They must never overwrite raw observations.

Examples:

```text
days_since_iron_infusion
migraines_last_7_days
average_sleep_last_3_days
days_since_last_migraine
fatigue_rolling_7_day
```

---

# 57. “Days Since” Design

Do **not** blindly create “days since” for every Event.

Instead separate:

1. possible feature generation
2. actual model feature selection

Events may later contain feature hints such as:

```text
timeSinceLast
countInWindow
durationInWindow
timeSinceEnded
```

Preset defaults may be sensible.

### Iron infusion
Useful candidates:

```text
days since last infusion
infusions in previous 90 days
```

### Migraine
Useful candidates:

```text
days since migraine
migraines last 7 days
migraines last 30 days
time since last migraine ended
```

The model decides whether those candidates are actually predictive.

---

# 58. Feature Explosion Prevention

Not every possible transformation should be generated automatically.

Future system should support:
- preset feature hints
- user-enabled features
- automatic feature selection
- model regularization
- minimum sample requirements

The analytics layer should not generate thousands of useless columns simply because it can.

---

# 59. Time Leakage Prevention

Future ML must strictly avoid using future information to predict the past.

Example:

Morning widget predicts Mood for August 10.

It cannot use:

```text
migraine that occurred August 10 at 4 PM
```

because that information did not exist at prediction time.

Every feature generation operation must respect a **prediction cutoff timestamp**.

This should be treated as a foundational ML requirement.

---

# 60. Cycle Prediction

The tracker may eventually infer cyclical patterns.

Do not require users to manually label:

```text
follicular
ovulatory
luteal
```

unless they intentionally want to.

The system should be capable of learning periodic patterns from:
- bleeding
- discharge
- symptoms
- mood
- skin
- other measurements

without requiring assumptions about cycle phase.

---

# 61. Treatment Analytics

Relationships between Symptoms and Treatments should eventually support:
- treatment use frequency
- reported effectiveness
- average symptom duration after treatment
- treatment timing relative to symptom onset
- effectiveness by symptom severity
- effectiveness over time

Examples:

```text
Nurtec taken within 30 minutes
vs.
later
```

or:

```text
Heating pad
Effectiveness distribution
```

These should remain observational statistics unless stronger inference methods are intentionally added.

---

# 62. Themes

Themes are a future major personalization feature.

V1 must be implemented using design tokens from day one.

Never hard-code:

```text
background = pink
```

Use semantic tokens such as:

```text
theme.background
theme.surface
theme.primary
theme.secondary
theme.accent
theme.text
theme.mutedText
theme.border
theme.success
theme.warning
theme.danger
theme.chartSeries
```

Initial theme:

**girly pink/purple cutesy fantasy**

Possible future themes:
- dark celestial
- cottagecore
- minimal
- botanical
- monochrome
- cozy autumn
- user-created

Theme changes must not affect application logic.

---

# 63. Theme Assets

Theme may eventually include:
- hero illustration
- decorative motifs
- quote collection
- icon style
- chart palette
- card radius
- shadows
- motion style

Do not couple page components directly to theme asset filenames.

---

# 64. Accessibility

Required foundations:
- large touch targets
- keyboard navigation on web
- semantic form controls
- screen-reader labels
- visible focus states
- scalable text
- sufficient contrast
- reduced-motion support
- icons paired with labels
- chart meaning not dependent solely on color
- calendar meaning not dependent solely on color

“Cute” must not mean inaccessible.

---

# 65. Preset Categories + Trackables

## Mood & Mental
- Overall Mood
- Depression
- Anxiety
- Irritability
- Stress
- Motivation
- Focus
- Brain Fog
- Emotional Sensitivity

Focus and Brain Fog remain separate.

Focus:
> ability to sustain attention/concentrate.

Brain Fog:
> subjective cognitive fuzziness, slow thinking, memory/word-finding difficulty.

## Sleep & Energy
- Energy Level
- Fatigue
- Sleep Duration
- Sleep Quality
- Trouble Falling Asleep
- Nighttime Awakenings
- Nap

## Skin
- Acne Present
- Acne Severity
- Acne Location
- New Breakouts
- Oiliness
- Dryness
- Itching
- Rash / Flare Severity
- Custom Skin Flare Template

## Cycle & Reproductive
- Discharge Volume
- Discharge Consistency
- Discharge Color
- Bleeding / Flow
- Cramps
- Libido
- Breast Tenderness
- Pelvic Pain
- Period Started
- Period Ended
- Sexual Activity

Recommended Discharge Color options:
- Clear
- White
- Cream
- Yellow
- Green
- Gray
- Brown
- Pink
- Red
- Other

Red must obviously exist.

Bleeding remains separate from general discharge because flow/spotting is analytically distinct.

## Pain
- Overall Pain
- Headache
- Migraine
- Joint Pain
- Muscle Pain
- Back Pain
- Pain Location

Headache and Migraine can both be Events.

## General Health
Includes digestive and general physical symptoms.

- Overall Symptom Severity
- Condition / Autoimmune Flare
- Abdominal Pain
- Bloating
- Nausea
- Bowel Movement
- Bowel Movement Count
- Urgency
- Stool Type
- Reflux / Heartburn
- Dizziness
- Temperature / Fever
- Swelling
- Congestion
- General Illness
- Weight

## Diet & Hydration
- Appetite
- Water Intake
- Caffeine
- Alcohol
- Calories
- Protein
- Carbohydrates
- Fat
- Meal Skipped
- Specific Food / Exposure
- Diet Quality
- Food Reaction

Calorie/macronutrient tracking should be available but not forced during onboarding.

## Medication & Treatment
- Medication Taken
- PRN Medication
- Supplement
- Injection
- Infusion
- Treatment / Therapy
- Dose
- Medication Side Effects
- Treatment Effectiveness

Named medications/treatments become user-defined EventDefinitions based on presets.

## Lifestyle & Activity
- Exercise
- Activity Level
- Steps
- Time Outdoors
- Social Activity
- Work / School Stress
- Screen Time
- Travel
- Major Stressor
- Sick Day / Rest Day

---

# 66. Preset Packs

## Cycle Tracking
Recommended:
- discharge volume
- discharge consistency
- discharge color
- bleeding
- cramps
- libido
- acne
- mood

## Skin Tracking
- acne
- acne location
- breakouts
- oiliness
- dryness
- flare severity

## Chronic Illness
- fatigue
- energy
- sleep
- pain
- flare severity
- digestive symptoms
- medication/treatment

## Mood & Energy
- overall mood
- depression
- anxiety
- irritability
- stress
- energy
- fatigue
- sleep

## Treatment Effectiveness
Possible future pack:
- symptom severity
- treatment events
- treatment effectiveness
- symptom duration

---

# 67. Trackable Setup UX

Adding Trackable:

```text
Preset
or
Create Custom
```

Custom setup should ask only what is necessary.

Possible fields:

```text
Name
Category
Input Type
Scale/options
Icon
Color
Logging style
Add to nightly check-in?
Track changes?
```

Advanced options should be collapsible.

Do not confront new users with the full schema.

---

# 68. Local Storage Philosophy

The application is **local-first**, not local-only.

When the user records data:

1. local data saves immediately
2. the UI considers the action successful
3. sync occurs separately

Poor internet connection must not prevent logging.

---

# 69. Google Sheet Role

Google Sheet serves as:
- cloud replica
- disaster recovery source
- cross-device recovery mechanism
- human-readable dataset
- easy external analysis source

It is not the only copy.

---

# 70. Restoration Semantics

First-launch UX:

```text
Start Fresh

Restore Existing Data
```

Restore Existing Data opens:

```text
Reconnect Google Sheet
Import Backup File
```

## Reconnect Google Sheet

Used when:
- new phone
- reinstall
- stolen/lost phone
- local data wiped
- user starts web app on new device

Process:
1. connect app-format Sheet
2. validate metadata/schema
3. download definitions/settings/history
4. rebuild local store
5. resume synchronization

## Import Backup

Used when user has an exported application backup file.

Backup is a point-in-time snapshot.

It does not automatically imply continued Google synchronization.

After import, offer:
- Connect existing Sheet
- Create new Sheet
- Continue locally

---

# 71. Legacy Dataset Import

An old Excel/CSV dataset is **not a backup**.

Future feature:

**Import Historical Data**

Possible workflow:
1. upload CSV/XLSX
2. identify date column
3. map columns to Trackables
4. map old categorical values to options
5. preview
6. validate
7. import

This will be particularly important for users with years of historical spreadsheets.

Architecture must allow imported historical observations to coexist with app-created records.

---

# 72. Google Sheet Structure

Possible workbook tabs:

```text
Meta
Categories
Trackables
TrackableVersions
TrackableOptions
Routines
RoutineItems
EventDefinitions
EventFields
LogRecords
Observations
ObservationSelections
EventDailyAssertions
Relationships
RelationshipAssessments
Settings
Daily View
Events View
```

Not all raw tabs need to be front-and-center for normal users.

---

# 73. Human-Friendly Sheet Views

## Daily View

```text
Date | Mood | Energy | Acne | Discharge | Pain | ...
```

This gives the familiar wide spreadsheet format without forcing the application's canonical data model to use that structure.

## Events View

```text
Date
Time
Event
Severity
Treatment
Effectiveness
```

These are views/exports, not the source schema.

---

# 74. Direct Sheet Editing

To preserve sync integrity:

The app-managed normalized tabs should be treated as canonical application data.

Users may inspect and analyze them.

Direct manual editing should not initially be the recommended workflow.

The generated human-friendly views should primarily exist for:
- transparency
- analysis
- charting
- export

If full bidirectional manual Sheet editing is later supported, it must have explicit conflict and validation behavior.

Do not accidentally promise bidirectional arbitrary spreadsheet editing in V1.

---

# 75. Sync Metadata

Every synced entity should include:

```text
id
createdAt
updatedAt
deletedAt
revision
```

Optional:

```text
originDeviceId
```

Use UUIDs.

Never rely on spreadsheet row number as identity.

---

# 76. Sync Conflicts

Design for more than one client even if V1 primarily uses one phone.

Example:
- phone edits Mood
- web app edits same entry before sync

The sync protocol should eventually detect revision mismatch.

Possible behavior:

```text
serverRevision = 4
clientBaseRevision = 3
```

→ conflict.

V1 may use simple conflict handling, but revision fields should exist from the beginning.

Avoid depending entirely on device timestamps because device clocks can disagree.

---

# 77. Soft Deletion

Deleting data should initially set:

```text
deletedAt
```

rather than immediately removing the row.

Advantages:
- Undo
- Recently Deleted
- safer synchronization
- recovery from accidental deletion

Permanent purge can happen later through explicit action.

---

# 78. Backup Format

V1 JSON backup containing:
- categories
- Trackables
- Trackable versions
- options
- routines
- event definitions
- event fields
- records
- observations
- event assertions
- relationships
- relationship assessments
- settings
- metadata

Future custom assets may require a package such as:

```text
tracker-backup.zip
  data.json
  assets/
```

Backup format should have:

```text
backupVersion
schemaVersion
createdAt
appVersion
```

---

# 79. CSV Export

CSV export is for analysis, not full-fidelity restore.

Provide:
- Daily wide-format CSV
- Events CSV
- possibly normalized/raw CSV exports

JSON is the authoritative backup format.

---

# 80. Google Apps Script Sync API

Initial conceptual operations:

```text
healthCheck
getMetadata
pullAll
pullChanges
pushBatch
validateSchema
```

Push operations should batch records.

The application should be able to determine:

```text
last successful sync
pending changes
sync error
```

Settings should visibly show:

```text
✓ Synced 4:46 PM
```

or:

```text
3 changes waiting to sync
```

---

# 81. Google Integration Risk

Google synchronization is one of the few architecture areas that should be technically prototyped early.

Before building large amounts of UI, create a small sync spike proving that:

1. the PWA can authenticate/connect appropriately
2. the Android Capacitor build can sync
3. data can be read and written reliably
4. reconnecting can fully rebuild the local store
5. the chosen Apps Script deployment model is acceptable for a shareable open-source product

If Apps Script proves too awkward, replace the SyncProvider.

Do not contort the entire application around one Google integration approach.

---

# 82. Privacy

The public/open-source product should be privacy-first.

Default principles:
- no centralized health database
- no advertising
- no user-data sale
- no remote analytics required
- no health data committed to GitHub
- no secrets committed to repository
- users own their Sheet
- local data remains local except chosen sync/export

If optional analytics are ever added, they should be transparent and opt-in.

---

# 83. Open-Source Distribution

Repository should contain:
- application source
- Apps Script source
- setup instructions
- blank/template Sheet instructions
- preset definitions
- sample/demo data only
- no personal production data

Potential license can be chosen later.

---

# 84. GitHub Pages Web Version

The public web version should:
- use the same React application
- function responsively on desktop/mobile
- support PWA installation
- provide offline access where feasible
- not contain user-specific secrets at build time

User-specific Sheet connection information belongs in local configuration.

---

# 85. Android App

Capacitor Android build should reuse the React UI.

Native Android code is reserved for features such as:
- home-screen widget
- native deep links
- possibly local notifications later
- potentially more durable native integrations if needed

Do not recreate the entire UI natively.

---

# 86. Android Widget V1

Initial widget:

```text
Today

✓ Logged
```

or:

```text
Daily Check-In
Not completed

Log today →
```

Widget tap deep-links directly to Daily Check-In.

Possible second action:

```text
Log Event
```

if layout allows.

---

# 87. Widget Data Architecture

The Android widget should not need to query Google Sheets.

Widget uses local summarized state.

Whenever relevant app data changes, the app updates the native widget state.

Future widget may display:
- predictions
- selected metrics
- quote
- recent event
- completion
- treatment reminder

---

# 88. iPhone Support

Initial public support:
- responsive web
- installable PWA/home-screen experience

Native iOS can be added later through the same general Capacitor architecture if desired.

Do not make native iOS distribution a V1 blocker.

---

# 89. Settings

## Data & Sync
- Google Sheet connection
- last sync
- Sync Now
- reconnect
- create replacement Sheet
- export backup
- import backup
- CSV export

## Tracking
- Trackables
- Categories
- Nightly Check-In
- Events
- pinned events
- routines

## Appearance
- Theme
- reduced motion
- future theme settings

## Widget
- widget preferences
- future prediction metrics
- future quote preferences

## Preferences
- units
- time format
- date format
- first day of week

## Privacy / Data
- delete local data
- reset app
- disconnect Google Sheet
- permanently delete records

---

# 90. Onboarding

## Step 1

```text
Welcome

Start Fresh
Restore Existing Data
```

## Restore

```text
Reconnect Google Sheet
Import Backup
```

## Start Fresh

Ask:

> What would you like to understand better?

Possible choices:
- Cycle patterns
- Chronic symptoms
- Mood
- Skin
- Treatment effectiveness
- Sleep & energy
- General wellness

This is only used to recommend Trackables/packs.

## Preset Packs
Suggest relevant packs.

User can:
- add
- remove
- customize

## Check-In Setup
Select:
- nightly Trackables
- nightly event reminders
- favorite/pinned Events

## Theme
Initial theme selected by default.

Architecture supports later choices.

## Google Sync
Offer:
- Connect Google Sheets
- Set up later

The tracker must work locally without Google setup.

---

# 91. Home Hero Content

Hero region is modular.

Potential V1 sources:
- theme quote library
- static illustration
- randomized positive message

Future:
- prediction summary
- smart insight
- time-of-day content

The Hero module should receive data, not contain prediction logic itself.

---

# 92. Positive / Funny Messaging

Tone can be playful.

Avoid messaging that:
- shames low mood
- pressures positivity
- trivializes symptoms
- presents prediction as destiny

The app may contain humorous lines such as:

> Your model has been wrong before. Go ruin its confidence interval.

But humor should be optional/theme-driven later if shared publicly.

---

# 93. Search Architecture

History Search should be built on structured indexed data.

Searchable entities:
- EventDefinition name
- Trackable name
- option label
- notes
- category
- tags
- treatment names

Possible future natural-language search can be added later.

V1 can use straightforward text/filter matching.

---

# 94. Search Result Summary

For event-like queries:

```text
Iron Infusion

Last recorded:
July 7

34 days ago

7 total records
```

Then list matching dates.

This creates immediate practical value.

---

# 95. Trends Customization — V1

Do not build full Tableau.

Support:
- favorite/pinned metric cards
- choose chart metric
- choose date range
- basic ordering
- event overlays
- save a few chart preferences

Future:
- full drag/drop dashboard
- resize
- custom dashboards
- advanced chart builder

---

# 96. Chart Types

System should eventually support:
- line/time series
- calendar heatmap
- bar chart
- distribution/histogram
- event timeline
- scatter plot
- rolling-average trend
- treatment-effectiveness summary
- lag/relationship plots

Visualization type should depend on Trackable type.

Avoid forcing categorical data into inappropriate line charts.

---

# 97. Prediction Data Structure — Future

Prediction entity should support:

```text
id
targetTrackableId
targetDate
targetTime
predictionType
predictedValue
probability
lowerBound
upperBound
generatedAt
modelId
modelVersion
featureCutoff
explanation
```

Not every field applies to every prediction.

Prediction types may include:

```text
numeric
ordinal
categorical
eventProbability
count
duration
```

---

# 98. Model Metadata — Future

Store:

```text
modelId
modelType
version
trainedAt
trainingWindow
target
featureSet
validationMetrics
minimumDataRule
```

Prediction results must identify the model version that produced them.

This allows model comparisons later.

---

# 99. Minimum Data Requirements — Future

Do not generate authoritative-looking predictions from tiny datasets.

Before predictions:

> Still learning your patterns.

Possible stages:
- insufficient data
- baseline available
- moderate confidence
- established personal model

Thresholds depend on model/task.

---

# 100. Analytics vs Medical Interpretation

The app may say:

> These things might be related.

It should not automatically say:

> X causes Y.

Predictions and correlations are personal observational analytics, not diagnosis.

If shared publicly, this distinction should be clear in product copy.

---

# 101. Schema Migrations

Every local dataset, Sheet, and backup should contain:

```text
schemaVersion
```

On application update:
1. inspect schema
2. run migrations
3. preserve backup/recovery path
4. never silently discard unsupported data

Migration logic must be tested.

---

# 102. Preset Versioning

Presets should have stable IDs.

Example:

```text
preset.mood.overall
preset.skin.acne_severity
preset.event.migraine
```

A user selecting a preset creates their own instance.

Future changes to the bundled preset should not silently rewrite customized user definitions.

---

# 103. No Magic IDs in UI Code

Components must not contain logic like:

```text
if trackable.id == acne
```

unless that behavior is truly system-specific.

Rendering should primarily derive from:
- input type
- configuration
- rules
- roles
- relationships

This is essential for custom Trackables.

---

# 104. No Medical Logic Hard-Coding

Do not write:

```text
Migraine always has medication.
```

Instead:

```text
EventDefinition
treatmentFollowUpEnabled = true
```

The same engine supports:
- cramps + heating pad
- eczema + topical cream
- migraine + medication
- muscle soreness + ice
- reflux + antacid

---

# 105. Suggested Repository Structure

Conceptual structure:

```text
src/
  app/
  domain/
    models/
    rules/
    validation/
  data/
    repository/
    local/
    sync/
  features/
    onboarding/
    home/
    checkin/
    events/
    history/
    trends/
    trackables/
    settings/
  analytics/
  predictions/
  presets/
  themes/
  components/
  utilities/

apps-script/

android/

tests/

docs/
```

Do not create a monorepo unless genuinely useful.

---

# 106. Coding Boundaries

Components should not:
- know spreadsheet column numbers
- know Apps Script endpoints
- perform migrations
- implement feature engineering
- contain raw sync logic

Domain/data services handle these responsibilities.

---

# 107. Runtime Validation

Runtime validation should exist around:
- imported backup
- Google Sheet data
- preset definitions
- user-created Trackables
- sync payloads
- migrations

TypeScript compile-time typing alone is insufficient for external data.

Specific validation library may be chosen during implementation.

---

# 108. Testing Priorities

Highest-priority unit tests:
- conditional-rule engine
- missing-vs-zero behavior
- event absence assertions
- Trackable versioning
- soft deletion
- sync conflict handling
- date/time precision
- relationship linking
- backup roundtrip
- schema migration
- derived “days since” calculations

---

# 109. Integration Tests

### Daily flow

```text
open app
answer Trackables
conditional field appears
finish
close
reopen
data remains
```

### Event flow

```text
log migraine
log Nurtec
suggest relationship
confirm
record effectiveness
```

### Recovery flow

```text
new empty device
connect Sheet
rehydrate
history matches original
```

### Offline flow

```text
disable network
log check-in
save event
restore connection
sync successfully
```

---

# 110. Accessibility Testing

Before V1 release:
- keyboard-only web navigation
- screen-reader form labels
- contrast
- reduced motion
- 320px-width layouts
- large text
- calendar alternate encoding
- chart labels

---

# 111. Performance Expectations

Dataset scale is modest but may span years.

Design assumption:
- one user
- potentially thousands of days
- tens of thousands of observations
- many events
- many custom Trackables

Avoid algorithms that repeatedly scan every record for every render.

Analytics may use cached indexes/aggregations.

---

# 112. Data Indexing

Local data should be efficiently searchable by:
- localDate
- Trackable ID
- EventDefinition ID
- updatedAt
- deletedAt
- category
- record type

This supports:
- History calendar
- search
- incremental sync
- Trends

---

# 113. Google Sheet Deletion Recovery

If connected Sheet disappears:

```text
⚠ Connected spreadsheet unavailable.
```

Local data remains intact.

Offer:
- Reconnect
- Create replacement Sheet
- Continue locally

Creating replacement should rebuild remote data from the local dataset.

---

# 114. Local Loss Recovery

If phone is lost/reinstalled:

```text
Restore Existing Data
→ Reconnect Google Sheet
```

Application pulls:
- definitions
- settings
- historical records
- relationships

and reconstructs local storage.

This recovery capability is a primary requirement, not an afterthought.

---

# 115. Multiple Device Future

Even though primarily designed for one person/device, the web application means multiple clients are plausible.

Therefore:
- permanent IDs
- revisions
- incremental sync
- conflict detection
- tombstones

must exist.

Full collaborative simultaneous editing is not required.

---

# 116. Relationship Graph Scalability

RecordRelationship effectively forms a graph.

Example:

```text
Migraine
├── treated_by → Nurtec
├── treated_by → Ice pack
└── associated_with → Nausea
```

Do not store nested event objects that require duplicating child data.

Relationships reference IDs.

This allows future visualization and network analysis without migrations.

---

# 117. Future Smart Relationship Suggestions

Potential candidate generation:
- temporal proximity
- frequent co-occurrence
- repeated lagged patterns
- event-relative changes
- treatment-response patterns

Statistical thresholds must prevent flooding the user with nonsense.

The goal is:

> Interesting, I hadn't noticed that.

not:

> Here are 400 correlations.

---

# 118. Historical Data Quality

Imported or backfilled observations may have lower time precision.

Preserve source metadata:

```text
source:
app
nightly_backfill
manual_history
legacy_import
google_restore
```

This may later help the model interpret reliability.

---

# 119. Notes

Notes remain optional and primarily human-readable.

Do not require NLP for V1.

Future text analysis could exist but must be opt-in and separate from the structured data model.

---

# 120. V1 Acceptance Criteria

A usable V1 should allow a user to:

1. install/open app
2. start fresh
3. select preset Trackables
4. create a custom Trackable
5. configure Nightly Check-In
6. log a complete nightly check-in
7. have conditional follow-ups work
8. log an Event
9. log repeated Events
10. record an untimed forgotten Event
11. link a Treatment to a Symptom
12. record Treatment effectiveness
13. search History
14. view calendar completion
15. view Event icons on calendar
16. recolor calendar by a Trackable
17. view/edit a historical day
18. view basic Trends
19. export CSV
20. export JSON backup
21. restore backup
22. connect/sync Google Sheet
23. rebuild local state from Sheet
24. operate offline
25. use Android app
26. use web/PWA
27. use simple Android widget
28. switch future-ready theme tokens without breaking UI

---

# 121. Development Order

Do **not** ask Codex to “build the app.”

Build vertical slices.

## Milestone 0 — Technical Skeleton

Create:
- React
- TypeScript
- routing
- design-token/theme system
- basic domain types
- storage interface
- placeholder local repository
- bottom navigation
- blank core screens

Screens:

```text
Home
Trends
History
Trackables
Settings
```

No polished functionality yet.

## Milestone 0.5 — Google Sync Spike

Before investing heavily:

Build a tiny proof-of-concept.

Test:

```text
local record
→ Apps Script
→ Google Sheet
→ read back
```

Test from:
- normal browser
- GitHub-hosted test build
- Capacitor Android build

Also test restore from Sheet.

If Apps Script design is poor, replace SyncProvider now.

## Milestone 1 — Trackable Engine

Implement:
- categories
- Trackables
- version definitions
- options
- presets
- custom Trackable creation
- icons
- local persistence

No Google dependency required for UI testing.

## Milestone 2 — Nightly Check-In

Implement:
- routine
- RoutineItems
- one-page dynamic form
- conditional rules
- local autosave
- draft/completed
- trend question
- event reminders
- explicit No/unknown semantics

At this point the app becomes personally usable.

## Milestone 3 — Event Logging

Implement:
- event definitions
- Quick Log
- pinned events
- exact/unknown times
- duration events
- repeated events
- event fields
- treatment linking
- effectiveness

## Milestone 4 — History

Implement:
- calendar
- completion state
- event icons
- day details
- edit
- soft delete
- History search
- last occurrence
- days since
- calendar metric visualization

## Milestone 5 — Production Sync

Turn sync spike into:
- full data sync
- batch writes
- recovery
- soft deletes
- revisions
- sync status
- replacement Sheet
- backup/export

## Milestone 6 — Trends V1

Implement:
- metric cards
- time series
- heatmap
- event overlays
- basic event stats
- basic relationship exploration
- dashboard preferences

## Milestone 7 — Android Packaging + Widget

Implement:
- Capacitor Android build
- local widget-state bridge
- simple Glance widget
- deep links

## Milestone 8 — Polish

- theme
- animations
- accessibility
- onboarding refinement
- empty states
- cute hero content
- documentation
- public setup process

---

# 122. ML Development Order — Future

Do not start with a fancy predictive model.

Suggested future sequence:

## Analytics Baselines
- rolling averages
- event-relative summaries
- periodicity
- simple correlations
- lag correlations

## Relationship Discovery
- candidate relationships
- confidence/statistical screening
- user feedback

## Baseline Prediction
Compare against dumb baselines:

```text
yesterday's value
rolling average
seasonal/cycle estimate
```

Any ML model should beat these.

## Personalized ML
Train per target.

Evaluate out-of-sample.

Track model versions.

## Predictions UI
Only after metrics demonstrate useful predictive ability.

---

# 123. Prediction Philosophy

The application should not pretend certainty.

Good:

```text
Acne flare risk: 68%
```

Good:

```text
Energy likely lower than your recent average.
```

Bad:

```text
You will have an acne flare Tuesday.
```

Uncertainty is part of the product.

---

# 124. Personality of Predictions

The application may be playful.

Example:

```text
Expect you'll be a crazy bitch today
```

may be fun for a private personal theme but should not be universal default copy for every public user.

Future copy system could have tone options:
- gentle
- neutral
- playful
- chaotic

The personal build can absolutely be chaotic.

---

# 125. Important Deferred Decisions

These should **not** block coding:

- final application name
- exact icon library
- exact charting library
- exact local persistence package
- exact validation package
- exact ML framework
- final open-source license
- native iOS distribution
- custom icon-file storage method
- advanced theme editor

Architectural interfaces should make these replaceable.

---

# 126. Locked Decisions

The following are considered settled unless implementation uncovers a serious issue:

- React + TypeScript
- Capacitor
- Android-first native build
- web/PWA companion
- GitHub-hosted public web version
- local-first data
- Google Sheet remote copy
- replaceable sync-provider abstraction
- Apps Script attempted first
- custom Trackables
- custom Events
- preset library
- preset packs
- dynamic/conditional questionnaire
- Routine abstraction
- event reminders in nightly check-in
- explicit negative event assertions
- subjective trend tracking
- Event relationships
- generic “Did you treat this?”
- treatment effectiveness
- “Unsure” effectiveness choice
- History search in V1
- History calendar
- calendar visualization mode
- Trends separate from History
- future suggested relationships
- dismissible relationship suggestions
- future prediction-heavy Trends page
- days-since derived features
- no blanket days-since generation
- raw vs derived vs prediction separation
- Trackable versioning
- missing ≠ zero
- theme-token architecture
- future themes
- initial pink/purple fantasy aesthetic
- icon/emoji system
- future custom uploads
- simple V1 widget
- future time-of-day prediction widget
- JSON backup + CSV export
- Google Sheet recovery
- legacy Excel import treated separately

---

# 127. First Codex Instruction

The first coding task should **not** contain the entire feature backlog.

Recommended initial Codex prompt:

> Read `PROJECT_SPEC.md` completely before making changes. Treat it as the architectural source of truth.
>
> Read and obey `AGENTS.md`.
>
> Implement only Milestone 0:
>
> - project structure
> - routing
> - theme/design-token architecture
> - five bottom-nav screens: Home, Trends, History, Trackables, Settings
> - TypeScript domain interfaces for the core entities described in the spec
> - a storage repository interface with an in-memory/local placeholder implementation
> - no Google Sheets sync yet
> - no ML
> - no Android native/widget work yet
> - no large UI framework that makes custom theming difficult
>
> Keep domain logic independent from React components.
>
> Do not hard-code health metrics such as acne or migraine into generic components.
>
> Add tests for the domain-model primitives where appropriate.
>
> Stop after Milestone 0 and summarize architecture decisions, files created, tests run, and any contradictions or risky assumptions you found in the specification.

---

# 128. Final Product North Star

The application should eventually feel like:

**a cute personal journal**
+
**a ridiculously flexible health/symptom tracker**
+
**a user-owned personal dataset**
+
**a data-visualization playground**
+
**a personalized forecasting system**

without requiring:
- a subscription
- a proprietary cloud account
- a company storing the user's health history
- a predefined idea of what the user “should” track

The user should be able to open the application, log the day quickly, forget about it, and later discover patterns they genuinely would not have noticed on their own.

The data model should remain boring, structured, explicit, and versioned.

The experience built on top of it can be cute as hell.
