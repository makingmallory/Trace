# Google Sheets sync spike

Milestone 0.5 proves that Trace can send a generated test record through the `SyncProvider` boundary to a user-owned Google Sheet and read the exact record back through Google Apps Script. The developer tool remains available for future regression testing, but the endpoint is not production sync and must not be used for health data.

## Outcome: live browser round-trip passed

The live test succeeded from the normal local browser build on August 10, 2026:

- endpoint responded;
- test record was written to the `SyncSpike` Sheet tab;
- the same record was read back;
- ID, value, and timestamp matched exactly.

The test used an ordinary cross-origin `fetch`, a simple `text/plain` POST, and normal redirect following. It did not use JSONP, `no-cors`, an embedded secret, or a proxy. This removes browser CORS and Apps Script Content Service redirects as blockers for the tested local-browser deployment.

The spike does not prove production schema sync, authentication, conflict handling, batching, recovery, GitHub Pages behavior, or Capacitor Android behavior.

## V1 direction

Google Apps Script remains the preferred V1 sync approach because the live round-trip worked, the spreadsheet remains user-owned, and Trace can avoid operating a centralized health-data backend. Google-specific behavior remains isolated behind `SyncProvider`, so this decision can be revisited without changing React screens or domain logic.

This is a provider-direction decision, not approval to implement production sync before Milestone 5.

## Before you begin

Use a dedicated test spreadsheet. The deployed spike accepts only the generated test-record shape; do not add personal or health information.

## 1. Create a dedicated test Sheet

1. Open [Google Sheets](https://sheets.google.com).
2. Create a blank spreadsheet.
3. Name it `Trace Sync Spike - Test Only`.
4. Do not put personal or health data in this spreadsheet.

## 2. Add the bound Apps Script

1. In the spreadsheet, choose **Extensions → Apps Script**.
2. In the Apps Script editor, open `Code.gs`.
3. Replace its contents with the complete contents of [`apps-script/Code.gs`](../apps-script/Code.gs).
4. Open **Project Settings** and enable **Show "appsscript.json" manifest file in editor**.
5. Open `appsscript.json` in the editor and replace its contents with [`apps-script/appsscript.json`](../apps-script/appsscript.json).
6. Save the project and name it `Trace Sync Spike`.

The manifest requests access only to the current spreadsheet. The script creates a tab named `SyncSpike` with four columns: `id`, `value`, `createdAt`, and `receivedAt`.

## 3. Authorize and deploy the test web app

1. In Apps Script, choose **Deploy → New deployment**.
2. Next to **Select type**, choose **Web app**.
3. Set the description to `Trace Milestone 0.5`.
4. Set **Execute as** to **Me**.
5. Set **Who has access** to **Anyone**.
6. Select **Deploy**.
7. Complete Google's authorization prompt for the current spreadsheet.
8. Copy the **Web app URL**. Use the deployed URL ending in `/exec`, not a test URL ending in `/dev`.

If **Anyone** is unavailable because of a Google Workspace policy, stop. An authenticated browser flow would require a different spike and is intentionally outside this milestone.

## 4. Run Trace locally

From the Trace project folder:

```powershell
npm.cmd run dev -- --host 127.0.0.1
```

Open the exact local URL printed by Vite, then go to **Settings → Open sync spike tool**. You can also open `#/sync-spike` directly.

## 5. Run the round-trip

1. Paste the Apps Script `/exec` URL into **Test endpoint URL**.
2. Select **Run round-trip test** once.
3. Wait for all four checks:
   - endpoint responded;
   - test record write completed;
   - the same record was read back;
   - ID, value, and timestamp matched exactly.
4. Open the Google Sheet and confirm that the `SyncSpike` tab contains the generated row.

The endpoint URL is kept only in the page's React state and is not saved to source control or browser storage.

## Expected failure signals

- **Failed to fetch** or a browser console CORS message: Apps Script Content Service is not usable directly from this browser origin under the selected deployment.
- HTML instead of JSON: deployment access is requiring a Google sign-in or the wrong URL was copied.
- HTTP error: deployment permissions or Apps Script execution failed.
- Read-back mismatch: the Sheet transport changed or failed to preserve the test record.

Do not use `mode: "no-cors"`; it prevents Trace from verifying the response. Do not switch the read to JSONP; Google documents JSONP as read-only and warns against using it for sensitive information.

## Remaining production concerns

### Endpoint and security implications

Deploying as **Me** with access set to **Anyone** means anyone who obtains the `/exec` URL can invoke the script with the spreadsheet permissions granted to the deployment. The URL is a locator, not a secure credential. This is acceptable only for a disposable test sheet containing non-sensitive data.

For production:

- the endpoint URL must not be treated as authentication or a secret;
- CORS behavior is a browser transport control, not authorization;
- an exposed endpoint could be invoked outside Trace and consume Apps Script quotas;
- the production script must strictly validate operations and data, limit its spreadsheet permissions, and provide a clear disconnect/revocation path;
- deployment ownership, redeployment, endpoint replacement, and lost-Sheet recovery need explicit handling.

Trace must not send user data until the production authorization and abuse model is resolved.

### Per-user setup friction

The current self-managed flow requires each user to:

1. create or choose a Google Sheet;
2. add the Apps Script and manifest;
3. approve spreadsheet access;
4. deploy a web app with the correct execution and access settings;
5. copy the `/exec` URL into Trace;
6. redeploy when the script changes.

This preserves user ownership but is a substantial onboarding burden. Google Workspace policies may also prevent **Anyone** deployments. Production V1 needs unusually clear setup, validation, reconnect, update, and troubleshooting guidance if this remains the distribution model.

### Future authentication and provider alternatives

Apps Script remains preferred for V1, while these alternatives stay open behind `SyncProvider`:

- an Apps Script deployment that executes as the accessing user, with an explicit Google authorization flow;
- direct Google Sheets API access using per-user OAuth;
- an optional, narrowly scoped authenticated relay for users who prefer easier setup;
- local-only operation plus manual export for users who do not connect Google.

Production sync should compare these options specifically on privacy, authorization clarity, public/open-source setup, browser and Capacitor support, revocation, quota behavior, and long-term maintenance. No alternative is implemented in this spike.

## Google references

- [Deploy Apps Script as a web app](https://developers.google.com/apps-script/guides/web)
- [Content Service redirects and browser JSONP warning](https://developers.google.com/apps-script/guides/content)
- [Apps Script web app access and execution identities](https://developers.google.com/apps-script/manifest/web-app-api-executable)
