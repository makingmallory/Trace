# Trace

Trace is a flexible, local-first personal health and pattern tracker. Everything tracked is a user-defined Trackable with Daily Value or Occurrence record semantics and independently configured Nightly/Quick Log entry surfaces; no named health condition is structurally special. `PROJECT_SPEC.md` is the product and architecture source of truth.

## Current status

Milestones 0–7 are implemented through Android packaging and the first home-screen widget. Trace keeps IndexedDB as its offline-first working copy and can maintain a normalized, versioned replica in a user-owned Google Sheet.

The current implementation includes:

- Vite, React, and TypeScript
- Home, Daily Check-In, event logging, History, Trackables, and Settings flows
- semantic theme/design tokens and responsive navigation
- versioned domain entities that preserve missing-data and date/time meaning
- IndexedDB and in-memory `DataRepository` implementations
- production Google Sheets `SyncProvider` batching, incremental checkpoints, conflicts, tombstones, reconnect recovery, and status
- full-fidelity JSON backup export
- a bound production Apps Script endpoint under `apps-script/`
- Trends V1 summaries and time-series views
- a Capacitor Android application (`app.trace.tracker`) with native back/deep-link handling
- Android JSON sharing, system-browser external links, and a compact quick-action widget
- launcher, adaptive, splash, PWA, and in-app branding generated from `Trace.png`
- domain, persistence, protocol, and reconciliation tests

Predictions, advanced analytics, configurable widget shortcuts, and broader polish remain deferred to later milestones.

See [Google Sheets backup setup](docs/google-sync-setup.md) for setup, recovery, workbook format, and the important anonymous-deployment security limitation. The [Milestone 0.5 sync spike](docs/google-sync-spike.md) remains only as a historical record.

See [Android development and widget architecture](docs/android.md) for native setup, build commands, data boundaries, and current device-testing limitations.

## Setup

Requirements:

- Node.js 24 or another version supported by the installed Vite release
- npm

Install dependencies:

```powershell
npm.cmd install
```

The `.cmd` form is recommended on Windows when PowerShell script execution prevents `npm.ps1` from running. If npm reports `UNABLE_TO_VERIFY_LEAF_SIGNATURE`, keep strict SSL enabled and ask Node to trust the Windows certificate store:

```powershell
node --use-system-ca "C:\Program Files\nodejs\node_modules\npm\bin\npm-cli.js" install
```

## Development

```powershell
npm.cmd run dev
npm.cmd test
npm.cmd run typecheck
npm.cmd run lint
npm.cmd run build
```

The app uses hash-based routing and a relative Vite base path so a static build can run under a GitHub Pages repository path without server-side route rewrites.
