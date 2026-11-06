# Viewer location controls and connected Test APK

Adds **My location** and **View shipment** above the admin, vendor/rider and customer tracking maps; admin also has **View all deliveries**. The implementation preserves the separately released provider/referrer fixes from deployment-branch commit `797f83f403e59f198ce14dafdd6c7d36531f0ec2`. This release does not include the unmerged marketing redesign or a wallet implementation.

## What the controls do

My location requests one foreground device fix only after a tap. Browser pages use `getCurrentPosition` with a timeout and no cached fix; the updated Android app uses an independent native LocationManager request, accepting approximate permission. Android 30+ uses `getCurrentLocation`, older supported versions use a single update. Old/invalid native fixes are rejected, requests time out/cancel cleanly, and request IDs prevent late replies from completing a newer request.

A blue device dot and its actual accuracy circle are distinct from shipment-holder markers. Broad accuracy fits a broader view rather than pretending to be precise. Permission denial, timeout and unavailable services have explanatory messages and a retry through My location. Desktop location may be less accurate than phone GPS. The blue fix is kept only in memory, not uploaded or stored in accounts, and is labelled as the last requested device fix.

The viewer path never requests notification permission, starts/stops the tracking service, changes GPS-sharing consent, uploads a shipment fix, or changes custody. Existing explicit rider sharing remains an independent feature. There is no `watchPosition` in the viewer module. OS location permission is still required; it is not bypassed.

View shipment centres the selected shipment's authorized fix; missing/freshness failures are explained and never filled with viewer coordinates. Admin can explicitly view grey last-known positions when its existing stale-position option is selected. View all deliveries fits only authorized shipment positions matching the current filters and excludes the viewer dot.

The public five-second refresh and app background refresh now retain the map DOM/control instance, viewer fix, pending requests, focus, page scroll and viewport for the same shipment. Unchanged provider configuration retains its tile layer. A newly arriving shipment fix does not pull the map away after the viewer has chosen a view. Temporary public-feed failure retains the displayed delivery/map with a reconnect message. Original tracking tokens, callbacks, accounts, waitlist, database and hosting configuration remain unchanged.

## Screenshots and tests

- [Admin](admin.png)
- [Vendor](vendor.png)
- [Rider](rider.png)
- [Customer tracking](customer.png)
- [Browser evidence](browser-evidence.json)

Screenshots use static fictional shipment data and controlled one-pixel provider tiles. They demonstrate the controls/states, not working live MapTiler geography or actual device GPS.

`node tests/map-viewer-ui.mjs` covers the actual four map views, real Chromium geolocation permission grant/denial/retry, 1.5km approximate accuracy, controlled timeout/unavailable callbacks, missing shipment GPS, separate viewer layers, a six-second fix surviving a five-second public refresh, retained map/viewport across polling, explicit shipment/all-delivery views, and zero shipment-location/custody writes. Existing read-only POST `/api/v3/shipments/snapshot` polls are counted separately; they are not GPS uploads. Native bridge success/denial/timeout/late-callback contracts are simulated in the browser.

Server/unit suite: **62 passed, 4 environment-dependent skips**. Four-view provider switching/fallback, the 2,000-shipment operations UI, and route/pricing quiet-refresh suites pass. `node tests/viewer-apk-assets.mjs` verifies the exact tested map modules/CSS/current app code in the APK, compiled native bridge methods and the unchanged Render backend. The APK-extracted full browser smoke flow passes signup/ID and profile handling, account verification contracts, shipment/payment/custody/OTP/tracking with simulated providers. These are not live provider or Android OS tests.

## Signed Android download

[SendRack Test 0.7.2-test.1 APK](../../downloads/SendRack-Test-0.7.2-test.1.apk) · [SHA-256](../../downloads/SendRack-Test-0.7.2-test.1.apk.sha256) · [build evidence](apk-evidence.json).

- Application ID `ng.sendrack.test`, version code **2**, label **SendRack Test**.
- Backend `https://sendrack-api.onrender.com`; API 26 minimum, target 35.
- v2/v3 signatures verified. Certificate SHA-256 remains `d34b55d2982e55a2623157423ba2ad634ce2844c482144b53f53d88f0b8ecfa5`, the retained separate Test signing identity.
- Can update the previous SendRack Test installation with the same package/key. Installs alongside original `ng.trackship.app`; no original-app uninstall or replacement key is required. Original-app local records do not automatically transfer to Test.
- Corrects the native asset allowlist for the previously packaged `map-display.mjs`, and includes viewer module/styles in both build scripts and the native allowlist. The original app's manifest/signing pin remain intact; an original-identity update still needs its original key.

## Remaining verification

No physical Android device, emulator or iPhone/Safari OS runtime is available. Actual Android approximate/precise permission dialogs, disabled-location behavior, indoor/outdoor fixes, app backgrounding and hardware accuracy require a device pass. No claim is made that browser bridge simulation tests the Android permission manager.

Render and MapTiler remain blocked by this environment's outbound policy. The deployment branch can contain the code without proving Render has deployed it; compare `/api/version` with the merged commit once reachable. No live tile responses, production key values or physical GPS results are claimed. This feature needs no new provider credentials, services or paid resources. Keep existing MapTiler restrictions and Render settings intact. HTTPS (or local loopback for development) and user location permission are required in browsers.
