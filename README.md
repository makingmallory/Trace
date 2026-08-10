# Trace

Trace is a flexible, local-first personal health and pattern tracker. The project is designed to support user-defined Trackables and Events without making any named health condition structurally special.

The name **Trace** is a working project title; `PROJECT_SPEC.md` remains the product and architecture source of truth.

## Current status

Milestone 0 — Technical Skeleton and Milestone 0.5 — Google Sync Spike are complete. The live local-browser spike successfully wrote a generated test record to a user-owned Google Sheet, read it back, and verified an exact ID, value, and timestamp match.

The current foundation includes:

- a Vite-powered React and TypeScript application
- route-based placeholders for Home, Trends, History, Trackables, and Settings
- responsive bottom navigation
- semantic theme and design tokens with an initial fantasy-inspired palette
- core domain interfaces that preserve versioning and missing-data meaning
- a `DataRepository` boundary with an in-memory placeholder
- intentionally small provider boundaries for sync, analytics, predictions, and assets
- foundational domain tests
- a test-only `SyncProvider` round-trip implementation and developer screen
- a bound Apps Script proof of concept under `apps-script/`

No Daily Check-In, Event logging, real local persistence, production sync, analytics, predictions, or Android code is implemented yet.

Apps Script is the current preferred V1 sync direction, but production authorization, endpoint security, per-user setup, recovery, and multi-platform testing remain intentionally deferred. See [the Google sync spike record and setup guide](docs/google-sync-spike.md). Never use the spike endpoint for personal or health data.

## Setup

Requirements:

- Node.js 24 or another version supported by the installed Vite release
- npm

Install dependencies:

```powershell
npm.cmd install
```

The `.cmd` form is recommended on Windows when PowerShell script execution prevents `npm.ps1` from running. On systems without that restriction, regular `npm` commands work too.

If this Windows machine reports `UNABLE_TO_VERIFY_LEAF_SIGNATURE`, keep npm's strict SSL checking enabled and ask Node to trust the Windows certificate store for that install:

```powershell
node --use-system-ca "C:\Program Files\nodejs\node_modules\npm\bin\npm-cli.js" install
```

## Development

Start the local development server:

```powershell
npm.cmd run dev
```

Run the foundational tests:

```powershell
npm.cmd test
```

Check TypeScript:

```powershell
npm.cmd run typecheck
```

Create a production build:

```powershell
npm.cmd run build
```

The app uses hash-based routing and a relative Vite base path so a future static build can run under a GitHub Pages repository path without server-side route rewrites.
