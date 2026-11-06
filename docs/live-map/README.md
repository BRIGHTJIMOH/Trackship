# Live Operations Map — implementation and review

This change adds the map to the existing owner/super-admin **Overview**, below the KPI cards. It is a separate change on top of dispatch preview PR #8, commit `f5f1ee40250165f7cdbc54abe4d739896fafbf12`. Neither the preview stack nor this map has been deployed. The in-progress individual-staff/security work remains intact on its separate workspace/branch; it is not silently included in this map PR.

## Behavior

- Existing Leaflet and `publicMapConfig` are reused: configured MapTiler tiles via the existing public display key, otherwise the existing OpenStreetMap pilot fallback. Attribution is retained. There is no new map subscription, geocoder, directions API, paid resource or dependency.
- State, city, saved route, delivery status, custody-chain and shipment-reference/city search filters. A detail side panel shows the selected shipment's current custody leg, stage, receipt/observation times, reported accuracy and safe checkpoint history. It omits customer/handler names, contacts, precise delivery addresses, documents, payment data, tracking tokens and codes.
- Intrastate and interstate records use their actual recorded custody. Pickup, carrier and final delivery have distinct colours; mixed-stage clusters have a separate colour. No route, movement or arrival estimate is fabricated.
- Same-carrier parcels with independently authorized GPS fixes of the same freshness class within 75 metres are grouped around the latest **actual** fix. Each parcel retains its own timestamps; a fresh parcel never upgrades another parcel's stale GPS. `C` identifies a single-carrier batch. Screen-space grid clustering groups nearby/overlapping points as zoom changes. Cluster entries and the active-shipment list allow individual selection; search narrows large groups.
- Markers are reconciled by cluster key. The Leaflet map and its DOM node survive Overview refreshes and dashboard dialogs; no periodic `fitBounds`, page reload or replacement of filter/form nodes occurs. The map fits available fresh fixes once on initial load. Panning/zooming changes only the view; explicit “Locate recorded fix” pans to a recorded coordinate without inventing a route.
- The feed polls every 10 seconds while Overview is visible, with at most one in-flight map request. Requests time out after 15 seconds. Reconnect backoff is bounded at 60 seconds, and the manual reconnect button retains filters, zoom, centre and selection. Hidden/navigated-away views stop polling; logout clears the map and its cached records.
- Full initial/scope-reset snapshots and cursor-based upsert/removal deltas. Three recent hash snapshots per authorization scope are retained in bounded memory (up to 16 scopes). Unknown/evicted cursors return a safe reset; the client retains its view while replacing only authorized records.
- Needs Attention covers incidents/disputes, paid-unassigned or unpaid jobs, missing/stale/low-accuracy GPS, absent observation timestamps, checkpoint stalls, exhausted dispatch searches, delayed/failed notifications and stalled/expired v5 handovers when those tables exist. Lists show totals and cap rendered rows; filtering/search still covers the entire authorized feed. Missing GPS is not replaced with a city centre or a pickup coordinate.

## GPS and custody guarantees

Only v3/v5 positions tied to the **current** custody leg, current actor, explicit per-shipment consent and an active, nonsuspended rider session qualify. Unsupported custody chains, revoked sessions/consent, incidents and mismatched previous-holder fixes cannot supply a position. Delivered and cancelled shipments are excluded and sent as removals on the next successful feed update. Existing completion handlers clear GPS and reject further tracking updates.

A recent fix requires both a valid device observation time and a server receipt time less than two minutes old, with future observations rejected. The browser uses server time plus a conservative round-trip allowance and monotonic elapsed time; it expires markers locally even when the feed disconnects. It does not make the last received position “current” by changing its timestamp.

Grey, explicitly labelled last-known positions are opt-in. Recent fixes during a disconnected feed are visibly disconnected and described as last received, not guaranteed live movement. Once expired they disappear unless last-known display is selected. Connection and tile failures have separate status messages; neither discards edited dashboard forms.

Older v3 clients did not include device observation time. Their positions remain compatible with the existing upload API but are treated as last-known on this map. The browser uploader now includes observation time, and the Android `TrackingService` source adds `Location.getTime()`. The server validates supplied timestamps and records receipt time independently. New v5 positions also record receipt time. Existing Android APKs are not rebuilt or re-signed here; the original signing key remains absent, and no replacement key was generated. The Android source change is not a physical-device or APK-build verification.

## Authorization

`GET /api/admin/live-operations` authorizes on every request, before reading records or accessing snapshot history. The existing authenticated owner session is explicitly mapped to super-admin access; shared machine operator tokens are **not** accepted as map credentials. Vendor/rider sessions and anonymous requests are denied. The feed accepts an internal operations authorization adapter requiring `dispatch.read`; other roles are rejected. When the adapter supplies a shipment-ID scope, records and delta history are separated by that scope, preventing another scope's cursor revealing records.

