# Trace Android development

Milestone 7 packages the existing React application with Capacitor. The web/PWA and Android app use the same UI, domain services, IndexedDB repository, and optional Google Sheets sync provider. Native code is limited to Android shell behavior, deep links, file sharing, and the widget bridge.

## Application identity and requirements

- App name: `Trace`
- Android application ID: `app.trace.tracker`
- Minimum Android SDK: 24
- Target/compile SDK: 36
- Node.js and npm as documented in the root README
- Android Studio with the SDK above and its compatible bundled JDK (AGP 8.13 requires JDK 17 or newer)

Browser/PWA IndexedDB and installed-app IndexedDB are separate storage origins. Installing the Android app does not copy browser data. Use the connected Google Sheet recovery path to rebuild a new install when needed.

## First-time setup and normal workflow

```powershell
npm.cmd install
npm.cmd run android:sync
npm.cmd run android:open
```

`android:sync` first produces the normal Vite production build, then copies it and the Capacitor plugin configuration into the tracked Android project. Ordinary web development remains `npm.cmd run dev`; native rebuilding is not required for normal browser work.

Useful verification commands:

```powershell
npm.cmd run android:build
npm.cmd run android:lint
```

The debug APK is written to `android/app/build/outputs/apk/debug/app-debug.apk`. Android Studio can also run the `app` configuration on an emulator or attached device.

## Routing and native shell behavior

Trace retains hash routing for GitHub Pages and the PWA. Widget intents use the private `trace://` scheme and are validated by an allow-listed TypeScript parser before navigation:

- `trace://home`
- `trace://check-in`
- `trace://events`
- `trace://settings/nightly-check-in`
- stable-ID event/Trackable routes supported by the parser for future shortcuts

The same URL listener handles cold and warm starts. Invalid or obsolete links are ignored safely. Android Back closes an open native HTML dialog first, then follows router history, returns to Home when needed, and exits only from Home. External HTTP(S) links marked for a new window open in the system browser. The native status/splash settings are centralized in `capacitor.config.ts` and `src/platform/NativeAppCoordinator.tsx`.

JSON backup export uses a cache file plus the Android share sheet; the browser build retains its download behavior. Trace currently has no implemented JSON import UI, so Milestone 7 does not add a native picker or change the backup format.

## Widget architecture

Native widget code lives in `android/app/src/main/java/app/trace/tracker/` and widget resources live under `android/app/src/main/res/`. It uses Android `RemoteViews`/`AppWidgetProvider` for a small, dependency-free V1 widget.

The React coordinator publishes a versioned snapshot through the `TraceWidget` Capacitor plugin. Only these display fields enter native `SharedPreferences`:

- active routine stable ID and current display name
- whether a configured check-in is available
- today's `not_started`, `draft`, or `completed` state
- snapshot timestamp

No observations, history, notes, Google credentials, or IndexedDB contents are copied. Snapshots refresh on Android app launch/resume and relevant local repository changes. Publishing failures are non-fatal and never affect local saves.

The widget shows Trace branding, current check-in status, a Check in/Resume/Review (or Set up) action, and Quick log. Taps deep-link into the existing Trace flows; native code does not evaluate routine rules or save health data. Empty or stale native state falls back to opening Trace/setup. Multiple widget instances share the same small application-level snapshot.

Configurable Trackable shortcuts, per-widget configuration, direct native data entry, charts, predictions, and time-of-day layouts are intentionally deferred.

## Branding assets

The repository root `Trace.png` is the unchanged source artwork. Resized copies provide:

- Android legacy, round, and adaptive foreground launcher resources for all standard densities
- Android splash resources and the Android 12+ splash icon
- PWA 192/512 icons, maskable manifest entry, favicon, Apple touch icon, and in-app header mark

The adaptive background is centralized in `res/values/ic_launcher_background.xml`. Run `npm.cmd run brand:assets` on Windows to regenerate every derived PNG from `Trace.png`; the script resizes or centers the intact artwork and never edits the source file.

## Manual device checklist

Static/build checks cannot prove Android lifecycle and launcher behavior. Before release, verify on an emulator and physical device: install/relaunch persistence, offline logging, Google sync, system Back, keyboard-heavy forms, external links, backup sharing, widget placement/resizing, cold/warm widget taps, empty and configured widget states, app process restart, and status/navigation bar contrast. Launcher masking varies by OEM and should be inspected on at least a round and squircle launcher.

## Milestone 7 verification status

As of August 11, 2026:

- Implemented: Capacitor project, native integration adapters, deep links, back handling, external browser/file sharing behavior, widget snapshot bridge/provider/UI, safe-area/system-bar configuration, and Trace artwork assets.
- Build-verified: TypeScript, lint, full Vitest suite, production Vite build, Capacitor Android sync, Android XML parsing, manifest/permission review, and production dependency audit.
- Browser-tested: production Home, Check-In setup, Quick Log, History, Trackables, Trends, Settings/sync UI, branding load, and the 320px responsive navigation layout.
- Not Android-build-verified in this environment: Gradle debug build and Android lint, because no JDK or Android SDK is installed.
- Not emulator- or physical-device-tested: lifecycle persistence, Google network sync in WebView, Android share sheet, system Back, keyboard behavior, launcher masking, widget placement/resizing, and cold/warm widget taps.
