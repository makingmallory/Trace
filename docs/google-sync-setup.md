# Google Sheets backup setup

Trace is local-first. IndexedDB is the working copy; this Google Sheet is a user-owned replica for recovery and inspection. Logging remains available when the Sheet or internet is unavailable.

## Create a new backup

1. Create a blank Google Sheet dedicated to Trace.
2. Choose **Extensions → Apps Script**.
3. Replace `Code.gs` with [`apps-script/Code.gs`](../apps-script/Code.gs), and replace the manifest with [`apps-script/appsscript.json`](../apps-script/appsscript.json).
4. Save, then choose **Deploy → New deployment → Web app**.
5. Set **Execute as** to **Me** and **Who has access** to **Anyone**. Authorize access only to the current Sheet.
6. Copy the deployed URL ending in `/exec`.
7. In Trace, open **Settings → Google Sheets backup → Set up backup**, paste the URL, and connect.

Trace validates the format before saving the connection. The first sync creates deterministic normalized tabs, then uploads local configuration and history in batches. Redeploy the Apps Script after updating its source; use the new `/exec` URL in **Manage backup** if Google changes it.

## Connect an existing backup

Use **Connect existing backup** and paste the `/exec` URL from the Apps Script bound to that existing Trace Sheet. Trace pulls and validates the complete remote dataset before applying it. An empty device is rebuilt from the Sheet. If local records already exist, Trace merges by entity type and stable ID; it does not clear local storage or blindly replace either side. Concurrent edits of the same record are reported as conflicts and neither copy is overwritten.

Connecting a Sheet establishes ongoing sync. **Import backup** is a separate one-time restore concept; JSON backup import is intentionally not disguised as Sheet connection.

## Workbook format

`Meta` stores `format`, sync/schema versions, and the global checkpoint. Canonical tabs are:

- `Categories`, `Trackables`, `TrackableVersions`, `TrackableOptions`, `TrackableFields`
- `Routines`, `RoutineItems`
- `LogRecords`, `Observations`, `ObservationSelections`, `TrackableDailyAssertions`
- legacy `EventDefinitions`, `EventFields`, and `EventDailyAssertions` tabs when upgrading schema v1
- `Relationships`, `RelationshipAssessments`, `Settings`

Every row stores its stable `id`, entity `revision`, server `remoteRevision`, creation/update timestamps, tombstone timestamp, and optional origin device. Entity fields have deterministic columns. Structured fields are JSON values in their named columns so arrays, nested rules, `null`, zero, and false remain unambiguous and machine-readable. Rows are stable-ID upserts; retrying a batch does not append duplicates. Direct editing of canonical tabs is not supported in V1.

## Incremental sync and conflicts

The Sheet assigns a monotonically increasing remote revision to each accepted row change. Trace pulls only rows newer than its stored checkpoint and uploads only records whose fingerprint differs from their last acknowledged copy. Pushes contain the last known remote revision. If the Sheet changed after that base and contents differ, the endpoint returns a conflict instead of overwriting either copy.

Tombstones remain rows with `deletedAt`. Restoring increments the entity revision, clears `deletedAt`, and upserts the same stable ID. Remote rows are not hard-deleted.

## Security and privacy tradeoff

The Apps Script manifest is limited to the bound spreadsheet, and Trace adds no telemetry or centralized backend. Connection URLs are stored only in local browser/app storage and are excluded from exports and source control.

The V1 browser-compatible deployment has an important limitation: **Anyone** access means possession of the deployed `/exec` URL is sufficient to call the script. The URL is high-entropy but is not authentication. Someone who obtains it could read or modify Trace data and consume Apps Script quotas. Do not publish, commit, message broadly, or place this URL in the Sheet itself. Disconnecting Trace only removes the local connection; to revoke access, disable the Apps Script deployment in Google and create a new deployment URL.

Google Workspace policies may prohibit anonymous web apps. In that case this provider cannot be used; continue locally and use JSON export. A future provider can add per-user OAuth behind the same `SyncProvider` boundary without changing the domain or UI.

## Recovery and failure behavior

- Ordinary offline behavior is shown as offline, not data loss. Local changes wait for launch/resume, connectivity return, the five-second post-change debounce, or **Sync now**.
- If the Sheet is missing or the deployment is unavailable, local data remains intact. Reconnect a valid backup, attach a replacement blank Sheet (which rebuilds from local data), or continue locally.
- A pull is fully parsed first, then accepted remote records and checkpoint metadata are applied in one IndexedDB transaction. Push batches can succeed separately; acknowledged batches remain idempotent if a later batch fails.
- Trace cannot atomically transact the browser database and Google Sheets together. Checkpoints, stable-ID upserts, and idempotent retries minimize this unavoidable cross-system boundary.