This PR does not issue new operations-staff credentials. PR #8's adapter currently supports the owner authenticator flow; individual operations staff accounts depend on the separate staff-security release. Connecting that release must use its server-side role/MFA authorization callback, never a browser-supplied role. Owner Overview access works with the existing owner session and does not require changing production credentials.

Filters/search are presentation controls, not permission checks. All records sent to the browser have already been authorized. No endpoint allows the map to assign handlers, change custody, pay, reveal documents or write GPS.

## Validation

- `npm test`: **78 tests: 74 passed, 4 PostgreSQL-environment checks skipped, zero failed**.
- New tests cover owner/anonymous/vendor/rider/machine-token restrictions, unsupported roles, isolated operation scopes/cursors, minimal payloads, stale/future/missing timestamps, consent/session withdrawal, invalid/previous-holder custody, both custody chains, same-carrier grouping, overlapping markers, filters, delta updates and terminal removal.
- `npm run test:live-map`: Chromium browser test seeds **2,000 static sample active shipments / 60 sample carriers** in an isolated database, checks clustering and cluster selection, two refresh cycles preserving the actual Leaflet instance, DOM identity, zoom/centre/filter/search/selection, connection loss and local GPS expiry, optional grey last-known markers, safe reconnect, handover invalidation and delivery removal. Screenshots check containment at 1366×768, 1920×1080 and 390×844.
- `node tests/admin-refresh-ui.mjs`: existing route/pricing draft values, focus/selection, scroll, serialized reads, failure recovery, save/conflict and navigation checks passed.
- Existing `npm run test:admin` passed on a diagnostic rerun. One initial run timed out waiting for the unchanged vendor route-picker step; the diagnostic rerun passed without changes to that path. This timing failure is recorded rather than treated as a clean first pass.
- `git diff --check` passes.

Exact local performance figures are in [performance.json](performance.json): roughly **1.51 MB** for the initial 2,000-record snapshot, one concurrent feed request, and six rendered clusters at the tested overview zoom. Local Node projection/grouping of 2,000 records took approximately 22–37 ms in separate runs. Browser initial feed/render was approximately 0.64–1.10 seconds in the observed local runs; these are not a production latency guarantee. Delta responses omit unchanged shipments.

All screenshots use **local sample records and mocked blank PNG tiles**. GPS values are static test fixtures, not actual devices, simulated production movement or evidence of real native background tracking. No live Render, real tile/provider billing, physical Android/iPhone or PostgreSQL multi-instance performance test was performed. The managed environment still blocks the live Render hostname and map-provider destinations.

## Screenshots

| View | Local sample-data screenshot |
| --- | --- |
| Laptop 1366×768 | [Overview laptop](overview-1366.png) |
| Desktop 1920×1080 | [Overview desktop](overview-1920.png) |
| Mobile 390×844 | [Overview mobile](overview-mobile.png) |

## Hosting, scaling and deployment

No Render resources, plans, environment settings, database records, signing files or saved accounts have been changed. `/`, `/app`, `/admin`, waitlist, payment callbacks and existing tracking links remain in place. There is no new provisioning or charge to approve for this implementation.

The current feed reads JSON shipment records and creates small in-memory hash snapshots. This is appropriate for the measured pilot test, not an unlimited fleet/history/concurrent-user guarantee. Growing historical records or many operators increases database scan, serialization, memory and egress costs. At the measured 1.51 MB snapshot size, if **every** active record changes on every 10-second poll, raw payload traffic is about **545 MB/hour per open operator** before compression; real histories/payloads may be larger. Stable/partially changing fleets use smaller deltas. Viewport culling, carrier grouping and clustering reduce rendered markers, not all database/network work.

Before larger production rollout, measure the actual mix of active/history records and concurrent operators. Indexed active-shipment/location tables, cached materialized snapshots, narrower update events or streaming may be necessary. Always-on Render capacity for continuous availability, database/storage/egress growth, and MapTiler request quotas may require paid plans. OpenStreetMap's public pilot tiles are not an unlimited commercial fleet SLA. Review current provider quotas/pricing and obtain a concrete budget decision **before** provisioning or changing plans. The existing free web service can sleep, so the map truthfully reports unavailable/stale data rather than promising 24/7 live updates.

Review this stacked map PR independently of the unfinished staff work. After the underlying PRs and map are reviewed, deploy only to the existing `sendrack-api` service on its configured branch `apk-test-v0.7.0`, preserving its database and keys; do not apply a Blueprint or recreate resources. Confirm the exact deployed commit and test `/admin` → Overview with a real authorized owner account, a consenting current holder's new GPS upload, handover, stale/offline and completion cases. Also check `/`, `/app`, waitlist and old tracking/payment callbacks. Live confirmation remains pending permitted network access and deployment; these local screenshots are not live-site screenshots.
